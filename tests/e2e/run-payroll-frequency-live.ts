/**
 * Live check of weekly payroll, working-day pro-rata, leave paid out and the payroll
 * settings guard, against the deployed payroll function. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-frequency-live.ts
 *
 * Leaves no drafts behind and restores the company's pro-rata setting.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RULE_SET_2026_2027 } from '../../src/lib/statutoryPayrollEngine/registry';
import { calculateAnnualTax, resolveRebate } from '../../src/lib/statutoryPayrollEngine/utils';
import { workingDayCount } from '../../src/lib/payrollRulesEngine/periodEmployment';

const COMPANY_NAME = 'CERT TX 1785230675937';
const rs = RULE_SET_2026_2027;
const rebate = resolveRebate(rs.rebates, undefined, { secondaryAge: rs.rebateSecondaryAge, tertiaryAge: rs.rebateTertiaryAge });

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

async function invoke<T>(sb: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
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
    engine_results?: Array<{ engine_id: string; employee_amount: number }>;
    period_employment?: Record<string, unknown>;
  };
  payslip_items?: Array<{ description: string; type: string; amount: number; irp5_code?: string | null }>;
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
      first_name: first, last_name: `Freq-${stamp}`, email: `${first.toLowerCase()}.${stamp}@adminless-fin.test`,
      department: 'Certification', position: 'Frequency check', employment_type: 'permanent',
      bank_name: 'FNB', bank_account_number: '62000000004', bank_branch_code: '250655', tax_number: '0000000000',
      ...extra,
    },
  });
  const createRun = (start: string, end: string, payFrequency: string) => invoke<{ id: string; pay_frequency: string }>(sb, 'payroll', {
    method: 'CREATE_RUN', company_id: companyId, additional_run: true,
    runData: { pay_period_start: start, pay_period_end: end, pay_date: end, pay_frequency: payFrequency },
  });
  const generate = (runId: string) => invoke(sb, 'payroll', { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId });
  const finalise = async (runId: string) => {
    await invoke(sb, 'payroll', { method: 'APPROVE_RUN', company_id: companyId, runId });
    return invoke(sb, 'payroll', { method: 'FINALIZE_RUN', company_id: companyId, runId, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
  };
  const discard = (runId: string) => invoke(sb, 'payroll', { method: 'DISCARD_RUN', company_id: companyId, runId });
  const slipFor = async (runId: string, employeeId: string): Promise<Slip | undefined> => {
    const detail = await invoke<{ payslips: Slip[] }>(sb, 'payroll', { method: 'GET_RUN_DETAIL', company_id: companyId, runId });
    const head = detail.payslips.find((p) => p.employee_id === employeeId);
    return head ? invoke<Slip>(sb, 'payroll', { method: 'GET_PAYSLIP_DETAIL', company_id: companyId, payslipId: head.id }) : undefined;
  };
  const engine = (slip: Slip | undefined, id: string) => slip?.calculation_snapshot?.engine_results?.find((e) => e.engine_id === id)?.employee_amount ?? -1;
  const item = (slip: Slip | undefined, prefix: string) => slip?.payslip_items?.find((i) => i.description.startsWith(prefix));

  // ── Settings guard and the pro-rata method (restored at the end). ──
  const settings = await invoke<{ effective_rules: Record<string, { config?: Record<string, unknown> }> }>(sb, 'payroll', { method: 'GET_PAYROLL_SETTINGS', company_id: companyId });
  const originalMethod = settings.effective_rules?.basic_salary?.config?.pro_rata_method ?? 'calendar_days';
  const unknown = await invoke(sb, 'payroll', { method: 'UPDATE_PAYROLL_SETTINGS', company_id: companyId, settings: [{ rule_id: 'not_a_rule', enabled: true }] })
    .then(() => null, (e: Error) => e.message);
  check('Unknown payroll rule refused', !!unknown && /Unknown payroll rule/.test(unknown), unknown);
  await invoke(sb, 'payroll', { method: 'UPDATE_PAYROLL_SETTINGS', company_id: companyId, settings: [{ rule_id: 'basic_salary', enabled: false, config: { pro_rata_method: 'working_days', junk: 1 } }] });
  const after = await invoke<{ company_settings: Array<{ rule_id: string; enabled: boolean; config: Record<string, unknown> }> }>(sb, 'payroll', { method: 'GET_PAYROLL_SETTINGS', company_id: companyId });
  const basic = after.company_settings.find((s) => s.rule_id === 'basic_salary');
  check('Basic salary cannot be switched off; only the pro-rata method is kept', basic?.enabled === true && basic?.config?.pro_rata_method === 'working_days' && !('junk' in (basic?.config ?? {})), basic);

  const runsToDiscard: string[] = [];
  try {
    // ── Weekly payroll: four weeks of November 2026 for a weekly employee. ──
    const weekly = await employee('Weekly', { salary_amount: 5000, salary_period: 'weekly', start_date: '2020-01-01' });
    const monthlyStaff = await employee('Monthly', { salary_amount: 21_000, salary_period: 'monthly', start_date: '2027-01-18' });
    const leaver = await employee('LeavePay', { salary_amount: 30_000, salary_period: 'monthly', start_date: '2020-01-01' });

    const weeklyPaye = Math.round(((calculateAnnualTax(5000 * 52, rs.brackets) - rebate) / 52) * 100) / 100;
    const weeks = [['2026-11-02', '2026-11-08'], ['2026-11-09', '2026-11-15'], ['2026-11-16', '2026-11-22'], ['2026-11-23', '2026-11-29']];
    const expectedUif = [50, 50, 50, 27.12];
    for (let i = 0; i < weeks.length; i += 1) {
      const run = await createRun(weeks[i][0], weeks[i][1], 'weekly');
      check(`Week ${i + 1}: weekly run created`, run.pay_frequency === 'weekly', run.pay_frequency);
      await generate(run.id);
      const slip = await slipFor(run.id, weekly.id);
      const basicPay = item(slip, 'Basic Salary')?.amount;
      check(`Week ${i + 1}: paid one week's salary (R5 000)`, near(Number(basicPay), 5000, 0.01), basicPay);
      check(`Week ${i + 1}: PAYE over 52 weeks = SARS`, near(engine(slip, 'paye'), weeklyPaye), { live: engine(slip, 'paye'), sars: weeklyPaye });
      check(`Week ${i + 1}: UIF within the month's ceiling`, near(engine(slip, 'uif'), expectedUif[i], 0.01), { live: engine(slip, 'uif'), expected: expectedUif[i] });
      if (i === 0) check('Weekly run leaves monthly staff out', !(await slipFor(run.id, leaver.id)));
      await finalise(run.id);
    }

    // ── Monthly run (working days): joiner pro-rated by working days, weekly staff out, leave paid out. ──
    const jan = await createRun('2027-01-01', '2027-01-31', 'monthly');
    runsToDiscard.push(jan.id);
    await sb.from('payroll_period_inputs').insert({
      company_id: companyId, payroll_run_id: jan.id, employee_id: leaver.id, component_code: 'leave_payout', config: { days: 10, dailyRate: 1500 },
    }).then(({ error }) => check('Leave paid out saved as a run input', !error, error?.message));
    await generate(jan.id);

    check('Monthly run leaves weekly staff out', !(await slipFor(jan.id, weekly.id)));
    const joiner = await slipFor(jan.id, monthlyStaff.id);
    const factor = workingDayCount('2027-01-18', '2027-01-31') / workingDayCount('2027-01-01', '2027-01-31');
    const joinerBasic = Number(item(joiner, 'Basic Salary')?.amount);
    check('Joiner pro-rated by working days (holidays excluded)', near(joinerBasic, Math.round(21_000 * factor * 100) / 100, 0.01),
      { joinerBasic, factor, method: joiner?.calculation_snapshot?.period_employment?.pro_rata_method });

    const leaveSlip = await slipFor(jan.id, leaver.id);
    const leaveLine = item(leaveSlip, 'Leave Pay');
    check('Leave Pay line: 10 days × R1 500, IRP5 3605', near(Number(leaveLine?.amount), 15_000, 0.01) && leaveLine?.irp5_code === '3605', leaveLine);
    const periodicTax = Math.max(0, calculateAnnualTax(30_000 * 12, rs.brackets) - rebate);
    const withLeave = Math.max(0, calculateAnnualTax(30_000 * 12 + 15_000, rs.brackets) - rebate);
    const sarsPaye = Math.round((periodicTax / 12 + (withLeave - periodicTax)) * 100) / 100;
    check('PAYE: leave pay taxed once as an annual payment (SARS)', near(engine(leaveSlip, 'paye'), sarsPaye), { live: engine(leaveSlip, 'paye'), sars: sarsPaye });
  } finally {
    for (const runId of runsToDiscard) await discard(runId).catch((e) => console.log('discard failed', runId, e.message));
    await invoke(sb, 'payroll', { method: 'UPDATE_PAYROLL_SETTINGS', company_id: companyId, settings: [{ rule_id: 'basic_salary', enabled: true, config: { pro_rata_method: originalMethod } }] });
    console.log(`Pro-rata method restored to ${String(originalMethod)}`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
