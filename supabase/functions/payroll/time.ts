// @ts-nocheck
/**
 * Time and attendance for a payroll run (Phase 4): the run's timesheet of hours or days
 * worked, overtime, Sunday and public holiday hours, typed in or imported from the
 * approved hours in Work Management. Every write is made here with the service role.
 */
import {
  dailyWage,
  hourlyWage,
  hoursPerDay,
  payBasisOf,
  timePayLines,
  timesheetIssues,
  workDays,
} from '../_shared/payrollRulesEngine/timePay.ts'
import { isEmployeeActiveInPeriod, saPublicHolidays } from '../_shared/payrollRulesEngine/periodEmployment.ts'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const TIME_METHODS = new Set(['GET_TIMESHEET', 'SAVE_TIMESHEET', 'IMPORT_WORK_HOURS']);

const FIELDS = [
  ['ordinaryHours', 'ordinary_hours', 744],
  ['daysWorked', 'days_worked', 31],
  ['overtimeHours', 'overtime_hours', 744],
  ['sundayHours', 'sunday_hours', 120],
  ['publicHolidayHours', 'public_holiday_hours', 120],
  ['publicHolidayDaysPaid', 'public_holiday_days_paid', 10],
] as const;

function isPublicHoliday(day: string) {
  return saPublicHolidays(Number(day.slice(0, 4))).has(day);
}

/** Public holidays on the employee's working days within the part of the period they were employed. */
export function publicHolidaysOnWorkingDays(employee, periodStart: string, periodEnd: string): string[] {
  const from = employee.start_date && employee.start_date > periodStart ? employee.start_date : periodStart;
  const to = employee.end_date && employee.end_date < periodEnd ? employee.end_date : periodEnd;
  const week = workDays(employee);
  const out = [];
  for (let t = utc(from); t <= utc(to); t += DAY) {
    const day = iso(t);
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 && week < 7) continue;
    if (weekday === 6 && week < 6) continue;
    if (isPublicHoliday(day)) out.push(day);
  }
  return out;
}

async function loadRun(admin, companyId, runId, Err) {
  const { data, error } = await admin.from('payroll_runs').select('*').eq('id', runId).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Err({ stage: 'validation', code: 'RUN_NOT_FOUND', message: 'That payroll run was not found.', recovery: 'Refresh the page.', status: 404 });
  return data;
}

async function runEmployees(admin, companyId, run) {
  const { data, error } = await admin.from('employees').select('*').eq('company_id', companyId);
  if (error) throw error;
  const frequency = run.pay_frequency ?? 'monthly';
  return (data ?? []).filter((e) => (e.salary_period ?? 'monthly') === frequency && isEmployeeActiveInPeriod(e, run.pay_period_start, run.pay_period_end));
}

/** Approved Work Management hours in the period not yet paid by a run, summed per employee. */
async function readyWorkHours(admin, companyId, run, employeeIds: string[]) {
  if (!employeeIds.length) return new Map();
  const { data, error } = await admin.from('ewm_payroll_input_facts')
    .select('id, employee_id, entry_date, hours, is_overtime')
    .eq('company_id', companyId).eq('status', 'ready').is('payroll_run_id', null)
    .gte('entry_date', run.pay_period_start).lte('entry_date', run.pay_period_end)
    .in('employee_id', employeeIds);
  if (error) throw error;
  const byEmployee = new Map();
  for (const f of data ?? []) {
    const sums = byEmployee.get(f.employee_id) ?? { ordinary: 0, overtime: 0, sunday: 0, publicHoliday: 0, factIds: [], days: new Set() };
    const hours = Number(f.hours) || 0;
    const weekday = new Date(utc(f.entry_date)).getUTCDay();
    if (isPublicHoliday(f.entry_date)) sums.publicHoliday += hours;
    else if (weekday === 0) sums.sunday += hours;
    else if (f.is_overtime) sums.overtime += hours;
    else { sums.ordinary += hours; sums.days.add(f.entry_date); }
    sums.factIds.push(f.id);
    byEmployee.set(f.employee_id, sums);
  }
  for (const sums of byEmployee.values()) {
    sums.ordinary = round2(sums.ordinary); sums.overtime = round2(sums.overtime);
    sums.sunday = round2(sums.sunday); sums.publicHoliday = round2(sums.publicHoliday);
    sums.daysWorked = sums.days.size;
    delete sums.days;
  }
  return byEmployee;
}

/** Hours from Work Management paid by a finalised run are consumed (paid once). */
export async function consumeWorkHours(admin, companyId, runId) {
  const { data, error } = await admin.from('payroll_timesheets').select('work_fact_ids').eq('company_id', companyId).eq('payroll_run_id', runId);
  if (error) throw error;
  const ids = [...new Set((data ?? []).flatMap((r) => r.work_fact_ids ?? []))];
  if (!ids.length) return 0;
  const { error: updateError } = await admin.from('ewm_payroll_input_facts')
    .update({ status: 'consumed', payroll_run_id: runId })
    .eq('company_id', companyId).in('id', ids).is('payroll_run_id', null);
  if (updateError) throw updateError;
  return ids.length;
}

/** A reversed or reopened run releases the hours it paid. */
export async function releaseWorkHours(admin, companyId, runId) {
  const { error } = await admin.from('ewm_payroll_input_facts')
    .update({ status: 'ready', payroll_run_id: null })
    .eq('company_id', companyId).eq('payroll_run_id', runId);
  if (error) throw error;
}

function toRow(t) {
  return t ? Object.fromEntries(FIELDS.map(([key, column]) => [key, Number(t[column]) || 0])) : null;
}

export async function handleTimeMethod(method, ctx) {
  const { supabaseAdmin: admin, company_id, user, body, PayrollDomainError: Err, logPayrollAudit, addRunPreparer } = ctx;
  const run = await loadRun(admin, company_id, body.runId, Err);
  const employees = await runEmployees(admin, company_id, run);
  const name = (e) => [e.first_name, e.last_name].filter(Boolean).join(' ') || e.id;

  const loadSheets = async () => {
    const { data, error } = await admin.from('payroll_timesheets').select('*').eq('company_id', company_id).eq('payroll_run_id', run.id);
    if (error) throw error;
    return data ?? [];
  };
  const requireDraft = () => {
    if (run.status !== 'draft') {
      throw new Err({ stage: 'state_transition', code: 'RUN_NOT_DRAFT', message: 'The timesheet can only change while the run is a draft.', recovery: 'Reopen the run first.', status: 409 });
    }
  };

  if (method === 'GET_TIMESHEET') {
    const sheets = await loadSheets();
    const work = await readyWorkHours(admin, company_id, run, employees.map((e) => e.id));
    const rows = employees
      .filter((e) => payBasisOf(e) !== 'salaried' || sheets.some((s) => s.employee_id === e.id))
      .map((e) => {
        const sheet = sheets.find((s) => s.employee_id === e.id) ?? null;
        const pay = timePayLines(e, sheet);
        return {
          employeeId: e.id,
          name: name(e),
          employeeNumber: e.employee_number,
          employmentType: e.employment_type,
          payBasis: payBasisOf(e),
          rate: e.pay_rate == null ? null : Number(e.pay_rate),
          hourlyWage: hourlyWage(e),
          dailyWage: dailyWage(e),
          hoursPerDay: hoursPerDay(e),
          worksSundays: e.works_sundays === true,
          taxMethod: e.tax_method ?? 'tables',
          timesheet: toRow(sheet),
          source: sheet?.source ?? null,
          suggestedPublicHolidays: payBasisOf(e) === 'salaried' ? [] : publicHolidaysOnWorkingDays(e, run.pay_period_start, run.pay_period_end),
          workHours: work.get(e.id) ?? null,
          estimatedPay: round2(pay.ordinaryPay + pay.lines.reduce((s, l) => s + l.amount, 0)),
          lines: pay.lines,
          issues: timesheetIssues(e, sheet, run.pay_period_start, run.pay_period_end),
        };
      });
    return {
      run: { id: run.id, status: run.status, payPeriodStart: run.pay_period_start, payPeriodEnd: run.pay_period_end, payFrequency: run.pay_frequency ?? 'monthly' },
      rows,
      salaried: employees.filter((e) => payBasisOf(e) === 'salaried' && !sheets.some((s) => s.employee_id === e.id)).map((e) => ({ employeeId: e.id, name: name(e) })),
      workHoursWaiting: [...work.values()].reduce((s, w) => s + w.factIds.length, 0),
    };
  }

  if (method === 'SAVE_TIMESHEET') {
    requireDraft();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new Err({ stage: 'validation', code: 'TIMESHEET_EMPTY', message: 'Nothing to save.', recovery: 'Enter hours or days.' });
    const saved = [];
    for (const row of rows) {
      const employee = employees.find((e) => e.id === row.employeeId);
      if (!employee) {
        throw new Err({ stage: 'validation', code: 'TIMESHEET_EMPLOYEE', message: 'An employee on the timesheet is not on this run (pay frequency or employment dates).', recovery: 'Refresh the timesheet.' });
      }
      const values = {};
      for (const [key, column, max] of FIELDS) {
        const v = row[key] === '' || row[key] == null ? 0 : Number(row[key]);
        if (!Number.isFinite(v) || v < 0 || v > max) {
          throw new Err({ stage: 'validation', code: 'TIMESHEET_VALUE', message: `${name(employee)}: ${key} must be between 0 and ${max}.`, recovery: 'Correct the value.' });
        }
        values[column] = round2(v);
      }
      if (payBasisOf(employee) === 'hourly') values.days_worked = 0;
      if (payBasisOf(employee) === 'daily') values.ordinary_hours = 0;
      if (payBasisOf(employee) === 'salaried') { values.ordinary_hours = 0; values.days_worked = 0; values.public_holiday_days_paid = 0; }
      const empty = Object.values(values).every((v) => !v);
      if (empty) {
        const { error } = await admin.from('payroll_timesheets').delete().eq('payroll_run_id', run.id).eq('employee_id', employee.id);
        if (error) throw error;
        continue;
      }
      const keepWork = row.source === 'work_module' && Array.isArray(row.workFactIds);
      const { data, error } = await admin.from('payroll_timesheets').upsert({
        company_id, payroll_run_id: run.id, employee_id: employee.id, ...values,
        source: keepWork ? 'work_module' : 'manual', work_fact_ids: keepWork ? row.workFactIds : [], updated_by: user.id,
      }, { onConflict: 'payroll_run_id,employee_id' }).select().single();
      if (error) throw error;
      saved.push({ employeeId: employee.id, issues: timesheetIssues(employee, data, run.pay_period_start, run.pay_period_end) });
    }
    await addRunPreparer(admin, run.id, user.id);
    await logPayrollAudit(admin, { company_id, payroll_run_id: run.id, event_type: 'timesheet_saved', event_data: { employees: rows.length }, created_by: user.id });
    return { saved };
  }

  if (method === 'IMPORT_WORK_HOURS') {
    requireDraft();
    const work = await readyWorkHours(admin, company_id, run, employees.map((e) => e.id));
    let imported = 0;
    for (const [employeeId, w] of work) {
      const employee = employees.find((e) => e.id === employeeId);
      const basis = payBasisOf(employee);
      const { data: existing } = await admin.from('payroll_timesheets').select('public_holiday_days_paid')
        .eq('payroll_run_id', run.id).eq('employee_id', employeeId).maybeSingle();
      const { error } = await admin.from('payroll_timesheets').upsert({
        company_id, payroll_run_id: run.id, employee_id: employeeId,
        ordinary_hours: basis === 'hourly' ? w.ordinary : 0,
        days_worked: basis === 'daily' ? w.daysWorked : 0,
        overtime_hours: w.overtime, sunday_hours: w.sunday, public_holiday_hours: w.publicHoliday,
        public_holiday_days_paid: existing?.public_holiday_days_paid ?? 0,
        source: 'work_module', work_fact_ids: w.factIds, updated_by: user.id,
      }, { onConflict: 'payroll_run_id,employee_id' });
      if (error) throw error;
      imported += 1;
    }
    if (imported) await addRunPreparer(admin, run.id, user.id);
    await logPayrollAudit(admin, { company_id, payroll_run_id: run.id, event_type: 'work_hours_imported', event_data: { employees: imported }, created_by: user.id });
    return { imported };
  }
  return undefined;
}
