// @ts-nocheck
/**
 * Time and attendance for a payroll run (Phase 4): the run's timesheet of hours or days
 * worked, overtime, Sunday and public holiday hours, typed in or imported from the
 * approved hours in Work Management. Every write is made here with the service role.
 */
import {
  attendanceTotals,
  dailyWage,
  hourlyWage,
  hoursPerDay,
  payBasisOf,
  policyBelowBcea,
  timePayLines,
  timePolicyFrom,
  timesheetIssues,
  workDays,
} from '../_shared/payrollRulesEngine/timePay.ts'
import { isEmployeeActiveInPeriod, saPublicHolidays } from '../_shared/payrollRulesEngine/periodEmployment.ts'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const TIME_METHODS = new Set([
  'GET_TIMESHEET', 'SAVE_TIMESHEET', 'IMPORT_WORK_HOURS', 'IMPORT_ATTENDANCE', 'COPY_PREVIOUS_TIMESHEET',
  'GET_ATTENDANCE', 'SAVE_ATTENDANCE', 'GET_PAYROLL_POLICIES', 'UPDATE_PAYROLL_POLICIES',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The company's pay rules (BCEA defaults when never saved). */
export async function loadPayrollPolicy(admin, companyId) {
  const { data, error } = await admin.from('company_payroll_policies').select('*').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return { row: data, time: timePolicyFrom(data), allowNegativeLeave: data?.allow_negative_leave === true };
}

async function unpaidAttendance(admin, companyId, employeeIds: string[], from: string, to: string) {
  if (!employeeIds.length) return [];
  const { data, error } = await admin.from('payroll_attendance').select('employee_id, work_date, hours')
    .eq('company_id', companyId).is('payroll_run_id', null).gte('work_date', from).lte('work_date', to).in('employee_id', employeeIds);
  if (error) throw error;
  return data ?? [];
}

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
  // Register days in the period of everyone on the run's timesheet are paid by this run
  // (filled from the register, or typed in after looking at it), so they lock.
  const { data: run } = await admin.from('payroll_runs').select('pay_period_start, pay_period_end').eq('id', runId).single();
  const { data: fromRegister } = await admin.from('payroll_timesheets').select('employee_id')
    .eq('company_id', companyId).eq('payroll_run_id', runId);
  if (run && (fromRegister ?? []).length) {
    const { error: lockError } = await admin.from('payroll_attendance').update({ payroll_run_id: runId })
      .eq('company_id', companyId).is('payroll_run_id', null)
      .gte('work_date', run.pay_period_start).lte('work_date', run.pay_period_end)
      .in('employee_id', fromRegister.map((r) => r.employee_id));
    if (lockError) throw lockError;
  }
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
  const { error: attendanceError } = await admin.from('payroll_attendance').update({ payroll_run_id: null })
    .eq('company_id', companyId).eq('payroll_run_id', runId);
  if (attendanceError) throw attendanceError;
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
  const name = (e) => [e.first_name, e.last_name].filter(Boolean).join(' ') || e.id;

  if (method === 'GET_PAYROLL_POLICIES') {
    const policy = await loadPayrollPolicy(admin, company_id);
    return { ...policy.time, allowNegativeLeave: policy.allowNegativeLeave, belowBcea: policyBelowBcea(policy.time), updatedAt: policy.row?.updated_at ?? null };
  }

  if (method === 'UPDATE_PAYROLL_POLICIES') {
    const value = (key, min, max) => {
      const v = Number(body[key]);
      if (!Number.isFinite(v) || v < min || v > max) {
        throw new Err({ stage: 'validation', code: 'POLICY_VALUE', message: `${key} must be between ${min} and ${max}.`, recovery: 'Correct the value.' });
      }
      return Math.round(v * 100) / 100;
    };
    const row = {
      company_id,
      overtime_multiplier: value('overtimeMultiplier', 1, 5),
      sunday_multiplier: value('sundayMultiplier', 1, 5),
      sunday_multiplier_regular: value('sundayMultiplierRegular', 1, 5),
      public_holiday_multiplier: value('publicHolidayMultiplier', 1, 5),
      minimum_shift_hours: value('minimumShiftHours', 0, 12),
      allow_negative_leave: body.allowNegativeLeave === true,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from('company_payroll_policies').upsert(row, { onConflict: 'company_id' }).select().single();
    if (error) throw error;
    const time = timePolicyFrom(data);
    await logPayrollAudit(admin, { company_id, event_type: 'payroll_policies_updated', event_data: { ...row, below_bcea: policyBelowBcea(time) }, created_by: user.id });
    return { ...time, allowNegativeLeave: data.allow_negative_leave, belowBcea: policyBelowBcea(time), updatedAt: data.updated_at };
  }

  if (method === 'GET_ATTENDANCE') {
    const from = String(body.from ?? '');
    const to = String(body.to ?? '');
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from || (utc(to) - utc(from)) / DAY > 62) {
      throw new Err({ stage: 'validation', code: 'ATTENDANCE_RANGE', message: 'Choose a date range of up to two months.', recovery: 'Pick the week or period to show.' });
    }
    const { data: all, error } = await admin.from('employees').select('*').eq('company_id', company_id).order('last_name');
    if (error) throw error;
    const shown = (all ?? []).filter((e) =>
      (body.includeSalaried === true || payBasisOf(e) !== 'salaried') && isEmployeeActiveInPeriod(e, from, to));
    const { data: rows, error: rowsError } = await admin.from('payroll_attendance').select('id, employee_id, work_date, hours, note, payroll_run_id')
      .eq('company_id', company_id).gte('work_date', from).lte('work_date', to);
    if (rowsError) throw rowsError;
    const holidays = [];
    for (let t = utc(from); t <= utc(to); t += DAY) if (isPublicHoliday(iso(t))) holidays.push(iso(t));
    return {
      from, to, publicHolidays: holidays,
      employees: shown.map((e) => ({
        id: e.id, name: name(e), employeeNumber: e.employee_number, payBasis: payBasisOf(e), payFrequency: e.salary_period ?? 'monthly',
        employmentType: e.employment_type, hoursPerDay: hoursPerDay(e), startDate: e.start_date, endDate: e.end_date,
      })),
      entries: (rows ?? []).filter((r) => shown.some((e) => e.id === r.employee_id)),
    };
  }

  if (method === 'SAVE_ATTENDANCE') {
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length || entries.length > 2000) {
      throw new Err({ stage: 'validation', code: 'ATTENDANCE_EMPTY', message: 'Nothing to save.', recovery: 'Enter hours for at least one day.' });
    }
    const ids = [...new Set(entries.map((e) => e.employeeId))];
    const { data: emps, error } = await admin.from('employees').select('id, first_name, last_name, start_date, end_date').eq('company_id', company_id).in('id', ids);
    if (error) throw error;
    let saved = 0;
    let cleared = 0;
    for (const entry of entries) {
      const e = (emps ?? []).find((x) => x.id === entry.employeeId);
      if (!e) throw new Err({ stage: 'validation', code: 'ATTENDANCE_EMPLOYEE', message: 'An employee was not found.', recovery: 'Refresh the page.' });
      const date = String(entry.date ?? '');
      if (!ISO_DATE.test(date)) throw new Err({ stage: 'validation', code: 'ATTENDANCE_DATE', message: 'A date is not valid.', recovery: 'Refresh the page.' });
      const hours = entry.hours === '' || entry.hours == null ? 0 : Number(entry.hours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        throw new Err({ stage: 'validation', code: 'ATTENDANCE_HOURS', message: `${name(e)}, ${date}: hours must be between 0 and 24.`, recovery: 'Correct the hours.' });
      }
      const { data: existing } = await admin.from('payroll_attendance').select('id, hours, payroll_run_id').eq('employee_id', e.id).eq('work_date', date).maybeSingle();
      if (existing?.payroll_run_id) {
        if (Number(existing.hours) === Math.round(hours * 100) / 100) continue;
        throw new Err({ stage: 'state_transition', code: 'ATTENDANCE_PAID', message: `${name(e)}, ${date} was paid by a finalised payroll run.`, recovery: 'Reverse or reopen that run to change it.', status: 409 });
      }
      if (hours === 0) {
        if (existing) {
          const { error: delError } = await admin.from('payroll_attendance').delete().eq('id', existing.id);
          if (delError) throw delError;
          cleared += 1;
        }
        continue;
      }
      if ((e.start_date && date < e.start_date) || (e.end_date && date > e.end_date)) {
        throw new Err({ stage: 'validation', code: 'ATTENDANCE_OUTSIDE_EMPLOYMENT', message: `${name(e)} was not employed on ${date}.`, recovery: 'Check the date or the employment dates.' });
      }
      const { error: upsertError } = await admin.from('payroll_attendance').upsert({
        company_id, employee_id: e.id, work_date: date, hours: Math.round(hours * 100) / 100,
        note: typeof entry.note === 'string' && entry.note.trim() ? entry.note.trim().slice(0, 200) : null, updated_by: user.id,
      }, { onConflict: 'employee_id,work_date' });
      if (upsertError) throw upsertError;
      saved += 1;
    }
    await logPayrollAudit(admin, { company_id, event_type: 'attendance_saved', event_data: { saved, cleared }, created_by: user.id });
    return { saved, cleared };
  }

  const run = await loadRun(admin, company_id, body.runId, Err);
  const employees = await runEmployees(admin, company_id, run);
  const policy = await loadPayrollPolicy(admin, company_id);

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
    const register = await unpaidAttendance(admin, company_id, employees.map((e) => e.id), run.pay_period_start, run.pay_period_end);
    const registerTotals = (e) => {
      const days = register.filter((r) => r.employee_id === e.id).map((r) => ({ date: r.work_date, hours: Number(r.hours) }));
      return days.length ? attendanceTotals(e, days, policy.time) : null;
    };
    const rows = employees
      .filter((e) => payBasisOf(e) !== 'salaried' || sheets.some((s) => s.employee_id === e.id) || register.some((r) => r.employee_id === e.id))
      .map((e) => {
        const sheet = sheets.find((s) => s.employee_id === e.id) ?? null;
        const pay = timePayLines(e, sheet, policy.time);
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
          attendance: registerTotals(e),
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
      attendanceWaiting: new Set(register.map((r) => r.employee_id)).size,
      policy: policy.time,
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

  if (method === 'IMPORT_ATTENDANCE') {
    requireDraft();
    const register = await unpaidAttendance(admin, company_id, employees.map((e) => e.id), run.pay_period_start, run.pay_period_end);
    let imported = 0;
    for (const e of employees) {
      const days = register.filter((r) => r.employee_id === e.id).map((r) => ({ date: r.work_date, hours: Number(r.hours) }));
      if (!days.length) continue;
      const totals = attendanceTotals(e, days, policy.time);
      const { data: existing } = await admin.from('payroll_timesheets').select('public_holiday_days_paid')
        .eq('payroll_run_id', run.id).eq('employee_id', e.id).maybeSingle();
      const { error } = await admin.from('payroll_timesheets').upsert({
        company_id, payroll_run_id: run.id, employee_id: e.id,
        ordinary_hours: totals.ordinary_hours, days_worked: totals.days_worked, overtime_hours: totals.overtime_hours,
        sunday_hours: totals.sunday_hours, public_holiday_hours: totals.public_holiday_hours,
        public_holiday_days_paid: existing?.public_holiday_days_paid ?? 0,
        source: 'attendance', work_fact_ids: [], updated_by: user.id,
      }, { onConflict: 'payroll_run_id,employee_id' });
      if (error) throw error;
      imported += 1;
    }
    if (imported) await addRunPreparer(admin, run.id, user.id);
    await logPayrollAudit(admin, { company_id, payroll_run_id: run.id, event_type: 'attendance_imported', event_data: { employees: imported }, created_by: user.id });
    return { imported };
  }

  if (method === 'COPY_PREVIOUS_TIMESHEET') {
    requireDraft();
    const { data: earlier, error } = await admin.from('payroll_runs').select('id, pay_period_start, pay_period_end, pay_frequency')
      .eq('company_id', company_id).lt('pay_period_start', run.pay_period_start).neq('id', run.id)
      .order('pay_period_start', { ascending: false }).limit(20);
    if (error) throw error;
    const frequency = run.pay_frequency ?? 'monthly';
    let source = null;
    let sourceRows = [];
    for (const r of (earlier ?? []).filter((x) => (x.pay_frequency ?? 'monthly') === frequency)) {
      const { data, error: sheetError } = await admin.from('payroll_timesheets').select('*').eq('payroll_run_id', r.id);
      if (sheetError) throw sheetError;
      if ((data ?? []).length) { source = r; sourceRows = data; break; }
    }
    if (!source) return { copied: 0, from: null };
    const current = await loadSheets();
    let copied = 0;
    for (const row of sourceRows) {
      if (!employees.some((e) => e.id === row.employee_id) || current.some((c) => c.employee_id === row.employee_id)) continue;
      const { error: insertError } = await admin.from('payroll_timesheets').insert({
        company_id, payroll_run_id: run.id, employee_id: row.employee_id,
        ordinary_hours: row.ordinary_hours, days_worked: row.days_worked, overtime_hours: row.overtime_hours,
        sunday_hours: row.sunday_hours, public_holiday_hours: row.public_holiday_hours, public_holiday_days_paid: 0,
        source: 'manual', work_fact_ids: [], updated_by: user.id,
      });
      if (insertError) throw insertError;
      copied += 1;
    }
    if (copied) await addRunPreparer(admin, run.id, user.id);
    await logPayrollAudit(admin, { company_id, payroll_run_id: run.id, event_type: 'timesheet_copied', event_data: { copied, from_run: source.id }, created_by: user.id });
    return { copied, from: { start: source.pay_period_start, end: source.pay_period_end } };
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
