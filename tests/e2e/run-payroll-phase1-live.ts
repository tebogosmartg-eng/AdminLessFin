/**
 * Live check of Payroll Phase 1 against the deployed payroll function and database.
 * CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-phase1-live.ts
 *
 * Covers: IRP5 codes on every payslip line and an IRP5 built from them; pension relief
 * without a double deduction; run warnings; separation of duties on approval; payroll
 * tables closed to direct writes; legacy functions withdrawn.
 *
 * Restores the company's approval control and pension setting, discards drafts, and
 * reverses the one run it finalises.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RULE_SET_2026_2027 } from '../../src/lib/statutoryPayrollEngine/registry';
import { calculateAnnualTax, resolveRebate } from '../../src/lib/statutoryPayrollEngine/utils';
import { mapRawPayslipToPayrollFact } from '../../src/reporting/facts/PayrollFactMapper';
import { factsToStatutoryRunSources } from '../../src/reporting/facts/adapters';
import { generateIrp5 } from '../../src/lib/statutoryReturns';

const COMPANY_NAME = 'CERT TX 1785230675937';
const rs = RULE_SET_2026_2027;
const rebate = resolveRebate(rs.rebates, 40, { secondaryAge: rs.rebateSecondaryAge, tertiaryAge: rs.rebateTertiaryAge });
const sarsMonthlyPaye = (taxableMonthly: number) =>
  Math.round((Math.max(0, calculateAnnualTax(taxableMonthly * 12, rs.brackets) - rebate) / 12) * 100) / 100;

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

class EdgeError extends Error {
  constructor(message: string, public payload: Record<string, unknown> | null) { super(message); }
}

async function invoke<T>(sb: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let payload: Record<string, unknown> | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) { try { payload = await ctx.clone().json(); } catch { /* keep */ } }
    throw new EdgeError(`${fn}.${body.method}: ${payload ? JSON.stringify(payload) : error.message}`, payload);
  }
  if (data && typeof data === 'object' && 'error' in data) throw new EdgeError(`${fn}.${body.method}: ${String((data as { error: unknown }).error)}`, data as Record<string, unknown>);
  return data as T;
}

async function expectRefused(promise: Promise<unknown>): Promise<string> {
  try { await promise; return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

type Item = { description: string; type: string; amount: number; component_code?: string | null; irp5_code?: string | null };
type Slip = {
  id: string; employee_id: string; total_earnings: number; total_deductions: number; net_pay: number;
  calculation_snapshot?: { taxable_earnings?: number; engine_results?: Array<{ engine_id: string; employee_amount: number; skipped?: boolean }> };
  payslip_items?: Item[];
  employees?: Record<string, string>;
};
type Warning = { code: string; category: string; employee_id: string; message: string };
type RunDetail = {
  run: { id: string; status: string; approved_at: string | null; prepared_by?: string[]; output_metadata?: { generation_warnings?: Warning[] } };
  payslips: Slip[];
  audit_events?: Array<{ event_type: string; event_data: Record<string, unknown> }>;
};

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const me = auth.user!.id;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const stamp = Date.now().toString().slice(-6);
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'payroll', { company_id: companyId, ...body });

  const coa = await invoke<Array<{ id: string; name: string; type: string }>>(sb, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const wage = coa.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name))!;
  const bank = coa.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))!;
  const liability = coa.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ?? coa.find((a) => a.type === 'Liability')!;

  // Employees end in the test month, so no later run pays them.
  const employee = (first: string, extra: Record<string, unknown>) => invoke<{ id: string }>(sb, 'employees', {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: first, last_name: `Phase1-${stamp}`, email: `${first.toLowerCase()}.${stamp}@adminless-fin.test`,
      department: 'Certification', position: 'Phase 1 check', employment_type: 'permanent',
      start_date: '2026-03-01', end_date: '2026-03-31', salary_period: 'monthly',
      ...extra,
    },
  });
  const sarsComplete = {
    tax_number: '0001339050', id_number: '8601015800086', bank_name: 'FNB', bank_account_number: '62000000004',
    bank_branch_code: '250655', bank_account_type: 'current', residential_street_number: '12',
    residential_street_name: 'Main Road', residential_suburb: 'Gardens', residential_city: 'Cape Town', residential_postal_code: '8001',
  };

  // ── Employee SARS details are validated by the database. ──
  const badType = await expectRefused(employee('BadType', { ...sarsComplete, salary_amount: 1, bank_account_type: 'cheque' }));
  check('Database refuses an unknown bank account type', /bank_account_type/.test(badType), badType.slice(0, 160));
  const badPostal = await expectRefused(employee('BadPostal', { ...sarsComplete, salary_amount: 1, residential_postal_code: '80011' }));
  check('Database refuses a postal code that is not 4 digits', /postal_code/.test(badPostal), badPostal.slice(0, 160));
  const badPassport = await expectRefused(employee('BadPassport', { ...sarsComplete, salary_amount: 1, passport_number: 'FN123456' }));
  check('Database refuses a passport without its country', /passport/.test(badPassport), badPassport.slice(0, 160));

  const badId = await expectRefused(employee('BadId', { ...sarsComplete, salary_amount: 1, id_number: '8601015800083' }));
  check('API refuses an SA ID with a wrong check digit (same rule as the form)', /VALIDATION_FAILED/.test(badId) && /not a valid South African ID/.test(badId), badId.slice(0, 160));
  const badTax = await expectRefused(employee('BadTax', { ...sarsComplete, salary_amount: 1, tax_number: '0123456789' }));
  check('API refuses an income tax number that fails the SARS check digit', /VALIDATION_FAILED/.test(badTax) && /10 digits/.test(badTax), badTax.slice(0, 160));

  const complete = await employee('Complete', { ...sarsComplete, salary_amount: 30_000, nature_of_person: 'A' });
  const sparse = await employee('Sparse', { salary_amount: 20_000, tax_number: '0001339050', bank_account_number: '62000000005' });
  const noSalary = await employee('NoSalary', { ...sarsComplete });
  const weekly = await employee('Weekly', { ...sarsComplete, salary_amount: 5_000, salary_period: 'weekly' });

  const originalControls = await payroll<{ allow_self_approval: boolean; self_approval_reason: string | null; can_change: boolean }>({ method: 'GET_PAYROLL_CONTROLS' });
  check('E2E user is the owner and may change approval controls', originalControls.can_change === true, originalControls);
  const settings = await payroll<{ company_settings: Array<{ rule_id: string; enabled: boolean; config: Record<string, unknown> }> }>({ method: 'GET_PAYROLL_SETTINGS' });
  const originalPension = settings.company_settings.find((s) => s.rule_id === 'pension');
  const runsToDiscard: string[] = [];
  let finalisedRunId: string | null = null;

  try {
    const shortReason = await expectRefused(payroll({ method: 'UPDATE_PAYROLL_CONTROLS', allow_self_approval: true, reason: 'short' }));
    check('Self-approval needs a reason of 10+ characters', /REASON_REQUIRED|at least 10/.test(shortReason), shortReason.slice(0, 120));
    await payroll({ method: 'UPDATE_PAYROLL_CONTROLS', allow_self_approval: false });

    const run = await payroll<{ id: string }>({
      method: 'CREATE_RUN', additional_run: true,
      runData: { pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31', pay_frequency: 'monthly' },
    });
    runsToDiscard.push(run.id);
    for (const row of [
      { employee_id: complete.id, component_code: 'travel_allowance', config: { monthlyAllowance: 4000, method: 'deemed_80' } },
      { employee_id: weekly.id, component_code: 'bonus', config: { amount: 1000 } },
    ]) {
      const { error } = await sb.from('payroll_period_inputs').insert({ company_id: companyId, payroll_run_id: run.id, ...row });
      if (error) throw error;
    }

    const slipFor = async (employeeId: string): Promise<Slip> => {
      const detail = await payroll<RunDetail>({ method: 'GET_RUN_DETAIL', runId: run.id });
      const head = detail.payslips.find((p) => p.employee_id === employeeId);
      if (!head) throw new Error(`no payslip for ${employeeId}`);
      return payroll<Slip>({ method: 'GET_PAYSLIP_DETAIL', payslipId: head.id });
    };
    const line = (slip: Slip, description: string, type?: string) =>
      slip.payslip_items?.find((i) => i.description === description && (!type || i.type === type));
    const engine = (slip: Slip, id: string) => slip.calculation_snapshot?.engine_results?.find((e) => e.engine_id === id && !e.skipped)?.employee_amount ?? 0;

    // ── Pension: fixed amount → one deduction line, taxable reduced. ──
    await payroll({ method: 'UPDATE_PAYROLL_SETTINGS', settings: [{ rule_id: 'pension', enabled: true, config: { amount: 1000 } }] });
    await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
    let slip = await slipFor(complete.id);
    const deductions = (slip.payslip_items ?? []).filter((i) => i.type === 'deduction').map((i) => i.description);
    check('Fixed pension: deducted once (no second "retirement" line)', deductions.filter((d) => /pension|retirement/i.test(d)).length === 1, deductions);
    // Taxable: R30 000 + 80% of the R4 000 travel allowance − R1 000 pension.
    check('Fixed pension: taxable income reduced by the contribution', near(Number(slip.calculation_snapshot?.taxable_earnings), 30_000 + 3_200 - 1_000), slip.calculation_snapshot?.taxable_earnings);
    check('Fixed pension: PAYE matches SARS on R32 200', near(engine(slip, 'paye'), sarsMonthlyPaye(32_200)), { live: engine(slip, 'paye'), sars: sarsMonthlyPaye(32_200) });

    // ── Pension: percentage → relief now given (it was not before). ──
    await payroll({ method: 'UPDATE_PAYROLL_SETTINGS', settings: [{ rule_id: 'pension', enabled: true, config: { percentage: 7.5 } }] });
    await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
    slip = await slipFor(complete.id);
    const pension = line(slip, 'Pension', 'deduction');
    check('Percentage pension: 7.5% of R30 000 deducted once', near(Number(pension?.amount), 2_250, 0.01), pension);
    check('Percentage pension: taxable income reduced (R33 200 − R2 250)', near(Number(slip.calculation_snapshot?.taxable_earnings), 30_950), slip.calculation_snapshot?.taxable_earnings);
    check('Percentage pension: PAYE matches SARS on R30 950', near(engine(slip, 'paye'), sarsMonthlyPaye(30_950)), { live: engine(slip, 'paye'), sars: sarsMonthlyPaye(30_950) });
    check('Net pay = earnings − deductions', near(Number(slip.net_pay), Number(slip.total_earnings) - Number(slip.total_deductions), 0.01), { net: slip.net_pay, e: slip.total_earnings, d: slip.total_deductions });

    // ── IRP5 codes on every reportable line. ──
    const codeOf = (description: string, type?: string) => line(slip, description, type)?.irp5_code ?? null;
    const codes = {
      basic: codeOf('Basic Salary'), travel: codeOf('Travel Allowance'), pension: codeOf('Pension'), paye: codeOf('PAYE'),
      uif: codeOf('UIF', 'deduction'), uifEmployer: codeOf('UIF Employer'),
    };
    check('Lines carry IRP5 codes: 3601 basic, 3701 travel, 4001 pension, 4102 PAYE, 4141 UIF (both)',
      codes.basic === '3601' && codes.travel === '3701' && codes.pension === '4001' && codes.paye === '4102' && codes.uif === '4141' && codes.uifEmployer === '4141', codes);
    const sdl = line(slip, 'SDL');
    check('SDL line (when levied) carries 4142', !sdl || sdl.irp5_code === '4142', sdl ?? 'SDL not levied (exempt)');

    // ── Warnings stored on the run. ──
    const detail = await payroll<RunDetail>({ method: 'GET_RUN_DETAIL', runId: run.id });
    const warnings = detail.run.output_metadata?.generation_warnings ?? [];
    const has = (employeeId: string, code: string) => warnings.some((w) => w.employee_id === employeeId && w.code === code);
    check('Warning: employee with no salary was not paid', has(noSalary.id, 'NO_SALARY'));
    check('Warning: weekly employee\'s bonus input was not applied to a monthly run', has(weekly.id, 'INPUTS_NOT_APPLIED'),
      warnings.find((w) => w.employee_id === weekly.id)?.message);
    check('Warning: missing residential address, ID and account type for the sparse record',
      has(sparse.id, 'MISSING_RESIDENTIAL_ADDRESS') && has(sparse.id, 'MISSING_IDENTITY') && has(sparse.id, 'MISSING_BANK_ACCOUNT_TYPE'));
    check('No warnings for the complete record', !warnings.some((w) => w.employee_id === complete.id), warnings.filter((w) => w.employee_id === complete.id));

    // Fixing the employee clears their SARS warnings on the next load, without regenerating.
    check('Run page warnings are served live with the run', Array.isArray((detail as { warnings?: unknown }).warnings));
    await invoke(sb, 'employees', {
      method: 'PUT', company_id: companyId, employeeId: sparse.id, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
      employeeData: { ...sarsComplete, bank_account_number: '62000000005' },
    });
    await invoke(sb, 'employees', {
      method: 'PUT', company_id: companyId, employeeId: noSalary.id, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
      employeeData: { salary_amount: 12_000 },
    });
    const refreshed = (await payroll<RunDetail & { warnings: Warning[] }>({ method: 'GET_RUN_DETAIL', runId: run.id })).warnings;
    // The employee leaves in the test month, so leave owing (Phase 3) is still flagged; only SARS details are fixed here.
    check('Fixed SARS details clear the warnings without regenerating', !refreshed.some((w) => w.employee_id === sparse.id && w.code !== 'LEAVE_PAYOUT_DUE'),
      refreshed.filter((w) => w.employee_id === sparse.id));
    check('A salary added after generation asks for a regenerate', refreshed.some((w) => w.employee_id === noSalary.id && w.code === 'NOT_ON_RUN'),
      refreshed.filter((w) => w.employee_id === noSalary.id));
    await invoke(sb, 'employees', {
      method: 'PUT', company_id: companyId, employeeId: noSalary.id, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
      employeeData: { salary_amount: null },
    });

    // ── Separation of duties. ──
    check('Run records who prepared it', (detail.run.prepared_by ?? []).includes(me), detail.run.prepared_by);
    const blocked = await expectRefused(payroll({ method: 'APPROVE_RUN', runId: run.id }));
    check('The preparer cannot approve their own run', /SELF_APPROVAL_BLOCKED/.test(blocked), blocked.slice(0, 160));

    // ── The payroll tables cannot be changed directly any more. ──
    const directApprove = await sb.from('payroll_runs').update({ approved_by: me, approved_at: new Date().toISOString() }).eq('id', run.id).select('id');
    check('Direct API write to payroll_runs is refused', !!directApprove.error || (directApprove.data ?? []).length === 0, directApprove.error?.message ?? directApprove.data);
    const directSlip = await sb.from('payslips').update({ net_pay: 1 }).eq('id', slip.id).select('id');
    check('Direct API write to payslips is refused', !!directSlip.error || (directSlip.data ?? []).length === 0, directSlip.error?.message ?? directSlip.data);
    const directItem = await sb.from('payslip_items').update({ irp5_code: '3601' }).eq('payslip_id', slip.id).select('id');
    check('Direct API write to payslip_items is refused', !!directItem.error || (directItem.data ?? []).length === 0, directItem.error?.message ?? directItem.data);
    const legacy = await sb.rpc('generate_payslips_for_run', { p_run_id: run.id, p_company_id: companyId });
    check('Legacy generate_payslips_for_run is withdrawn', !!legacy.error, legacy.error?.message);
    const preparerRpc = await sb.rpc('payroll_run_add_preparer', { p_run_id: run.id, p_user_id: me });
    check('payroll_run_add_preparer is not callable from the browser', !!preparerRpc.error, preparerRpc.error?.message);
    const owned = await sb.from('payslips').select('id').eq('payroll_run_id', run.id);
    check('Owners and admins can still read payslips directly', !owned.error && (owned.data ?? []).length > 0, owned.error?.message);

    // ── An edit cannot change the IRP5 code of a line. ──
    const tampered = (slip.payslip_items ?? []).map((i) => ({ ...i, irp5_code: i.description === 'Basic Salary' ? '3605' : i.irp5_code }));
    await payroll({ method: 'UPDATE_PAYSLIP', payslipId: slip.id, items: tampered });
    slip = await slipFor(complete.id);
    check('Payslip edit keeps the generated IRP5 code', codeOf('Basic Salary') === '3601', codeOf('Basic Salary'));

    // ── Owner allows self-approval: approval succeeds and is flagged. ──
    await payroll({ method: 'UPDATE_PAYROLL_CONTROLS', allow_self_approval: true, reason: 'CERT TX: single test user runs payroll' });
    await payroll({ method: 'APPROVE_RUN', runId: run.id });
    const approved = await payroll<RunDetail>({ method: 'GET_RUN_DETAIL', runId: run.id });
    const approvalEvent = (approved.audit_events ?? []).find((e) => e.event_type === 'run_approved');
    check('With the exception on, the run is approved and flagged as self-approved',
      !!approved.run.approved_at && approvalEvent?.event_data?.self_approved === true && !!approvalEvent?.event_data?.self_approval_reason, approvalEvent?.event_data);

    // ── Finalise and build the IRP5 the way the Statutory Returns page does. ──
    await payroll({ method: 'FINALIZE_RUN', runId: run.id, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
    finalisedRunId = run.id;
    runsToDiscard.splice(runsToDiscard.indexOf(run.id), 1);
    const finalSlip = await slipFor(complete.id);
    const fact = mapRawPayslipToPayrollFact({
      companyId, payrollRunId: run.id, payDate: '2026-03-31', runStatus: 'finalized', payslipId: finalSlip.id,
      employeeId: complete.id, employees: finalSlip.employees as never,
      total_earnings: finalSlip.total_earnings, total_deductions: finalSlip.total_deductions, net_pay: finalSlip.net_pay,
      calculation_snapshot: finalSlip.calculation_snapshot as Record<string, unknown>, payslip_items: finalSlip.payslip_items,
    });
    const irp5 = generateIrp5({ country: 'ZA', taxYear: '2026-2027', runs: factsToStatutoryRunSources([fact]) });
    const amounts = Object.fromEntries(((irp5.declarationData.certificates as Array<{ amounts: Array<{ code: string; amount: number }> }>)[0]?.amounts ?? []).map((a) => [a.code, a.amount]));
    const payeLine = Number(line(finalSlip, 'PAYE')?.amount);
    check('IRP5 from the finalised payslip: 3601 R30 000, 3701 R4 000, 4001 R2 250, 4102 = PAYE line',
      amounts['3601'] === 30_000 && amounts['3701'] === 4_000 && amounts['4001'] === 2_250 && near(amounts['4102'], payeLine, 0.01), amounts);
    check('IRP5 used the stamped codes (no amounts inferred from wording) and validates',
      !irp5.validationResult.issues.some((i) => i.code === 'IRP5_AMOUNTS_INFERRED' || i.code === 'IRP5_PAYE_MISMATCH'), irp5.validationResult.issues);
  } finally {
    for (const runId of runsToDiscard) await payroll({ method: 'DISCARD_RUN', runId }).catch((e) => console.log('discard failed', runId, e.message));
    if (finalisedRunId) {
      await payroll({ method: 'REVERSE_RUN', runId: finalisedRunId, reason: 'Phase 1 live check clean-up' })
        .then(() => console.log('Finalised check run reversed'))
        .catch((e) => console.log('reverse failed', finalisedRunId, e.message));
    }
    await payroll({ method: 'UPDATE_PAYROLL_SETTINGS', settings: [{ rule_id: 'pension', enabled: originalPension?.enabled ?? false, config: originalPension?.config ?? {} }] });
    await payroll({
      method: 'UPDATE_PAYROLL_CONTROLS',
      allow_self_approval: originalControls.allow_self_approval,
      reason: originalControls.self_approval_reason ?? undefined,
    });
    // Employees never paid have no payslips and can be removed; the others end in the test month.
    for (const id of [noSalary.id, weekly.id]) {
      await invoke(sb, 'employees', { method: 'DELETE', company_id: companyId, employeeId: id, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID() })
        .catch((e) => console.log('employee delete failed', id, e.message));
    }
    console.log(`Pension setting and approval control restored (self-approval ${originalControls.allow_self_approval ? 'on' : 'off'})`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
