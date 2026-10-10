/**
 * Live check of Payroll Phase 3 (leave management) against the deployed payroll function
 * and database. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-leave-live.ts
 *
 * Two fortnightly employees in 2025 (no other CERT TX employee is paid fortnightly after
 * August 2025): balances under the BCEA, leave taken, the balance and overlap guards,
 * unpaid leave reducing pay in a finalised run, and a leaver's leave paid out, drawn from
 * the balance on finalising and given back when the run is reversed.
 *
 * Leave entries and runs are permanent records; the test employees end in 2025, so no
 * later run pays them.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPANY_NAME = 'CERT TX 1785230675937';
const START = '2025-09-01';
/** Complete SARS details, so certificates that include these employees can be filed. */
const SARS_COMPLETE = {
  tax_number: '0001339050', phone: '0215550100',
  residential_street_number: '12', residential_street_name: 'Long Street', residential_suburb: 'Gardens',
  residential_city: 'Cape Town', residential_postal_code: '8001',
  bank_name: 'FNB', bank_account_number: '62000000001', bank_branch_code: '250655', bank_account_type: 'current',
};

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

type Balance = { code: string; entitled: number; taken: number; balance: number; available: number; cycleStart: string | null };
type EmployeeLeave = { balances: Balance[]; entries: Array<{ id: string; entry_type: string; status: string; days: number; payroll_run_id: string | null }>; types: Array<{ id: string; code: string }> };
type Payslip = { id: string; employee_id: string; calculation_snapshot: Record<string, any> };
type Item = { description: string; amount: number; irp5_code: string | null };
type RunDetail = { payslips: Payslip[]; warnings?: Array<{ code: string; employee_id: string; message: string }> };

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'payroll', { company_id: companyId, ...body });
  const stamp = Date.now().toString().slice(-6);
  const letters = [...stamp].map((d) => 'ABCDEFGHIJ'[Number(d)]).join('');

  const coa = await invoke<Array<{ id: string; name: string; type: string }>>(sb, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const wage = coa.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name))!;
  const bank = coa.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))!;
  const liability = coa.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ?? coa.find((a) => a.type === 'Liability')!;

  // Earlier runs of this check started on 6 January 2025 without full SARS details; complete them.
  const { data: earlier } = await sb.from('employees').select('id, id_number').eq('company_id', companyId).like('last_name', 'Leave %').eq('department', 'Certification');
  for (const e of earlier ?? []) {
    await invoke(sb, 'employees', { method: 'PUT', company_id: companyId, employeeId: e.id, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(), employeeData: { ...SARS_COMPLETE, id_number: e.id_number ?? '8601015800086' } });
  }

  const employee = (first: string, endDate: string, idNumber: string) => invoke<{ id: string }>(sb, 'employees', {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: first, last_name: `Leave ${letters}`, email: `${first.toLowerCase()}.${stamp}@adminless-fin.test`,
      department: 'Certification', position: 'Leave check', employment_type: 'permanent',
      // Starts after the statutory-workspace check's fortnightly months (March–August 2025).
      start_date: START, end_date: endDate, salary_period: 'fortnightly', salary_amount: 10_000,
      work_days_per_week: 5, ...SARS_COMPLETE, id_number: idNumber,
    },
  });
  const leaveOf = (employeeId: string, asAt: string) => payroll<EmployeeLeave>({ method: 'GET_EMPLOYEE_LEAVE', employeeId, asAt });
  const bal = (l: EmployeeLeave, code: string) => l.balances.find((b) => b.code === code)!;
  const runFor = async (start: string, end: string) => {
    const run = await payroll<{ id: string }>({ method: 'CREATE_RUN', additional_run: true, runData: { pay_period_start: start, pay_period_end: end, pay_date: end, pay_frequency: 'fortnightly' } });
    await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
    return run.id;
  };
  const detail = (runId: string) => payroll<RunDetail>({ method: 'GET_RUN_DETAIL', runId });
  const items = async (payslipId: string) => (await payroll<{ payslip_items: Item[] }>({ method: 'GET_PAYSLIP_DETAIL', payslipId })).payslip_items ?? [];

  // A re-run pays October again: reverse this check's earlier October run so its period is open.
  const earlierRuns = await payroll<Array<{ id: string; status: string; pay_frequency: string | null; pay_period_start: string; output_metadata?: { reversed_at?: string; processed_at?: string } | null }>>({ method: 'GET_RUNS' });
  // A reversed run keeps status 'finalized' with reversed_at after its last processed_at.
  const reversed = (x: (typeof earlierRuns)[number]) => !!x.output_metadata?.reversed_at && (!x.output_metadata.processed_at || x.output_metadata.processed_at <= x.output_metadata.reversed_at);
  for (const r of earlierRuns.filter((x) => x.pay_frequency === 'fortnightly' && x.pay_period_start === '2025-10-13' && ['finalized', 'paid'].includes(x.status) && !reversed(x))) {
    await payroll({ method: 'REVERSE_RUN', runId: r.id, reason: 'Leave live check re-run: reopen October' });
  }

  // ── Types and balances ──
  const types = await payroll<Array<{ id: string; code: string; paid: boolean; accrual: string }>>({ method: 'GET_LEAVE_TYPES' });
  check('The BCEA leave types exist (annual, sick, family responsibility, maternity, parental, unpaid)',
    ['annual', 'sick', 'family', 'maternity', 'parental', 'unpaid'].every((c) => types.some((t) => t.code === c)), types.map((t) => t.code));
  const typeId = (code: string) => types.find((t) => t.code === code)!.id;

  const keeper = await employee('Keeper', '2025-12-31', '8601015800086');
  const leaver = await employee('Leaver', '2025-11-21', '8001015009087');
  // Taken on from a previous payroll with 10 days of annual leave.
  await payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('annual'), entryType: 'opening_balance', effectiveDate: START, days: 10 });
  await payroll({ method: 'RECORD_LEAVE', employeeId: leaver.id, leaveTypeId: typeId('annual'), entryType: 'opening_balance', effectiveDate: START, days: 10 });
  let k = await leaveOf(keeper.id, '2025-10-01');
  check('Annual leave: 10 days taken on plus 15 × 31/365 = 1.27 accrued from 1 September to 1 October', near(bal(k, 'annual').entitled, 11.27), bal(k, 'annual'));
  check('Sick leave in the first 6 months: 1 day for every 26 days worked (21 days by 1 October: none yet)', bal(k, 'sick').entitled === 0 && /26 days/.test(String((bal(k, 'sick') as Balance & { note?: string }).note)), bal(k, 'sick'));
  check('Family responsibility: none in the first 4 months', bal(k, 'family').entitled === 0);

  // ── Leave taken and its guards ──
  await payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('annual'), entryType: 'taken', startDate: '2025-10-06', endDate: '2025-10-10' });
  k = await leaveOf(keeper.id, '2025-10-31');
  check('Five days of annual leave taken; the balance falls by 5', bal(k, 'annual').taken === 5 && near(bal(k, 'annual').balance, bal(k, 'annual').entitled - 5), bal(k, 'annual'));
  check('Sick leave by 31 October: 44 working days worked → 1 day', bal(k, 'sick').entitled === 1, bal(k, 'sick'));
  const overlap = await refused(payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('unpaid'), entryType: 'taken', startDate: '2025-10-09', endDate: '2025-10-09' }));
  check('Leave overlapping recorded leave is refused', /LEAVE_OVERLAP/.test(overlap), overlap.slice(0, 120));
  const tooMuch = await refused(payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('annual'), entryType: 'taken', startDate: '2025-11-03', endDate: '2025-12-12' }));
  check('More annual leave than available is refused', /LEAVE_BALANCE_EXCEEDED/.test(tooMuch), tooMuch.slice(0, 160));
  const weekend = await refused(payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('annual'), entryType: 'taken', startDate: '2025-10-11', endDate: '2025-10-12' }));
  check('A weekend is not a leave day', /LEAVE_NO_WORKING_DAYS/.test(weekend));
  const noReason = await refused(payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('annual'), entryType: 'adjustment', effectiveDate: '2025-10-01', days: 1 }));
  check('An adjustment needs a reason', /REASON_REQUIRED/.test(noReason));
  await payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('annual'), entryType: 'adjustment', effectiveDate: '2025-10-01', days: 2, reason: 'Two days granted for long service' });
  k = await leaveOf(keeper.id, '2025-10-31');
  check('An adjustment adds to the balance', bal(k, 'annual').balance === Math.round((bal(k, 'annual').entitled - 5 + 2) * 100) / 100, bal(k, 'annual'));
  const sickEntry = (await payroll<{ entry: { id: string } }>({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('sick'), entryType: 'taken', startDate: '2025-10-30', endDate: '2025-10-30' })).entry;
  await payroll({ method: 'CANCEL_LEAVE', entryId: sickEntry.id, reason: 'Recorded against the wrong employee' });
  k = await leaveOf(keeper.id, '2025-10-31');
  check('Cancelled leave gives the day back', bal(k, 'sick').taken === 0, bal(k, 'sick'));

  // ── Unpaid leave reduces pay ──
  await payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('unpaid'), entryType: 'taken', startDate: '2025-10-16', endDate: '2025-10-17' });
  const octRun = await runFor('2025-10-13', '2025-10-26');
  let d = await detail(octRun);
  const kp = d.payslips.find((p) => p.employee_id === keeper.id)!;
  const basic = (await items(kp.id)).find((i) => i.irp5_code === '3601')!;
  check('2 unpaid days of 10 working days: basic salary R8 000 instead of R10 000', near(Number(basic.amount), 8000) && kp.calculation_snapshot.period_employment?.unpaid_leave_days === 2, { basic: basic.amount, unpaid: kp.calculation_snapshot.period_employment?.unpaid_leave_days });
  check('Pay periods worked are unchanged (pro-rata factor 1)', kp.calculation_snapshot.period_employment?.pro_rata_factor === 1);
  check('The payslip carries the leave balances as at the period end',
    typeof kp.calculation_snapshot.leave_balances?.annual === 'number' && typeof kp.calculation_snapshot.leave_balances?.sick === 'number', kp.calculation_snapshot.leave_balances);
  await payroll({ method: 'APPROVE_RUN', runId: octRun });
  await payroll({ method: 'FINALIZE_RUN', runId: octRun, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
  const unpaidRow = (await leaveOf(keeper.id, '2025-10-31')).entries.find((e) => e.entry_type === 'taken' && e.status === 'approved' && e.days === 2)!;
  const closed = await refused(payroll({ method: 'CANCEL_LEAVE', entryId: unpaidRow.id, reason: 'Try to undo after pay' }));
  check('Unpaid leave in a finalised run cannot be cancelled', /PAYROLL_PERIOD_CLOSED/.test(closed));
  const closedNew = await refused(payroll({ method: 'RECORD_LEAVE', employeeId: keeper.id, leaveTypeId: typeId('unpaid'), entryType: 'taken', startDate: '2025-10-22', endDate: '2025-10-22' }));
  check('New unpaid leave in a finalised period is refused', /PAYROLL_PERIOD_CLOSED/.test(closedNew));

  // ── A leaver's leave paid out ──
  const novRun = await runFor('2025-11-10', '2025-11-23');
  d = await detail(novRun);
  const due = d.warnings?.find((w) => w.code === 'LEAVE_PAYOUT_DUE' && w.employee_id === leaver.id);
  check('The run warns that the leaver has annual leave owing', !!due, due?.message);
  const expectedDays = Math.round((10 + (15 * 82) / 365) * 100) / 100; // 10 taken on + 1 Sep – 21 Nov 2025
  const added = await payroll<{ days: number; dailyRate: number; amount: number }>({ method: 'ADD_LEAVE_PAYOUT', runId: novRun, employeeId: leaver.id });
  check('Leave pay added: the balance at the end date × the BCEA daily rate (R10 000 ÷ 10 = R1 000)',
    near(added.days, expectedDays) && added.dailyRate === 1000 && near(added.amount, expectedDays * 1000), added);
  await payroll({ method: 'GENERATE_PAYSLIPS', runId: novRun });
  d = await detail(novRun);
  const lp = d.payslips.find((p) => p.employee_id === leaver.id)!;
  const leavePay = (await items(lp.id)).find((i) => i.irp5_code === '3605');
  check('The leaver\'s payslip has the leave pay under IRP5 code 3605', !!leavePay && near(Number(leavePay.amount), added.amount), leavePay);
  check('The warning is gone once the leave pay is on the run', !d.warnings?.some((w) => w.code === 'LEAVE_PAYOUT_DUE' && w.employee_id === leaver.id));
  await payroll({ method: 'APPROVE_RUN', runId: novRun });
  await payroll({ method: 'FINALIZE_RUN', runId: novRun, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
  let l = await leaveOf(leaver.id, '2025-11-21');
  check('Finalising draws the paid-out days from the annual balance (nil left)',
    l.entries.some((e) => e.entry_type === 'payout' && e.status === 'approved' && e.payroll_run_id === novRun) && near(bal(l, 'annual').balance, 0), bal(l, 'annual'));
  const payoutEntry = l.entries.find((e) => e.entry_type === 'payout' && e.status === 'approved')!;
  const cancelPayout = await refused(payroll({ method: 'CANCEL_LEAVE', entryId: payoutEntry.id, reason: 'Try to cancel the payout' }));
  check('Leave paid out cannot be cancelled by hand', /LEAVE_PAYOUT_LOCKED/.test(cancelPayout));
  await payroll({ method: 'REVERSE_RUN', runId: novRun, reason: 'Leave live check: reverse the termination run' });
  l = await leaveOf(leaver.id, '2025-11-21');
  check('Reversing the run gives the leave back', near(bal(l, 'annual').balance, expectedDays) && l.entries.some((e) => e.entry_type === 'payout' && e.status === 'cancelled'), bal(l, 'annual'));

  // ── The register is written only through payroll ──
  const direct = await sb.from('employee_leave_entries').insert({ company_id: companyId, employee_id: keeper.id, leave_type_id: typeId('annual'), entry_type: 'adjustment', effective_date: '2025-10-01', days: 50, reason: 'forged', created_by: keeper.id }).select('id');
  check('Leave cannot be written through the API', !!direct.error, direct.error?.message);
  const edit = await sb.from('employee_leave_entries').update({ days: 99 }).eq('id', payoutEntry.id).select('id');
  check('Leave entries cannot be changed through the API', !!edit.error || (edit.data ?? []).length === 0, edit.error?.message);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
