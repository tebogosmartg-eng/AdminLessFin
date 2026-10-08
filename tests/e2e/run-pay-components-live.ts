/**
 * Live check of pay components against the deployed payroll function.
 * Runs ONLY in the CERT TX demo company, as the E2E user (so RLS applies).
 *
 *   npx --yes tsx tests/e2e/run-pay-components-live.ts
 *
 * Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASSWORD in .env.
 * Every expected figure comes from the same engine the browser preview uses,
 * and the SARS-specific figures are asserted independently.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { previewEmployeePay } from '../../src/lib/payrollRulesEngine/previewPayComponents';
import { resolveRuleSetForDate } from '../../src/lib/statutoryPayrollEngine/registry';
import { calculateAnnualTax, resolveRebate } from '../../src/lib/statutoryPayrollEngine/utils';

const COMPANY_NAME = 'CERT TX 1785230675937';
const BASIC = 30_000;
const PACKAGE = [
  { component_code: 'travel_allowance', config: { monthlyAllowance: 5000, method: 'deemed_80' } },
  { component_code: 'fringe_company_car', config: { determinedValue: 300_000, maintenancePlan: false, mainlyBusinessUse: false } },
];
const PERIOD = [
  { component_code: 'bonus', config: { amount: 20_000 } },
  { component_code: 'subsistence', config: { days: 3, amountPaid: 2000, domestic: true, incidentalOnly: false } },
];

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

function loadEnv() {
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* vars may already be set */ }
}

async function invoke<T>(supabase: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try { detail = JSON.stringify(await ctx.clone().json()); } catch { /* keep message */ }
    }
    return { data: null, error: detail };
  }
  if (data && typeof data === 'object' && 'error' in data) return { data: null, error: String((data as { error: unknown }).error) };
  return { data: data as T, error: null };
}

type Item = { description: string; type: string; amount: number; component_code?: string | null; irp5_code?: string | null };

async function main() {
  loadEnv();
  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await supabase.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;

  const { data: company } = await supabase.from('companies').select('id, name').eq('name', COMPANY_NAME).single();
  if (!company) throw new Error(`${COMPANY_NAME} not found for the E2E user`);
  const companyId = company.id as string;
  console.log(`Company: ${company.name} (${companyId})`);

  // 1. A fresh employee so the payslip holds only what this check puts there.
  const stamp = format(new Date(), 'yyyyMMdd-HHmmss');
  const emp = await invoke<{ id: string; first_name: string; last_name: string }>(supabase, 'employees', {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: 'PayComp', last_name: `Live-${stamp}`, email: `paycomp.${Date.now()}@adminless-fin.test`,
      department: 'Certification', position: 'Pay components check', salary_amount: BASIC, salary_period: 'monthly',
      employment_type: 'permanent', bank_name: 'FNB', bank_account_number: '62000000002', bank_branch_code: '250655',
      tax_number: '0000000000', start_date: format(new Date(), 'yyyy-MM-dd'),
    },
  });
  check('Employee created', !!emp.data, emp.error ?? emp.data?.id);
  if (!emp.data) return;
  const employeeId = emp.data.id;

  // 2. Standing package, written as the user through RLS.
  const pkg = await supabase.from('employee_pay_components')
    .insert(PACKAGE.map((row) => ({ ...row, company_id: companyId, employee_id: employeeId })))
    .select('id');
  check('Pay package saved through RLS (owner/admin)', !pkg.error && pkg.data?.length === 2, pkg.error?.message);

  // 3. A draft run in a future month that has no run yet.
  let runId: string | null = null;
  let payDate = '';
  for (let offset = 1; offset <= 24 && !runId; offset += 1) {
    const month = addMonths(new Date(), offset);
    payDate = format(endOfMonth(month), 'yyyy-MM-dd');
    const run = await invoke<{ id: string }>(supabase, 'payroll', {
      method: 'CREATE_RUN', company_id: companyId,
      runData: { pay_period_start: format(startOfMonth(month), 'yyyy-MM-dd'), pay_period_end: payDate, pay_date: payDate, status: 'draft' },
    });
    runId = run.data?.id ?? null;
  }
  check('Draft payroll run created', !!runId, payDate);
  if (!runId) return;

  // 4. An invalid run input must stop generation with the employee's name, not be dropped.
  const bad = await supabase.from('payroll_period_inputs').insert({
    company_id: companyId, payroll_run_id: runId, employee_id: employeeId, component_code: 'bonus', config: { amount: -500 },
  });
  check('Invalid input stored (DB holds JSON only)', !bad.error, bad.error?.message);
  const refused = await invoke(supabase, 'payroll', { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId });
  check('Generation refuses a negative bonus, naming the employee',
    !!refused.error && /cannot be negative/.test(refused.error) && refused.error.includes('PayComp'), refused.error);

  // 5. Valid run inputs replace it.
  const upsert = await supabase.from('payroll_period_inputs').upsert(
    PERIOD.map((row) => ({ ...row, company_id: companyId, payroll_run_id: runId, employee_id: employeeId })),
    { onConflict: 'payroll_run_id,employee_id,component_code' }
  );
  check('Run inputs saved while draft', !upsert.error, upsert.error?.message);

  const gen = await invoke<{ generated: number }>(supabase, 'payroll', { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId });
  check('Payslips generated', !!gen.data, gen.error ?? gen.data);
  if (!gen.data) return;

  const detail = await invoke<{ payslips: Array<{ id: string; employee_id: string; net_pay: number; total_earnings: number; total_deductions: number }> }>(
    supabase, 'payroll', { method: 'GET_RUN_DETAIL', company_id: companyId, runId });
  const slipHead = detail.data?.payslips?.find((p) => p.employee_id === employeeId);
  check('Payslip exists for the employee', !!slipHead, detail.error);
  if (!slipHead) return;
  const slip = await invoke<{ net_pay: number; total_earnings: number; total_deductions: number; payslip_items: Item[]; calculation_snapshot?: Record<string, unknown> }>(
    supabase, 'payroll', { method: 'GET_PAYSLIP_DETAIL', company_id: companyId, payslipId: slipHead.id });
  const items = slip.data?.payslip_items ?? [];
  const find = (description: string, type?: string) => items.find((i) => i.description === description && (!type || i.type === type));
  console.log('Payslip lines:', items.map((i) => `${i.type}:${i.description}=${i.amount}${i.irp5_code ? ` [${i.irp5_code}]` : ''}`).join(' | '));

  // 6. Lines, codes and totals.
  const expectLine = (description: string, type: string, amount: number, irp5: string) => {
    const line = find(description, type);
    check(`Line ${description} ${amount} (${type}, IRP5 ${irp5})`,
      !!line && near(Number(line.amount), amount) && line.irp5_code === irp5 && !!line.component_code, line);
  };
  expectLine('Travel Allowance', 'earning', 5000, '3701');
  expectLine('Bonus', 'earning', 20_000, '3605');
  expectLine('Subsistence Allowance', 'earning', 2000, '3704');
  expectLine('Company Car', 'taxable_benefit', 10_500, '3802');

  const cashGross = BASIC + 5000 + 20_000 + 2000;
  check('Total earnings = cash only (car excluded)', near(Number(slip.data?.total_earnings), cashGross), slip.data?.total_earnings);

  // 7. Statutory amounts against the engine preview and SARS arithmetic.
  const preview = previewEmployeePay({
    monthlyBasic: BASIC,
    packageComponents: PACKAGE.map((r) => ({ componentCode: r.component_code, config: r.config })),
    periodInputs: PERIOD.map((r) => ({ componentCode: r.component_code, config: r.config })),
    payDate,
  });
  const rs = resolveRuleSetForDate(payDate);
  const paye = Number(find('PAYE', 'deduction')?.amount ?? 0);
  const uif = Number(find('UIF', 'deduction')?.amount ?? 0);
  const sdl = Number(find('SDL')?.amount ?? 0);
  const prevPaye = preview.result.engineResults.find((e) => e.engineId === 'paye')!.employeeAmount;
  const prevUif = preview.result.engineResults.find((e) => e.engineId === 'uif')!.employeeAmount;
  const prevSdl = preview.result.engineResults.find((e) => e.engineId === 'sdl')!.employerAmount;
  check('PAYE matches the engine preview', near(paye, prevPaye), { live: paye, preview: prevPaye });

  // Independent SARS figure: periodic = basic + 80% travel + 80% car + subsistence excess; bonus taxed once.
  const subsistenceExcess = Math.max(0, 2000 - 3 * rs.subsistenceDomesticDaily);
  const periodic = BASIC + 4000 + 0.8 * 10_500 + subsistenceExcess;
  const rebate = resolveRebate(rs.rebates, undefined);
  const periodicTax = Math.max(0, calculateAnnualTax(periodic * 12, rs.brackets) - rebate);
  const withBonus = Math.max(0, calculateAnnualTax(periodic * 12 + 20_000, rs.brackets) - rebate);
  const sarsPaye = Math.round((periodicTax / 12 + (withBonus - periodicTax)) * 100) / 100;
  check('PAYE = SARS (periodic/12 + difference-method bonus tax)', near(paye, sarsPaye, 0.05), { live: paye, sars: sarsPaye });

  const remuneration = BASIC + 4000 + 20_000 + 0.8 * 10_500 + subsistenceExcess;
  check('UIF on capped Fourth Schedule remuneration', near(uif, Math.round(Math.min(remuneration, rs.uifCeilingMonthly) * rs.uifRate * 100) / 100) && near(uif, prevUif), { live: uif, preview: prevUif });
  if (sdl > 0) check('SDL = 1% of Fourth Schedule remuneration', near(sdl, Math.round(remuneration * rs.sdlRate * 100) / 100) && near(sdl, prevSdl), { live: sdl, expected: remuneration * rs.sdlRate });
  else console.log('[INFO] SDL not levied for this company (exemption threshold)');
  check('Net pay = cash earnings − deductions', near(Number(slip.data?.net_pay), cashGross - Number(slip.data?.total_deductions)), slip.data);

  // 8. Calculated lines cannot be edited on the payslip.
  const tampered = items.map((i) => (i.description === 'PAYE' ? { ...i, amount: 1 } : i));
  const edit = await invoke(supabase, 'payroll', { method: 'UPDATE_PAYSLIP', company_id: companyId, payslipId: slipHead.id, items: tampered });
  check('Direct PAYE edit refused', !!edit.error && /read-only/.test(edit.error), edit.error);

  // 9. Approve, then add an allowance after approval: regeneration must work and withdraw the approval.
  const approve = await invoke(supabase, 'payroll', { method: 'APPROVE_RUN', company_id: companyId, runId });
  check('Run approved', !approve.error, approve.error);
  const coa = await invoke<Array<{ id: string; name: string; type: string }>>(supabase, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const accounts = coa.data ?? [];
  const wage = accounts.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name));
  const bank = accounts.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name));
  const liability = accounts.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ?? accounts.find((a) => a.type === 'Liability');

  const late = await supabase.from('payroll_period_inputs').insert({
    company_id: companyId, payroll_run_id: runId, employee_id: employeeId, component_code: 'other_cash',
    config: { amount: 1500, taxable: true, label: 'Tools allowance', onceOff: true },
  });
  check('Allowance added after approval (run still draft)', !late.error, late.error?.message);
  const regen = await invoke<{ generated: number; approval_cleared?: boolean }>(supabase, 'payroll', { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId });
  check('Payslips regenerate after approval', !!regen.data, regen.error);
  check('Regeneration withdraws the approval', regen.data?.approval_cleared === true, regen.data?.approval_cleared);
  const afterRegen = await invoke<{ run: { approved_at: string | null }; payslips: Array<{ id: string; employee_id: string; total_earnings: number }> }>(
    supabase, 'payroll', { method: 'GET_RUN_DETAIL', company_id: companyId, runId });
  check('Run shows as not approved', afterRegen.data?.run?.approved_at == null, afterRegen.data?.run?.approved_at);
  const regenSlip = afterRegen.data?.payslips?.find((p) => p.employee_id === employeeId);
  check('New allowance is on the regenerated payslip', near(Number(regenSlip?.total_earnings), cashGross + 1500), regenSlip?.total_earnings);
  const unapproved = await invoke(supabase, 'payroll', {
    method: 'FINALIZE_RUN', company_id: companyId, runId, wageAccountId: wage?.id, bankAccountId: bank?.id, liabilityAccountId: liability?.id,
  });
  check('Processing refused until re-approved', !!unapproved.error && /Approve the payroll run/.test(unapproved.error), unapproved.error);
  const reapprove = await invoke(supabase, 'payroll', { method: 'APPROVE_RUN', company_id: companyId, runId });
  check('Run re-approved', !reapprove.error, reapprove.error);

  // 10. Finalise, then inputs are frozen and the journal balances.
  const fin = await invoke<{ journal_entry_id: string }>(supabase, 'payroll', {
    method: 'FINALIZE_RUN', company_id: companyId, runId, wageAccountId: wage?.id, bankAccountId: bank?.id, liabilityAccountId: liability?.id,
  });
  check('Run finalised and posted', !!fin.data?.journal_entry_id, fin.error ?? fin.data?.journal_entry_id);

  if (fin.data?.journal_entry_id) {
    const { data: lines } = await supabase.from('journal_entry_items').select('type, amount').eq('journal_entry_id', fin.data.journal_entry_id);
    const sum = (side: string) => (lines ?? []).filter((l) => l.type === side).reduce((s, l) => s + Number(l.amount ?? 0), 0);
    const dr = sum('debit');
    const cr = sum('credit');
    check('Payroll journal balances', (lines?.length ?? 0) > 0 && near(dr, cr), { dr, cr });
  }

  const frozen = await supabase.from('payroll_period_inputs').update({ config: { amount: 1 } })
    .eq('payroll_run_id', runId).eq('employee_id', employeeId).eq('component_code', 'bonus').select('id');
  check('Run inputs frozen after finalising', !!frozen.error && /draft/.test(frozen.error.message), frozen.error?.message ?? frozen.data);

  console.log(JSON.stringify({ companyId, employeeId, runId, payDate, payslipId: slipHead.id }));
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
