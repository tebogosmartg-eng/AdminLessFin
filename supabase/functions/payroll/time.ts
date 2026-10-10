// @ts-nocheck
/**
 * Time and attendance for a payroll run: days worked (daily-paid) or hours worked
 * (hourly-paid), and pay = days or hours × the employee's rate. Nothing else is added or
 * multiplied (ADR-0007, amended). The run's timesheet is typed in, filled from the
 * attendance register, copied from the previous period, or imported from the approved hours
 * in Work Management. Every write is made here with the service role.
 */
import {
  attendanceTotals,
  hoursPerDay,
  payBasisOf,
  quantityWorked,
  timePay,
  timesheetIssues,
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
/** Most days or hours one employee can have on one run. */
const MAX_DAYS = 31;
const MAX_HOURS = 744;

/** The company's payroll rules (leave beyond the balance). */
export async function loadPayrollPolicy(admin, companyId) {
  const { data, error } = await admin.from('company_payroll_policies').select('*').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return { row: data, allowNegativeLeave: data?.allow_negative_leave === true };
}

async function unpaidAttendance(admin, companyId, employeeIds: string[], from: string, to: string) {
  if (!employeeIds.length) return [];
  const { data, error } = await admin.from('payroll_attendance').select('employee_id, work_date, hours, days')
    .eq('company_id', companyId).is('payroll_run_id', null).gte('work_date', from).lte('work_date', to).in('employee_id', employeeIds);
  if (error) throw error;
  return data ?? [];
}

const isPublicHoliday = (day: string) => saPublicHolidays(Number(day.slice(0, 4))).has(day);

async function loadRun(admin, companyId, runId, Err) {
  const { data, error } = await admin.from('payroll_runs').select('*').eq('id', runId).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Err({ stage: 'validation', code: 'RUN_NOT_FOUND', message: 'That payroll run was not found.', recovery: 'Refresh the page.', status: 404 });
  return data;
}

/** Daily and hourly-paid employees on the run (its pay frequency, employed in the period). */
async function runTimeEmployees(admin, companyId, run) {
  const { data, error } = await admin.from('employees').select('*').eq('company_id', companyId);
  if (error) throw error;
  const frequency = run.pay_frequency ?? 'monthly';
  return (data ?? []).filter((e) => payBasisOf(e) !== 'salaried'
    && (e.salary_period ?? 'monthly') === frequency && isEmployeeActiveInPeriod(e, run.pay_period_start, run.pay_period_end));
}

/** Approved Work Management hours in the period not yet paid by a run: hours, and the days they fall on. */
async function readyWorkHours(admin, companyId, run, employeeIds: string[]) {
  if (!employeeIds.length) return new Map();
  const { data, error } = await admin.from('ewm_payroll_input_facts')
    .select('id, employee_id, entry_date, hours')
    .eq('company_id', companyId).eq('status', 'ready').is('payroll_run_id', null)
    .gte('entry_date', run.pay_period_start).lte('entry_date', run.pay_period_end)
    .in('employee_id', employeeIds);
  if (error) throw error;
  const byEmployee = new Map();
  for (const f of data ?? []) {
    const sums = byEmployee.get(f.employee_id) ?? { hours: 0, days: new Set(), factIds: [] };
    sums.hours += Number(f.hours) || 0;
    if ((Number(f.hours) || 0) > 0) sums.days.add(f.entry_date);
    sums.factIds.push(f.id);
    byEmployee.set(f.employee_id, sums);
  }
  return new Map([...byEmployee].map(([id, s]) => [id, { hours: round2(s.hours), days: s.days.size, factIds: s.factIds }]));
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

/** The timesheet columns for a quantity: days for daily-paid, hours for hourly-paid; nothing else. */
function sheetValues(employee, quantity: number) {
  const daily = payBasisOf(employee) === 'daily';
  return {
    days_worked: daily ? round2(quantity) : 0,
    ordinary_hours: daily ? 0 : round2(quantity),
    overtime_hours: 0, sunday_hours: 0, public_holiday_hours: 0, public_holiday_days_paid: 0,
  };
}

export async function handleTimeMethod(method, ctx) {
  const { supabaseAdmin: admin, company_id, user, body, PayrollDomainError: Err, logPayrollAudit, addRunPreparer } = ctx;
  const name = (e) => [e.first_name, e.last_name].filter(Boolean).join(' ') || e.id;

  if (method === 'GET_PAYROLL_POLICIES') {
    const policy = await loadPayrollPolicy(admin, company_id);
    return { allowNegativeLeave: policy.allowNegativeLeave, updatedAt: policy.row?.updated_at ?? null };
  }

  if (method === 'UPDATE_PAYROLL_POLICIES') {
    const row = { company_id, allow_negative_leave: body.allowNegativeLeave === true, updated_by: user.id, updated_at: new Date().toISOString() };
    const { data, error } = await admin.from('company_payroll_policies').upsert(row, { onConflict: 'company_id' }).select().single();
    if (error) throw error;
    await logPayrollAudit(admin, { company_id, event_type: 'payroll_policies_updated', event_data: row, created_by: user.id });
    return { allowNegativeLeave: data.allow_negative_leave, updatedAt: data.updated_at };
  }

  if (method === 'GET_ATTENDANCE') {
    const from = String(body.from ?? '');
    const to = String(body.to ?? '');
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from || (utc(to) - utc(from)) / DAY > 62) {
      throw new Err({ stage: 'validation', code: 'ATTENDANCE_RANGE', message: 'Choose a date range of up to two months.', recovery: 'Pick the week or period to show.' });
    }
    const { data: all, error } = await admin.from('employees').select('*').eq('company_id', company_id).order('last_name');
    if (error) throw error;
    const shown = (all ?? []).filter((e) => payBasisOf(e) !== 'salaried' && isEmployeeActiveInPeriod(e, from, to));
    const { data: rows, error: rowsError } = await admin.from('payroll_attendance').select('id, employee_id, work_date, hours, days, note, payroll_run_id')
      .eq('company_id', company_id).gte('work_date', from).lte('work_date', to);
    if (rowsError) throw rowsError;
    const holidays = [];
    for (let t = utc(from); t <= utc(to); t += DAY) if (isPublicHoliday(iso(t))) holidays.push(iso(t));
    return {
      from, to, publicHolidays: holidays,
      employees: shown.map((e) => ({
        id: e.id, name: name(e), employeeNumber: e.employee_number, payBasis: payBasisOf(e), payFrequency: e.salary_period ?? 'monthly',
        employmentType: e.employment_type, rate: e.pay_rate == null ? null : Number(e.pay_rate), hoursPerDay: hoursPerDay(e),
        startDate: e.start_date, endDate: e.end_date,
      })),
      entries: (rows ?? []).filter((r) => shown.some((e) => e.id === r.employee_id)),
    };
  }

  if (method === 'SAVE_ATTENDANCE') {
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length || entries.length > 2000) {
      throw new Err({ stage: 'validation', code: 'ATTENDANCE_EMPTY', message: 'Nothing to save.', recovery: 'Tick the days or enter the hours worked.' });
    }
    const ids = [...new Set(entries.map((e) => e.employeeId))];
    const { data: emps, error } = await admin.from('employees').select('id, first_name, last_name, start_date, end_date, pay_basis').eq('company_id', company_id).in('id', ids);
    if (error) throw error;
    let saved = 0;
    let cleared = 0;
    for (const entry of entries) {
      const e = (emps ?? []).find((x) => x.id === entry.employeeId);
      if (!e) throw new Err({ stage: 'validation', code: 'ATTENDANCE_EMPLOYEE', message: 'An employee was not found.', recovery: 'Refresh the page.' });
      const date = String(entry.date ?? '');
      if (!ISO_DATE.test(date)) throw new Err({ stage: 'validation', code: 'ATTENDANCE_DATE', message: 'A date is not valid.', recovery: 'Refresh the page.' });
      const daily = payBasisOf(e) === 'daily';
      const raw = daily ? entry.days : entry.hours;
      const value = raw === '' || raw == null ? 0 : round2(Number(raw));
      if (daily ? ![0, 0.5, 1].includes(value) : (!Number.isFinite(value) || value < 0 || value > 24)) {
        throw new Err({
          stage: 'validation', code: daily ? 'ATTENDANCE_DAYS' : 'ATTENDANCE_HOURS',
          message: daily ? `${name(e)}, ${date}: a day is worked in full (1), half (0.5) or not at all.` : `${name(e)}, ${date}: hours must be between 0 and 24.`,
          recovery: 'Correct the entry.',
        });
      }
      const next = daily ? { days: value, hours: null } : { hours: value, days: null };
      const { data: existing } = await admin.from('payroll_attendance').select('id, hours, days, payroll_run_id').eq('employee_id', e.id).eq('work_date', date).maybeSingle();
      if (existing?.payroll_run_id) {
        const same = daily ? Number(existing.days ?? (Number(existing.hours) > 0 ? 1 : 0)) === value : Number(existing.hours ?? 0) === value;
        if (same) continue;
        throw new Err({ stage: 'state_transition', code: 'ATTENDANCE_PAID', message: `${name(e)}, ${date} was paid by a finalised payroll run.`, recovery: 'Reverse or reopen that run to change it.', status: 409 });
      }
      if (value === 0) {
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
        company_id, employee_id: e.id, work_date: date, ...next,
        note: typeof entry.note === 'string' && entry.note.trim() ? entry.note.trim().slice(0, 200) : null, updated_by: user.id,
      }, { onConflict: 'employee_id,work_date' });
      if (upsertError) throw upsertError;
      saved += 1;
    }
    await logPayrollAudit(admin, { company_id, event_type: 'attendance_saved', event_data: { saved, cleared }, created_by: user.id });
    return { saved, cleared };
  }

  const run = await loadRun(admin, company_id, body.runId, Err);
  const employees = await runTimeEmployees(admin, company_id, run);

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
  const writeSheet = async (employee, quantity: number, source: string, workFactIds: string[] = []) => {
    if (quantity <= 0) {
      const { error } = await admin.from('payroll_timesheets').delete().eq('payroll_run_id', run.id).eq('employee_id', employee.id);
      if (error) throw error;
      return;
    }
    const { error } = await admin.from('payroll_timesheets').upsert({
      company_id, payroll_run_id: run.id, employee_id: employee.id, ...sheetValues(employee, quantity),
      source, work_fact_ids: workFactIds, updated_by: user.id,
    }, { onConflict: 'payroll_run_id,employee_id' });
    if (error) throw error;
  };

  if (method === 'GET_TIMESHEET') {
    const sheets = await loadSheets();
    const work = await readyWorkHours(admin, company_id, run, employees.map((e) => e.id));
    const register = await unpaidAttendance(admin, company_id, employees.map((e) => e.id), run.pay_period_start, run.pay_period_end);
    const rows = employees.map((e) => {
      const sheet = sheets.find((s) => s.employee_id === e.id) ?? null;
      const daily = payBasisOf(e) === 'daily';
      const days = register.filter((r) => r.employee_id === e.id).map((r) => ({ date: r.work_date, hours: r.hours, days: r.days }));
      const tracked = days.length ? attendanceTotals(e, days) : null;
      const w = work.get(e.id);
      return {
        employeeId: e.id,
        name: name(e),
        employeeNumber: e.employee_number,
        employmentType: e.employment_type,
        payBasis: payBasisOf(e),
        rate: e.pay_rate == null ? null : Number(e.pay_rate),
        taxMethod: e.tax_method ?? 'tables',
        quantity: sheet ? quantityWorked(e, sheet) : null,
        source: sheet?.source ?? null,
        attendance: tracked ? { quantity: daily ? tracked.days_worked : tracked.ordinary_hours, daysRecorded: tracked.daysRecorded } : null,
        workHours: w ? { quantity: daily ? w.days : w.hours, entries: w.factIds.length } : null,
        amount: timePay(e, sheet),
        issues: timesheetIssues(e, run.pay_period_end),
      };
    });
    return {
      run: { id: run.id, status: run.status, payPeriodStart: run.pay_period_start, payPeriodEnd: run.pay_period_end, payFrequency: run.pay_frequency ?? 'monthly' },
      rows,
      total: round2(rows.reduce((s, r) => s + r.amount, 0)),
      workHoursWaiting: [...work.values()].reduce((s, w) => s + w.factIds.length, 0),
      attendanceWaiting: new Set(register.map((r) => r.employee_id)).size,
    };
  }

  if (method === 'SAVE_TIMESHEET') {
    requireDraft();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new Err({ stage: 'validation', code: 'TIMESHEET_EMPTY', message: 'Nothing to save.', recovery: 'Enter the days or hours worked.' });
    const sheets = await loadSheets();
    let saved = 0;
    for (const row of rows) {
      const employee = employees.find((e) => e.id === row.employeeId);
      if (!employee) {
        throw new Err({ stage: 'validation', code: 'TIMESHEET_EMPLOYEE', message: 'An employee on the timesheet is not on this run (pay frequency or employment dates).', recovery: 'Refresh the timesheet.' });
      }
      const daily = payBasisOf(employee) === 'daily';
      const max = daily ? MAX_DAYS : MAX_HOURS;
      const quantity = row.quantity === '' || row.quantity == null ? 0 : Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > max) {
        throw new Err({ stage: 'validation', code: 'TIMESHEET_VALUE', message: `${name(employee)}: ${daily ? 'days' : 'hours'} must be between 0 and ${max}.`, recovery: 'Correct the value.' });
      }
      const current = sheets.find((s) => s.employee_id === employee.id);
      if (current && quantityWorked(employee, current) === round2(quantity)) continue;
      // A changed figure is the user's own: it no longer pays the imported Work Management hours.
      await writeSheet(employee, quantity, 'manual');
      saved += 1;
    }
    if (saved) await addRunPreparer(admin, run.id, user.id);
    await logPayrollAudit(admin, { company_id, payroll_run_id: run.id, event_type: 'timesheet_saved', event_data: { employees: saved }, created_by: user.id });
    return { saved };
  }

  if (method === 'IMPORT_ATTENDANCE') {
    requireDraft();
    const register = await unpaidAttendance(admin, company_id, employees.map((e) => e.id), run.pay_period_start, run.pay_period_end);
    let imported = 0;
    for (const e of employees) {
      const days = register.filter((r) => r.employee_id === e.id).map((r) => ({ date: r.work_date, hours: r.hours, days: r.days }));
      if (!days.length) continue;
      const totals = attendanceTotals(e, days);
      await writeSheet(e, payBasisOf(e) === 'daily' ? totals.days_worked : totals.ordinary_hours, 'attendance');
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
      .order('pay_period_start', { ascending: false }).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    const frequency = run.pay_frequency ?? 'monthly';
    let source = null;
    let sourceRows = [];
    // The latest run for the latest earlier period (a reversed and redone period has several runs)
    // whose timesheets cover someone on this run.
    for (const r of (earlier ?? []).filter((x) => (x.pay_frequency ?? 'monthly') === frequency)) {
      const { data, error: sheetError } = await admin.from('payroll_timesheets').select('*').eq('payroll_run_id', r.id);
      if (sheetError) throw sheetError;
      const rows = (data ?? []).filter((row) => employees.some((e) => e.id === row.employee_id));
      if (rows.length) { source = r; sourceRows = rows; break; }
    }
    if (!source) return { copied: 0, from: null };
    const current = await loadSheets();
    let copied = 0;
    for (const row of sourceRows) {
      const employee = employees.find((e) => e.id === row.employee_id);
      if (!employee || current.some((c) => c.employee_id === row.employee_id)) continue;
      const quantity = quantityWorked(employee, row);
      if (quantity <= 0) continue;
      await writeSheet(employee, quantity, 'manual');
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
      await writeSheet(employee, payBasisOf(employee) === 'daily' ? w.days : w.hours, 'work_module', w.factIds);
      imported += 1;
    }
    if (imported) await addRunPreparer(admin, run.id, user.id);
    await logPayrollAudit(admin, { company_id, payroll_run_id: run.id, event_type: 'work_hours_imported', event_data: { employees: imported }, created_by: user.id });
    return { imported };
  }
  return undefined;
}
