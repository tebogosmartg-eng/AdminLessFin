// @ts-nocheck
/**
 * The leave register as payroll reads it: register rows to the pure BCEA rules, the
 * balances printed on a payslip, and the unpaid leave that reduces a payslip's salary.
 */
import {
  leaveBalance,
  leaveWorkingDays,
  paidShareAfterUnpaidLeave,
  unpaidLeaveDaysInPeriod,
  type LeaveEntry,
} from './payrollRulesEngine/leave.ts';

/** Register row → the pure rules' entry. */
export function toLeaveEntry(row): LeaveEntry {
  return {
    leaveTypeId: row.leave_type_id,
    entryType: row.entry_type,
    startDate: row.start_date,
    endDate: row.end_date,
    effectiveDate: row.effective_date,
    days: Number(row.days),
    status: row.status,
  };
}

export function leaveEmployee(e) {
  return {
    startDate: e.start_date ?? null,
    endDate: e.end_date ?? null,
    workDaysPerWeek: e.work_days_per_week == null ? null : Number(e.work_days_per_week),
    annualLeaveDaysPerCycle: e.annual_leave_days_per_cycle == null ? null : Number(e.annual_leave_days_per_cycle),
  };
}

export async function loadLeaveRows(admin, companyId, employeeIds?: string[]) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = admin.from('employee_leave_entries').select('*').eq('company_id', companyId).order('effective_date').range(from, from + 999);
    if (employeeIds) query = query.in('employee_id', employeeIds);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/** Types and register rows for the employees on a run (none until leave is first used). */
export async function loadLeaveContext(admin, companyId, employeeIds: string[]) {
  const { data: types, error } = await admin.from('company_leave_types').select('*').eq('company_id', companyId);
  if (error) throw error;
  if (!(types ?? []).length || !employeeIds.length) return { types: types ?? [], rows: [] };
  return { types, rows: await loadLeaveRows(admin, companyId, employeeIds) };
}

/** Annual, sick and family responsibility balances as at a date, for the payslip. */
export function payslipLeaveBalances(employee, context, asAt) {
  const out = {};
  for (const [key, accrual] of [['annual', 'bcea_annual'], ['sick', 'bcea_sick'], ['family', 'bcea_family']]) {
    const type = (context?.types ?? []).find((t) => t.accrual === accrual && t.active);
    if (!type) continue;
    const entries = (context.rows ?? []).filter((r) => r.employee_id === employee.id && r.leave_type_id === type.id).map(toLeaveEntry);
    out[key] = leaveBalance(accrual, leaveEmployee(employee), entries, asAt).balance;
  }
  return out;
}

/**
 * Unpaid leave in the part of the period the employee was employed, and the share of the
 * period's basic salary still paid. `employmentFactor` is the partial-period fraction.
 */
export function unpaidLeaveForPayslip(employee, context, periodStart: string, periodEnd: string, employmentFactor: number) {
  const unpaidTypeIds = new Set((context?.types ?? []).filter((t) => !t.paid).map((t) => t.id));
  const entries = (context?.rows ?? [])
    .filter((r) => r.employee_id === employee.id && unpaidTypeIds.has(r.leave_type_id))
    .map(toLeaveEntry);
  if (!entries.length) return { unpaidDays: 0, paidShare: employmentFactor };
  const from = employee.start_date && employee.start_date > periodStart ? employee.start_date : periodStart;
  const to = employee.end_date && employee.end_date < periodEnd ? employee.end_date : periodEnd;
  const unpaidDays = unpaidLeaveDaysInPeriod(entries, from, to, employee.work_days_per_week);
  const workingDaysEmployed = leaveWorkingDays(from, to, employee.work_days_per_week);
  return {
    unpaidDays,
    paidShare: paidShareAfterUnpaidLeave({ employmentFactor, unpaidDays, workingDaysEmployed }),
  };
}
