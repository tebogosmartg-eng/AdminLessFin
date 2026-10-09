/**
 * Live check of Payroll Phase 2b/2c (ETI and the filed EMP201) against the deployed
 * payroll function and database. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-emp201-live.ts
 *
 * Finalises one test run in January 2027, files the EMP201 for that month (filed returns
 * are permanent records, so CERT TX keeps them as superseded/submitted history), then
 * reverses the run and restores the employer's ETI setting.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPANY_NAME = 'CERT TX 1785230675937';
const MONTH = '2027-01';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

function loadEnv() {
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* vars may already be set */ }
}

async function invoke<T>(sb: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let payload = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) { try { payload = JSON.stringify(await ctx.clone().json()); } catch { /* keep */ } }
    throw new Error(`${fn}.${String(body.method)}: ${payload}`);
  }
  return data as T;
}
async function refused(promise: Promise<unknown>): Promise<string> {
  try { await promise; return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

/** A valid 13-digit SA ID for a birth date (Luhn check digit). */
function saId(yymmdd: string, sequence: string): string {
  const twelve = `${yymmdd}${sequence}08`;
  for (let c = 0; c < 10; c++) {
    const id = twelve + c;
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      let d = Number(id[12 - i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    if (sum % 10 === 0) return id;
  }
  throw new Error('no check digit');
}

type EtiLine = { employeeId: string; name: string; remuneration: number; hours: number; paye: number; eti: null | { qualifies: boolean; reason: string | null; cycle: number; eti: number; hoursReported: number; wagePaidHourly: number; minimumWageHourly: number } };
type Declaration = { period: string; paye: number; sdl: number; uif: number; totalPayable: number; eti: { employerEligible: boolean; calculated: number; broughtForward: number; available: number; utilised: number; carriedForward: number }; employees: EtiLine[] };
type Filed = { id: string; period: string; status: string; version: number; immutable?: boolean; journal_entry_id: string | null; submission_reference: string | null; declaration_data: Declaration; superseded_reason?: string | null };

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'payroll', { company_id: companyId, ...body });
  const stamp = Date.now().toString().slice(-6);
  const startedAt = new Date().toISOString();

  const coa = await invoke<Array<{ id: string; name: string; type: string }>>(sb, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const wage = coa.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name))!;
  const bank = coa.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))!;
  const liability = coa.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ?? coa.find((a) => a.type === 'Liability')!;
  const income = coa.find((a) => a.type === 'Income' && /other|sundry|incentive|grant/i.test(a.name)) ?? coa.find((a) => a.type === 'Income')!;

  const profileBefore = await payroll<{ profile: Record<string, unknown> | null }>({ method: 'GET_EMPLOYER_PROFILE' });
  if (!profileBefore.profile) throw new Error('CERT TX needs an employer profile: run run-payroll-employer-profile-live.ts first.');
  const { updated_at: _u, updated_by: _b, company_id: _c, ...profile } = profileBefore.profile;

  const employee = (first: string, extra: Record<string, unknown>) => invoke<{ id: string }>(sb, 'employees', {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: first, last_name: `ETI-${stamp}`, email: `${first.toLowerCase()}.${stamp}@adminless-fin.test`,
      department: 'Certification', position: 'ETI check', employment_type: 'permanent',
      start_date: '2026-06-01', end_date: '2027-01-31', salary_period: 'monthly', ordinary_hours_per_week: 40,
      tax_number: '0001339050', ...extra,
    },
  });

  let runId: string | null = null;
  try {
    await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile: { ...profile, claim_eti: true } });
    // Ages at 31 January 2027: 24 and 45.
    const youth = await employee('Youth', { salary_amount: 6_500, id_number: saId('020510', '5800') });
    const senior = await employee('Senior', { salary_amount: 30_000, id_number: saId('811020', '5800') });
    const low = await employee('Low', { salary_amount: 4_000, id_number: saId('030303', '5800') });

    const run = await payroll<{ id: string }>({ method: 'CREATE_RUN', additional_run: true, runData: { pay_period_start: `${MONTH}-01`, pay_period_end: `${MONTH}-31`, pay_date: `${MONTH}-31` } });
    runId = run.id;
    await payroll({ method: 'GENERATE_PAYSLIPS', runId });
    await payroll({ method: 'APPROVE_RUN', runId });
    await payroll({ method: 'FINALIZE_RUN', runId, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });

    const prepared = await payroll<{ declaration: Declaration; issues: Array<{ severity: string; message: string }>; filed: unknown }>({ method: 'PREPARE_EMP201', month: MONTH });
    const d = prepared.declaration;
    const line = (id: string) => d.employees.find((l) => l.employeeId === id);
    const y = line(youth.id);
    check('Youth (24, R6 500, 40 h/week) qualifies: R750 in the first cycle, 160 hours reported',
      !!y?.eti && y.eti.qualifies && y.eti.cycle === 1 && near(y.eti.eti, 750) && y.eti.hoursReported === 160 && near(y.eti.wagePaidHourly, 37.5), y?.eti);
    check('Senior (45) does not qualify: age', line(senior.id)?.eti?.qualifies === false && /outside 18–29/.test(line(senior.id)?.eti?.reason ?? ''), line(senior.id)?.eti?.reason);
    check('R4 000 at 173 hours is below the R30.23 minimum wage: no ETI', /below the minimum wage/.test(line(low.id)?.eti?.reason ?? ''), line(low.id)?.eti?.reason);
    const sum = (pick: (l: EtiLine) => number) => Math.round(d.employees.reduce((s, l) => s + pick(l), 0) * 100) / 100;
    check('Totals add up from the employee lines', near(d.paye, sum((l) => l.paye)) && near(d.eti.calculated, sum((l) => l.eti?.eti ?? 0)), { paye: d.paye, eti: d.eti });
    check('ETI used is the lesser of ETI available and PAYE; payable = PAYE − ETI used + SDL + UIF',
      near(d.eti.utilised, Math.min(d.eti.available, d.paye)) && near(d.totalPayable, d.paye - d.eti.utilised + d.sdl + d.uif), { eti: d.eti, payable: d.totalPayable });
    check('No blocking issues', !prepared.issues.some((i) => i.severity === 'error'), prepared.issues);

    // File (no ledger posting) and the second-filing guard.
    const versionsBefore = (await payroll<Filed[]>({ method: 'LIST_STATUTORY_RETURNS', returnType: 'EMP201' })).filter((r) => r.period === '202701');
    const active = versionsBefore.find((r) => r.status !== 'superseded');
    let filed: Filed;
    if (active) {
      filed = (await payroll<{ return: Filed }>({ method: 'FILE_EMP201', month: MONTH, replaceReason: 'Live check re-run: refile January 2027' })).return;
    } else {
      filed = (await payroll<{ return: Filed }>({ method: 'FILE_EMP201', month: MONTH })).return;
    }
    check('EMP201 filed, locked, with the prepared figures', filed.status === 'ready' && filed.immutable === true && near(filed.declaration_data.totalPayable, d.totalPayable), { status: filed.status, version: filed.version });
    const again = await refused(payroll({ method: 'FILE_EMP201', month: MONTH }));
    check('Filing the same month again without a reason is refused', /EMP201_ALREADY_FILED/.test(again), again.slice(0, 140));

    // Correction with the ETI journal.
    const corrected = (await payroll<{ return: Filed }>({
      method: 'FILE_EMP201', month: MONTH, replaceReason: 'Correction: post ETI to the ledger',
      postEti: { liabilityAccountId: liability.id, incomeAccountId: income.id },
    })).return;
    check('Correction filed as the next version with the ETI journal posted',
      corrected.version === filed.version + 1 && (d.eti.utilised === 0 || !!corrected.journal_entry_id), { version: corrected.version, journal: corrected.journal_entry_id });
    const versions = (await payroll<Filed[]>({ method: 'LIST_STATUTORY_RETURNS', returnType: 'EMP201' })).filter((r) => r.period === '202701');
    const old = versions.find((r) => r.id === filed.id);
    check('The replaced version is kept as superseded with its reason', old?.status === 'superseded' && old?.superseded_reason === 'Correction: post ETI to the ledger', old?.status);

    if (corrected.journal_entry_id) {
      const { data: items } = await sb.from('journal_entry_items').select('account_id, type, amount').eq('journal_entry_id', corrected.journal_entry_id);
      const dr = (items ?? []).find((i) => i.account_id === liability.id && i.type === 'debit');
      const cr = (items ?? []).find((i) => i.account_id === income.id && i.type === 'credit');
      check('ETI journal: Dr PAYE liability, Cr ETI income, for the ETI used', near(Number(dr?.amount), d.eti.utilised) && near(Number(cr?.amount), d.eti.utilised), items);
      // Replacing the return reverses its journal.
      const third = (await payroll<{ return: Filed }>({ method: 'FILE_EMP201', month: MONTH, replaceReason: 'Correction: file without ledger posting' })).return;
      const { data: incomeLines } = await sb.from('journal_entry_items').select('type, amount, journal_entries!inner(created_at)')
        .eq('account_id', income.id).gte('journal_entries.created_at', startedAt);
      const net = (incomeLines ?? []).reduce((s, l) => s + (l.type === 'credit' ? Number(l.amount) : -Number(l.amount)), 0);
      check('Replacing it reverses the ETI journal (ETI income nets to nil)', Math.abs(net) < 0.01 && !third.journal_entry_id, { net, lines: incomeLines?.length });
    }

    const latest = (await payroll<Filed[]>({ method: 'LIST_STATUTORY_RETURNS', returnType: 'EMP201' })).find((r) => r.period === '202701' && r.status !== 'superseded')!;
    const submitted = await payroll<Filed>({ method: 'RECORD_RETURN_SUBMISSION', returnId: latest.id, reference: `LIVECHECK${stamp}` });
    check('Submission (PRN) recorded', submitted.status === 'submitted' && submitted.submission_reference === `LIVECHECK${stamp}`);
    const badRef = await refused(payroll({ method: 'RECORD_RETURN_SUBMISSION', returnId: latest.id, reference: 'x' }));
    check('A malformed reference is refused', /REFERENCE_INVALID/.test(badRef));

    const direct = await sb.from('statutory_returns').update({ declaration_data: {} }).eq('id', latest.id).select('id');
    check('Filed returns cannot be changed through the API', !!direct.error || (direct.data ?? []).length === 0, direct.error?.message);
    const insert = await sb.from('statutory_returns').insert({ company_id: companyId, return_type: 'EMP201', tax_year: 'x', period: '209901' }).select('id');
    check('Returns cannot be created through the API', !!insert.error, insert.error?.message);
  } finally {
    if (runId) {
      await payroll({ method: 'REVERSE_RUN', runId, reason: 'EMP201 live check clean-up' }).catch((e) => console.log('reverse failed', e.message));
    }
    await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile }).catch((e) => console.log('profile restore failed', e.message));
    console.log(`Run reversed; employer ETI setting restored (claim_eti ${String(profile.claim_eti ?? false)})`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
