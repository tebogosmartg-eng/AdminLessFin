/**
 * Live check of age rebates, period eligibility, pro-rata, year-to-date PAYE and the
 * SDL estimate against the deployed payroll function. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-period-live.ts
 *
 * Scenario (tax year 2026/27):
 *   December 2026 run: finalised, then reversed (cancelled) — must not count as YTD.
 *   January 2027 run: pensioner (turns 65 in Jan 2027), joiner from 16 Jan, leaver who left in December.
 *   February 2027 run: the pensioner's YTD is January only.
 *   A back-dated December run generated after January: January must not count (later pay date).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RULE_SET_2026_2027 } from '../../src/lib/statutoryPayrollEngine/registry';
import { calculateAnnualTax, resolveRebate } from '../../src/lib/statutoryPayrollEngine/utils';

const COMPANY_NAME = 'CERT TX 1785230675937';
const rs = RULE_SET_2026_2027;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;

function loadEnv() {
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* vars may already be set */ }
}

/** A valid SA ID (correct Luhn check digit) for a YYMMDD birth date. */
function saId(yymmdd: string): string {
  const body = `${yymmdd}580008`;
  for (let c = 0; c <= 9; c += 1) {
    const id = `${body}${c}`;
    let sum = 0;
    for (let i = 0; i < 13; i += 1) {
      let d = Number(id[12 - i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    if (sum % 10 === 0) return id;
  }
  throw new Error('no check digit');
}

async function invoke<T>(supabase: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) { try { detail = JSON.stringify(await ctx.clone().json()); } catch { /* keep */ } }
    throw new Error(`${fn}.${body.method}: ${detail}`);
  }
  if (data && typeof data === 'object' && 'error' in data) throw new Error(`${fn}.${body.method}: ${String((data as { error: unknown }).error)}`);
  return data as T;
}

type Slip = {
  id: string;
  employee_id: string;
  total_earnings: number;
  calculation_snapshot?: {
    taxable_earnings?: number;
    engine_results?: Array<{ engine_id: string; employee_amount: number; employer_amount: number; skipped: boolean }>;
    period_employment?: Record<string, unknown>;
  };
  payslip_items?: Array<{ description: string; type: string; amount: number }>;
};

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const stamp = Date.now().toString().slice(-6);

  const coa = await invoke<Array<{ id: string; name: string; type: string }>>(sb, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const wage = coa.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name))!;
  const bank = coa.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))!;
  const liability = coa.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ?? coa.find((a) => a.type === 'Liability')!;

  const employee = (first: string, extra: Record<string, unknown>) => invoke<{ id: string }>(sb, 'employees', {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: first, last_name: `Period-${stamp}`, email: `${first.toLowerCase()}.${stamp}@adminless-fin.test`,
      department: 'Certification', position: 'Period check', salary_period: 'monthly', employment_type: 'permanent',
      bank_name: 'FNB', bank_account_number: '62000000003', bank_branch_code: '250655', tax_number: '0000000000',
      ...extra,
    },
  });
  const pensioner = await employee('Pensioner', { salary_amount: 25_000, start_date: '2020-01-01', id_number: saId('620115') });
  const joiner = await employee('Joiner', { salary_amount: 31_000, start_date: '2027-01-16' });
  const leaver = await employee('Leaver', { salary_amount: 20_000, start_date: '2020-01-01', end_date: '2026-12-31' });
  console.log('Employees:', { pensioner: pensioner.id, joiner: joiner.id, leaver: leaver.id });

  // Reruns reuse these months, so each is an explicit additional run.
  const createRun = (start: string, end: string) => invoke<{ id: string }>(sb, 'payroll', {
    method: 'CREATE_RUN', company_id: companyId, runData: { pay_period_start: start, pay_period_end: end, pay_date: end }, additional_run: true,
  });
  const generate = (runId: string) => invoke(sb, 'payroll', { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId });
  const finalise = async (runId: string) => {
    await invoke(sb, 'payroll', { method: 'APPROVE_RUN', company_id: companyId, runId });
    return invoke<{ journal_entry_id: string }>(sb, 'payroll', {
      method: 'FINALIZE_RUN', company_id: companyId, runId, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id,
    });
  };
  const slipFor = async (runId: string, employeeId: string): Promise<Slip | undefined> => {
    const detail = await invoke<{ payslips: Slip[] }>(sb, 'payroll', { method: 'GET_RUN_DETAIL', company_id: companyId, runId });
    const head = detail.payslips.find((p) => p.employee_id === employeeId);
    if (!head) return undefined;
    return invoke<Slip>(sb, 'payroll', { method: 'GET_PAYSLIP_DETAIL', company_id: companyId, payslipId: head.id });
  };
  const engine = (slip: Slip | undefined, id: string) => slip?.calculation_snapshot?.engine_results?.find((e) => e.engine_id === id);
  const pe = (slip: Slip | undefined) => (slip?.calculation_snapshot?.period_employment ?? {}) as Record<string, number | string | null>;

  // ── December: finalise, then reverse without reopening (cancelled). ──
  const dec = await createRun('2026-12-01', '2026-12-31');
  await generate(dec.id);
  const decSlip = await slipFor(dec.id, pensioner.id);
  check('December: leaver still paid in their last month', !!(await slipFor(dec.id, leaver.id)));
  check('December: joiner (starts 16 Jan) not paid', !(await slipFor(dec.id, joiner.id)));
  await finalise(dec.id);
  const reversed = await invoke<{ reopened: boolean }>(sb, 'payroll', { method: 'REVERSE_RUN', company_id: companyId, runId: dec.id, reason: 'Period live check' });
  check('December run reversed (cancelled, not reopened)', reversed.reopened === false, reversed);

  // ── January. ──
  const jan = await createRun('2027-01-01', '2027-01-31');
  await generate(jan.id);
  const janP = await slipFor(jan.id, pensioner.id);
  const janJ = await slipFor(jan.id, joiner.id);
  const janL = await slipFor(jan.id, leaver.id);

  check('January: leaver (left 31 Dec) not paid', !janL);
  const joinerBasic = janJ?.payslip_items?.find((i) => i.description === 'Basic Salary')?.amount;
  check('January: joiner pro-rated 16/31 of R31 000 = R16 000', near(Number(joinerBasic), 16_000, 0.01), { joinerBasic, factor: pe(janJ).pro_rata_factor });

  check('Pensioner age 65 at tax-year end (from SA ID)',
    pe(janP).age === 65 && pe(janP).age_as_at === '2027-02-28' && pe(janP).age_source === 'id_number', pe(janP));
  check('January: reversed December payslip ignored in YTD', pe(janP).ytd_periods_processed === 0 && pe(janP).ytd_taxable_income === 0, pe(janP));

  const rebate65 = resolveRebate(rs.rebates, 65, { secondaryAge: rs.rebateSecondaryAge, tertiaryAge: rs.rebateTertiaryAge });
  const sarsJan = Math.round((Math.max(0, calculateAnnualTax(25_000 * 12, rs.brackets) - rebate65) / 12) * 100) / 100;
  const janPaye = engine(janP, 'paye')?.employee_amount ?? -1;
  check('January PAYE includes the secondary rebate (SARS)', near(janPaye, sarsJan), { live: janPaye, sars: sarsJan });

  const annual = Number(pe(janP).company_annual_remuneration);
  const sdl = engine(janP, 'sdl');
  check('SDL follows the R500 000 estimate', annual > 0 && (annual <= rs.sdlExemptionAnnualRemuneration ? sdl?.skipped === true : (sdl?.employer_amount ?? 0) > 0), { annual, sdl });
  await finalise(jan.id);

  // ── February: YTD is January only. ──
  const feb = await createRun('2027-02-01', '2027-02-28');
  await generate(feb.id);
  const febP = await slipFor(feb.id, pensioner.id);
  const janTaxable = Number(janP?.calculation_snapshot?.taxable_earnings);
  check('February YTD = January taxable income and PAYE, one period',
    pe(febP).ytd_periods_processed === 1 && near(Number(pe(febP).ytd_taxable_income), janTaxable) && near(Number(pe(febP).ytd_paye_paid), janPaye), pe(febP));
  const febPaye = engine(febP, 'paye')?.employee_amount ?? -1;
  check('February cumulative PAYE consistent with January (same pay)', near(febPaye, janPaye, 0.1), { jan: janPaye, feb: febPaye });
  const joinerFeb = (await slipFor(feb.id, joiner.id))?.payslip_items?.find((i) => i.description === 'Basic Salary')?.amount;
  check('February: joiner paid in full', near(Number(joinerFeb), 31_000, 0.01), joinerFeb);

  // ── Back-dated December regenerated after January was finalised. ──
  const dec2 = await createRun('2026-12-01', '2026-12-31');
  await generate(dec2.id);
  const dec2P = await slipFor(dec2.id, pensioner.id);
  check('Back-dated December ignores the later January run', pe(dec2P).ytd_periods_processed === 0, pe(dec2P));
  check('December age is still 65 (same tax year end)', pe(dec2P).age === 65, pe(dec2P).age);
  void decSlip;

  // ── Clean-up and discard rules: drafts go, processed runs stay. ──
  const refuse = await invoke(sb, 'payroll', { method: 'DISCARD_RUN', company_id: companyId, runId: jan.id }).then(() => null, (e: Error) => e.message);
  check('A processed run cannot be discarded', !!refuse && /never been processed/.test(refuse), refuse);
  const refuseReversed = await invoke(sb, 'payroll', { method: 'DISCARD_RUN', company_id: companyId, runId: dec.id }).then(() => null, (e: Error) => e.message);
  check('A reversed run cannot be discarded', !!refuseReversed, refuseReversed);
  for (const runId of [feb.id, dec2.id]) {
    const res = await invoke<{ discarded: boolean }>(sb, 'payroll', { method: 'DISCARD_RUN', company_id: companyId, runId });
    check('Draft run discarded', res.discarded === true, runId);
  }
  const { data: gone } = await sb.from('payroll_runs').select('id').in('id', [feb.id, dec2.id]);
  check('Discarded runs are gone', (gone ?? []).length === 0, gone);

  console.log(JSON.stringify({ companyId, runs: { dec: dec.id, jan: jan.id, feb: feb.id, dec2: dec2.id } }));
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
