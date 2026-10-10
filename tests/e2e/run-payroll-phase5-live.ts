/**
 * Live check of Payroll Phase 5 (bank payment files, UIF declaration, COIDA return of
 * earnings) against the deployed payroll function. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-phase5-live.ts
 *
 * Uses the finalised fortnightly runs of June 2025 (tests/e2e/run-payroll-statutory-workspace-live.ts).
 * Bank profiles and UIF declaration files are kept as test history; the employer's UIF and
 * COIDA details are restored.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPANY_NAME = 'CERT TX 1785230675937';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

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

type BankResult = { content: string; fileName: string; issues: Array<{ severity: string; message: string }>; control: { payments: number; total: number; hashTotal: string | null } };

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'payroll', { company_id: companyId, ...body });

  const before = await payroll<{ profile: Record<string, unknown> }>({ method: 'GET_EMPLOYER_PROFILE' });
  const { updated_at: _u, updated_by: _b, company_id: _c, ...profile } = before.profile;
  try {
    const badRef = await refused(payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile: { ...profile, uif_dol_reference: '0123456/7' } }));
    check('A UIF reference with a wrong check digit is refused', /check digit/.test(badRef), badRef.slice(0, 140));
    await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile: { ...profile, uif_dol_reference: '123456/8', coida_registration_number: '990012345', coida_rate_percent: 0.18 } });

    // ── Bank payment files ──
    const acb = await payroll<{ id: string; user_generation: number }>({
      method: 'SAVE_BANK_PROFILE', profile: { name: 'CERT TX ACB', kind: 'acb', paying_account_number: '62012345678', paying_branch_code: '250655', paying_account_name: 'CERT TX', user_code: 'AB12', abbreviated_name: 'CERTTX', is_default: true },
    });
    const fnb = await payroll<{ id: string }>({
      method: 'SAVE_BANK_PROFILE', profile: { name: 'CERT TX FNB CSV', kind: 'fnb_obe_csv', paying_account_number: '62012345678', paying_branch_code: '250655', include_hash_total: true },
    });
    const noCode = await refused(payroll({ method: 'SAVE_BANK_PROFILE', profile: { name: 'Bad ACB', kind: 'acb', paying_account_number: '62012345678', paying_branch_code: '250655' } }));
    check('An ACB profile without the bank\'s user code is refused', /BANK_PROFILE_USER_CODE/.test(noCode));
    const forged = await sb.from('company_bank_payment_profiles').update({ paying_account_number: '99999999' }).eq('id', acb.id).select('id');
    check('Bank profiles cannot be changed through the API', !!forged.error || (forged.data ?? []).length === 0, forged.error?.message);

    const runs = await payroll<Array<{ id: string; status: string; pay_period_start: string; output_metadata: { reversed_at?: string; processed_at?: string } | null }>>({ method: 'GET_RUNS' });
    const run = runs.find((r) => r.pay_period_start === '2025-06-02' && r.status === 'finalized' && !(r.output_metadata?.reversed_at && (!r.output_metadata.processed_at || r.output_metadata.processed_at <= r.output_metadata.reversed_at)));
    if (!run) throw new Error('No finalised June 2025 fortnightly run: run tests/e2e/run-payroll-statutory-workspace-live.ts first.');
    const file = await payroll<BankResult>({ method: 'GENERATE_BANK_PAYMENT_FILE', runId: run.id, profileId: acb.id, actionDate: '2025-06-13' });
    const records = file.content.split('\r\n').filter(Boolean);
    check('ACB file: every record 180 characters, 02/04 headers, payments, contra, 92/94 trailers',
      records.every((r) => r.length === 180) && records[0].startsWith('02') && records[1].startsWith('04') && records.at(-2)!.startsWith('92') && records.at(-1)!.startsWith('94')
        && records.filter((r) => r.startsWith('10')).length === file.control.payments && file.control.payments > 0, { records: records.length, control: file.control });
    const credit = records.filter((r) => r.startsWith('10')).reduce((s, r) => s + Number(r.slice(47, 58)), 0);
    check('Contra and trailer totals equal the payments (cents)', Number(records.find((r) => r.startsWith('12'))!.slice(47, 58)) === credit && Number(records.at(-2)!.slice(60, 72)) === credit && Math.round(file.control.total * 100) === credit);
    check('The trailer carries the account hash', records.at(-2)!.slice(72, 84) === file.control.hashTotal, file.control.hashTotal);
    check('A payment date in the past is flagged, not refused', file.issues.some((i) => /in the past/.test(i.message)));
    const csv = await payroll<BankResult>({ method: 'GENERATE_BANK_PAYMENT_FILE', runId: run.id, profileId: fnb.id, actionDate: '2025-06-13' });
    check('FNB CSV: template header, own account and hash, column headings', csv.content.startsWith('BInSol - U ver 1.00') && csv.content.split('\r\n')[2].startsWith(`62012345678,${csv.control.hashTotal}`) && csv.content.includes('RECIPIENT NAME,RECIPIENT ACCOUNT'));
    const confirmed = await payroll<{ user_generation: number }>({ method: 'CONFIRM_BANK_FILE_UPLOADED', profileId: acb.id });
    check('Confirming the upload moves the ACB generation number on', confirmed.user_generation === acb.user_generation + 1, confirmed);

    // ── UIF declaration ──
    const uif = await payroll<{ lines: Array<{ employeeId: string; contribution: number; status: string }>; totals: { contributions: number; employees: number }; issues: Array<{ severity: string; message: string }>; fileName: string }>({ method: 'PREPARE_UIF_DECLARATION', month: '2025-06' });
    check('UIF declaration lists the employees with contributions', uif.totals.employees > 0 && uif.lines.some((l) => l.contribution > 0), uif.totals);
    check('No blocking issues', !uif.issues.some((i) => i.severity === 'error'), uif.issues.filter((i) => i.severity === 'error').slice(0, 3));
    const testFile = await payroll<{ fileName: string; content: string }>({ method: 'EXPORT_UIF_DECLARATION', month: '2025-06', live: false });
    const uifLines = testFile.content.split('\r\n').filter(Boolean);
    check('E03 file: creator UICR (TEST), one UIWK per employee, employer trailer UIEM with the totals',
      uifLines[0].startsWith('8000,"UICR",8010,"U1",8015,"E03",8020,"001234568",8030,"TEST"') && uifLines.filter((l) => l.startsWith('8001,"UIWK"')).length === uif.totals.employees
        && uifLines.at(-1)!.startsWith('8002,"UIEM"') && uifLines.at(-1)!.includes(`8140,${uif.totals.contributions.toFixed(2)}`) && /^01234568\.\d{3}$/.test(testFile.fileName), testFile.fileName);
    const live1 = await payroll<{ fileName: string }>({ method: 'EXPORT_UIF_DECLARATION', month: '2025-06', live: true });
    const live2 = await payroll<{ fileName: string }>({ method: 'EXPORT_UIF_DECLARATION', month: '2025-06', live: true });
    check('Exporting a month again keeps its file name (the new file replaces the earlier one)', live1.fileName === live2.fileName, [live1.fileName, live2.fileName]);
    const history = await payroll<Array<{ period: string; status: string }>>({ method: 'LIST_STATUTORY_RETURNS', returnType: 'UIF_DECLARATION' });
    check('Declaration history keeps the replaced file', history.filter((h) => h.period === '202506' && h.status === 'superseded').length >= 1 && history.filter((h) => h.period === '202506' && h.status !== 'superseded').length === 1);

    // ── COIDA ──
    const roe = await payroll<{ worksheet: { totals: { employees: number; earnings: number; assessable: number }; assessment: number; maxEarnings: number; minAssessment: number } ; registrationNumber: string }>({ method: 'PREPARE_COIDA_ROE', startYear: 2025, provisionalGrowthPercent: 5 });
    check('COIDA 2025/26: employees and earnings from finalised payroll; R633 168 cap; assessment at least R1 621',
      roe.worksheet.totals.employees > 0 && roe.worksheet.maxEarnings === 633_168 && roe.worksheet.assessment >= 1_621 && roe.worksheet.totals.assessable <= roe.worksheet.totals.earnings && roe.registrationNumber === '990012345',
      roe.worksheet.totals);
  } finally {
    await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile }).catch((e) => console.error('restore profile failed', e));
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
