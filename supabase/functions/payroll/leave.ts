// @ts-nocheck
/**
 * Leave management methods of the payroll function (Phase 3, BCEA sections 20–27):
 * leave types, the leave register (taken, opening balances, adjustments, forfeiture),
 * balances, leave paid out on termination, and the register entries a payroll run
 * creates or releases. Every write is made here with the service role.
 */
import {
  DEFAULT_LEAVE_TYPES,
  dailyRate,
  leaveBalance,
  leaveWorkingDays,
} from '../_shared/payrollRulesEngine/leave.ts'
import { leaveEmployee, loadLeaveRows as loadEntries, toLeaveEntry } from '../_shared/leaveRegister.ts'

import { isRunInEffect, isRunReversed } from '../_shared/payrollRunState.ts'
import { loadPayrollPolicy } from './time.ts'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const LEAVE_METHODS = new Set([
  'GET_LEAVE_TYPES',
  'SAVE_LEAVE_TYPE',
  'GET_LEAVE_OVERVIEW',
  'GET_EMPLOYEE_LEAVE',
  'RECORD_LEAVE',
  'CANCEL_LEAVE',
  'ADD_LEAVE_PAYOUT',
]);

/** The company's leave types; the BCEA types are created the first time leave is used. */
export async function ensureLeaveTypes(admin, companyId) {
  const { data, error } = await admin.from('company_leave_types').select('*').eq('company_id', companyId).order('created_at');
  if (error) throw error;
  const missing = DEFAULT_LEAVE_TYPES.filter((t) => !(data ?? []).some((row) => row.code === t.code));
  if (!missing.length) return data ?? [];
  const { error: insertError } = await admin.from('company_leave_types').upsert(
    missing.map((t) => ({ company_id: companyId, ...t, system: true })),
    { onConflict: 'company_id,code', ignoreDuplicates: true },
  );
  if (insertError) throw insertError;
  const { data: all, error: reloadError } = await admin.from('company_leave_types').select('*').eq('company_id', companyId).order('created_at');
  if (reloadError) throw reloadError;
  return all ?? [];
}

/** Balances of every type for one employee as at a date. */
export function employeeBalances(employee, types, rows, asAt) {
  const entries = rows.filter((r) => r.employee_id === employee.id).map(toLeaveEntry);
  return types.map((t) => ({
    leaveTypeId: t.id,
    code: t.code,
    name: t.name,
    paid: t.paid,
    accrual: t.accrual,
    ...leaveBalance(t.accrual, leaveEmployee(employee), entries.filter((e) => e.leaveTypeId === t.id), asAt),
  }));
}

async function finalisedRunsOverlapping(admin, companyId, payFrequency, from, to) {
  const { data, error } = await admin.from('payroll_runs')
    .select('id, status, pay_period_start, pay_period_end, pay_frequency, output_metadata')
    .eq('company_id', companyId)
    .lte('pay_period_start', to).gte('pay_period_end', from);
  if (error) throw error;
  return (data ?? []).filter((r) => (r.pay_frequency ?? 'monthly') === payFrequency && r.output_metadata?.cancelled !== true && !isRunReversed(r));
}

/**
 * Leave paid out on finalised payslips becomes a register entry (drawn from annual
 * leave), once per employee and run. Uses the days entered on the leave pay run input.
 */
export async function recordLeavePayouts(admin, companyId, run, userId) {
  const { data: inputs, error } = await admin.from('payroll_period_inputs')
    .select('employee_id, config').eq('company_id', companyId).eq('payroll_run_id', run.id).eq('component_code', 'leave_payout');
  if (error) throw error;
  const withDays = (inputs ?? []).filter((i) => Number(i.config?.days) > 0);
  if (!withDays.length) return 0;
  const types = await ensureLeaveTypes(admin, companyId);
  const annual = types.find((t) => t.accrual === 'bcea_annual');
  if (!annual) return 0;
  const { data: employees, error: empError } = await admin.from('employees').select('id, end_date')
    .eq('company_id', companyId).in('id', withDays.map((i) => i.employee_id));
  if (empError) throw empError;
  const { data: existing, error: existingError } = await admin.from('employee_leave_entries').select('employee_id')
    .eq('payroll_run_id', run.id).eq('entry_type', 'payout').eq('status', 'approved');
  if (existingError) throw existingError;
  const done = new Set((existing ?? []).map((e) => e.employee_id));
  let recorded = 0;
  for (const input of withDays) {
    if (done.has(input.employee_id)) continue;
    const end = employees?.find((e) => e.id === input.employee_id)?.end_date;
    const effective = end && end >= run.pay_period_start && end <= run.pay_period_end ? end : run.pay_period_end;
    const { error: insertError } = await admin.from('employee_leave_entries').insert({
      company_id: companyId, employee_id: input.employee_id, leave_type_id: annual.id, entry_type: 'payout',
      effective_date: effective, days: round2(Number(input.config.days)), status: 'approved',
      reason: `Paid out in the payroll run for ${run.pay_period_start} to ${run.pay_period_end}`,
      payroll_run_id: run.id, created_by: userId,
    });
    if (insertError && insertError.code !== '23505') throw insertError;
    if (!insertError) recorded += 1;
  }
  return recorded;
}

/** A reversed run gives back the leave it paid out. */
export async function releaseLeavePayouts(admin, companyId, runId, userId, reason) {
  const { error } = await admin.from('employee_leave_entries')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: userId, cancel_reason: `Payroll run reversed: ${reason}`.slice(0, 500) })
    .eq('company_id', companyId).eq('payroll_run_id', runId).eq('entry_type', 'payout').eq('status', 'approved');
  if (error) throw error;
}

export async function handleLeaveMethod(method, ctx) {
  const { supabaseAdmin: admin, company_id, user, body, PayrollDomainError: Err, logPayrollAudit, addRunPreparer } = ctx;
  const fail = (code, message, recovery, status = 400, details = undefined) => { throw new Err({ stage: 'validation', code, message, recovery, status, details }); };

  const loadEmployee = async (employeeId) => {
    const { data, error } = await admin.from('employees').select('*').eq('id', employeeId).eq('company_id', company_id).maybeSingle();
    if (error) throw error;
    if (!data) fail('EMPLOYEE_NOT_FOUND', 'That employee was not found.', 'Refresh the page.', 404);
    return data;
  };

  switch (method) {
    case 'GET_LEAVE_TYPES':
      return await ensureLeaveTypes(admin, company_id);

    case 'SAVE_LEAVE_TYPE': {
      const types = await ensureLeaveTypes(admin, company_id);
      const name = String(body.name ?? '').trim();
      if (name.length < 2 || name.length > 80) fail('LEAVE_TYPE_NAME', 'Give the leave type a name (2–80 characters).', 'Enter a name.');
      if (body.id) {
        const existing = types.find((t) => t.id === body.id);
        if (!existing) fail('LEAVE_TYPE_NOT_FOUND', 'That leave type was not found.', 'Refresh the page.', 404);
        // The BCEA types keep their rules; only the name and whether they are offered change.
        const patch = existing.system
          ? { name, active: body.active !== false, updated_at: new Date().toISOString() }
          : { name, paid: body.paid === true, active: body.active !== false, updated_at: new Date().toISOString() };
        if (existing.system && existing.accrual !== 'none' && body.active === false) {
          fail('LEAVE_TYPE_REQUIRED', `${existing.name} is a BCEA entitlement and cannot be switched off.`, 'Rename it if needed.');
        }
        const { data, error } = await admin.from('company_leave_types').update(patch).eq('id', existing.id).select().single();
        if (error) throw error;
        return data;
      }
      const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'leave';
      if (types.some((t) => t.code === code)) fail('LEAVE_TYPE_EXISTS', `A leave type called "${name}" already exists.`, 'Use a different name.', 409);
      const { data, error } = await admin.from('company_leave_types').insert({
        company_id, code: /^[a-z]/.test(code) ? code : `l_${code}`, name, category: 'other', paid: body.paid === true, accrual: 'none', system: false, active: true,
      }).select().single();
      if (error) throw error;
      await logPayrollAudit(admin, { company_id, event_type: 'leave_type_created', event_data: { leave_type_id: data.id, name, paid: data.paid }, created_by: user.id });
      return data;
    }

    case 'GET_LEAVE_OVERVIEW': {
      const asAt = ISO_DATE.test(String(body.asAt ?? '')) ? body.asAt : new Date().toISOString().slice(0, 10);
      const types = (await ensureLeaveTypes(admin, company_id)).filter((t) => t.active);
      const { data: employees, error } = await admin.from('employees')
        .select('id, employee_number, first_name, last_name, department, start_date, end_date, salary_amount, salary_period, work_days_per_week, annual_leave_days_per_cycle')
        .eq('company_id', company_id).order('last_name');
      if (error) throw error;
      const current = (employees ?? []).filter((e) => (!e.start_date || e.start_date <= asAt) && (!e.end_date || e.end_date >= asAt));
      const rows = await loadEntries(admin, company_id, current.map((e) => e.id));
      return {
        asAt,
        types,
        employees: current.map((e) => ({
          id: e.id,
          employeeNumber: e.employee_number,
          name: [e.first_name, e.last_name].filter(Boolean).join(' '),
          department: e.department,
          startDate: e.start_date,
          balances: employeeBalances(e, types, rows, asAt),
        })),
      };
    }

    case 'GET_EMPLOYEE_LEAVE': {
      const employee = await loadEmployee(body.employeeId);
      const asAt = ISO_DATE.test(String(body.asAt ?? '')) ? body.asAt : new Date().toISOString().slice(0, 10);
      const types = await ensureLeaveTypes(admin, company_id);
      const rows = await loadEntries(admin, company_id, [employee.id]);
      return {
        asAt,
        employee: {
          id: employee.id, name: [employee.first_name, employee.last_name].filter(Boolean).join(' '),
          startDate: employee.start_date, endDate: employee.end_date,
          workDaysPerWeek: employee.work_days_per_week, annualLeaveDaysPerCycle: employee.annual_leave_days_per_cycle,
          dailyRate: dailyRate(employee.salary_amount, employee.salary_period, employee.work_days_per_week),
        },
        balances: employeeBalances(employee, types.filter((t) => t.active), rows, asAt),
        entries: rows.sort((a, b) => (b.effective_date ?? '').localeCompare(a.effective_date ?? '') || b.created_at.localeCompare(a.created_at)),
        types,
      };
    }

    case 'RECORD_LEAVE': {
      const employee = await loadEmployee(body.employeeId);
      const types = await ensureLeaveTypes(admin, company_id);
      const type = types.find((t) => t.id === body.leaveTypeId);
      if (!type || !type.active) fail('LEAVE_TYPE_INVALID', 'Choose a leave type.', 'Pick one of the company\'s leave types.');
      const entryType = String(body.entryType ?? 'taken');
      if (!['taken', 'opening_balance', 'adjustment', 'forfeit'].includes(entryType)) {
        fail('LEAVE_ENTRY_TYPE', 'Leave paid out is recorded by the payroll run that pays it.', 'Add leave pay to the termination run instead.');
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      let row;
      const regenerate = [];

      if (entryType === 'taken') {
        const start = String(body.startDate ?? '');
        const end = String(body.endDate ?? '');
        if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) fail('LEAVE_DATES', 'Enter the first and last day of leave.', 'The last day cannot be before the first.');
        if ((employee.start_date && start < employee.start_date) || (employee.end_date && end > employee.end_date)) {
          fail('LEAVE_OUTSIDE_EMPLOYMENT', 'The leave falls outside the employee\'s employment dates.', 'Check the dates and the employee\'s start and end dates.');
        }
        const workingDays = leaveWorkingDays(start, end, employee.work_days_per_week);
        if (workingDays <= 0) fail('LEAVE_NO_WORKING_DAYS', 'These dates contain no working days (weekends and public holidays are not leave days).', 'Choose working days.');
        const days = body.days == null || body.days === '' ? workingDays : round2(Number(body.days));
        if (!(days > 0) || days > workingDays || Math.round(days * 2) !== days * 2) {
          fail('LEAVE_DAYS', `Leave days must be between 0.5 and ${workingDays} (the working days in these dates), in half days.`, 'Correct the number of days.');
        }
        const { data: overlap, error: overlapError } = await admin.from('employee_leave_entries').select('id, start_date, end_date')
          .eq('company_id', company_id).eq('employee_id', employee.id).eq('entry_type', 'taken').eq('status', 'approved')
          .lte('start_date', end).gte('end_date', start).limit(1);
        if (overlapError) throw overlapError;
        if (overlap?.length) fail('LEAVE_OVERLAP', `Leave is already recorded from ${overlap[0].start_date} to ${overlap[0].end_date}.`, 'Cancel that entry first, or choose other dates.', 409);

        const runs = await finalisedRunsOverlapping(admin, company_id, employee.salary_period ?? 'monthly', start, end);
        if (!type.paid && runs.some(isRunInEffect)) {
          fail('PAYROLL_PERIOD_CLOSED', 'Unpaid leave in a finalised pay period cannot be recorded: the employee was already paid for it.', 'Reverse or reopen the run first, or record it in the next period as an adjustment of pay.', 409);
        }
        if (!type.paid) regenerate.push(...runs.filter((r) => r.status === 'draft').map((r) => r.id));

        if (type.accrual !== 'none') {
          const rows = await loadEntries(admin, company_id, [employee.id]);
          const position = leaveBalance(type.accrual, leaveEmployee(employee), rows.filter((r) => r.leave_type_id === type.id).map(toLeaveEntry), end);
          // A company may allow leave beyond the balance (e.g. granted in advance).
          const { allowNegativeLeave } = await loadPayrollPolicy(admin, company_id);
          if (position.available - days < -0.001 && !allowNegativeLeave) {
            fail('LEAVE_BALANCE_EXCEEDED',
              `${type.name}: ${days} day${days === 1 ? '' : 's'} requested, ${Math.max(0, position.available)} available by ${end}.`,
              'Record the extra days as unpaid leave, or record an adjustment with the reason (e.g. leave granted in advance).', 409,
              { available: position.available, requested: days });
          }
        }
        row = { entry_type: 'taken', start_date: start, end_date: end, effective_date: start, days };
      } else {
        const effective = String(body.effectiveDate ?? '');
        if (!ISO_DATE.test(effective)) fail('LEAVE_DATE', 'Enter the date the entry applies from.', 'Choose a date.');
        if (type.accrual === 'none') fail('LEAVE_NO_BALANCE', `${type.name} has no balance to set or adjust.`, 'Only annual, sick and family responsibility leave have balances.');
        const days = round2(Number(body.days));
        if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 366) fail('LEAVE_DAYS', 'Enter the number of days.', 'Use a number of days other than zero.');
        if (entryType !== 'adjustment' && days < 0) fail('LEAVE_DAYS', 'Enter a positive number of days.', 'Use an adjustment to reduce a balance.');
        if (entryType !== 'opening_balance' && reason.length < 5) fail('REASON_REQUIRED', 'Give a reason for the adjustment.', 'Say why the balance changes.');
        row = { entry_type: entryType, start_date: null, end_date: null, effective_date: effective, days };
      }

      const { data, error } = await admin.from('employee_leave_entries').insert({
        company_id, employee_id: employee.id, leave_type_id: type.id, status: 'approved', reason: reason || null, created_by: user.id, ...row,
      }).select().single();
      if (error) throw error;
      await logPayrollAudit(admin, {
        company_id, event_type: 'leave_recorded',
        event_data: { entry_id: data.id, employee_id: employee.id, leave_type: type.code, entry_type: row.entry_type, days: row.days, start: row.start_date, end: row.end_date },
        created_by: user.id,
      });
      return { entry: data, regenerateRuns: regenerate };
    }

    case 'CANCEL_LEAVE': {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 5) fail('REASON_REQUIRED', 'Give a reason for cancelling the leave.', 'Say why it is cancelled.');
      const { data: entry, error } = await admin.from('employee_leave_entries').select('*').eq('id', body.entryId).eq('company_id', company_id).maybeSingle();
      if (error) throw error;
      if (!entry) fail('LEAVE_NOT_FOUND', 'That leave entry was not found.', 'Refresh the page.', 404);
      if (entry.status === 'cancelled') fail('LEAVE_ALREADY_CANCELLED', 'This entry is already cancelled.', 'Refresh the page.', 409);
      if (entry.entry_type === 'payout') fail('LEAVE_PAYOUT_LOCKED', 'Leave paid out belongs to its payroll run.', 'Reverse the payroll run to give the leave back.', 409);
      const regenerate = [];
      if (entry.entry_type === 'taken') {
        const { data: type } = await admin.from('company_leave_types').select('paid').eq('id', entry.leave_type_id).single();
        const employee = await loadEmployee(entry.employee_id);
        const runs = await finalisedRunsOverlapping(admin, company_id, employee.salary_period ?? 'monthly', entry.start_date, entry.end_date);
        if (type && !type.paid && runs.some(isRunInEffect)) {
          fail('PAYROLL_PERIOD_CLOSED', 'This unpaid leave reduced pay in a finalised run, so it cannot be cancelled.', 'Reverse or reopen that run first.', 409);
        }
        if (type && !type.paid) regenerate.push(...runs.filter((r) => r.status === 'draft').map((r) => r.id));
      }
      const { data, error: cancelError } = await admin.from('employee_leave_entries')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id, cancel_reason: reason })
        .eq('id', entry.id).select().single();
      if (cancelError) throw cancelError;
      await logPayrollAudit(admin, { company_id, event_type: 'leave_cancelled', event_data: { entry_id: entry.id, employee_id: entry.employee_id, reason }, created_by: user.id });
      return { entry: data, regenerateRuns: regenerate };
    }

    case 'ADD_LEAVE_PAYOUT': {
      const { data: run, error } = await admin.from('payroll_runs').select('*').eq('id', body.runId).eq('company_id', company_id).single();
      if (error) throw error;
      if (run.status !== 'draft') fail('RUN_NOT_DRAFT', 'Leave pay can only be added to a draft run.', 'Reopen the run first.', 409);
      const employee = await loadEmployee(body.employeeId);
      if (!employee.end_date || employee.end_date < run.pay_period_start || employee.end_date > run.pay_period_end) {
        fail('NOT_LEAVING', 'Leave is paid out when employment ends: the employee\'s end date is not in this pay period.', 'Set the end date on the employee first.');
      }
      const types = await ensureLeaveTypes(admin, company_id);
      const annual = types.find((t) => t.accrual === 'bcea_annual');
      const rows = await loadEntries(admin, company_id, [employee.id]);
      const position = leaveBalance('bcea_annual', leaveEmployee(employee), rows.filter((r) => r.leave_type_id === annual.id).map(toLeaveEntry), employee.end_date);
      const days = round2(position.balance);
      if (days <= 0) fail('NO_LEAVE_DUE', 'There is no annual leave balance to pay out.', 'Nothing to add.');
      const rate = dailyRate(employee.salary_amount, employee.salary_period, employee.work_days_per_week);
      if (rate <= 0) fail('NO_DAILY_RATE', 'The employee has no salary to work out a daily rate from.', 'Capture the salary first.');
      const { data, error: upsertError } = await admin.from('payroll_period_inputs').upsert({
        company_id, payroll_run_id: run.id, employee_id: employee.id, component_code: 'leave_payout',
        config: { days, dailyRate: rate, source: 'leave_balance', asAt: employee.end_date },
      }, { onConflict: 'payroll_run_id,employee_id,component_code' }).select().single();
      if (upsertError) throw upsertError;
      await addRunPreparer(admin, run.id, user.id);
      await logPayrollAudit(admin, {
        company_id, payroll_run_id: run.id, event_type: 'leave_payout_added',
        event_data: { employee_id: employee.id, days, daily_rate: rate, amount: round2(days * rate) },
        created_by: user.id,
      });
      return { input: data, days, dailyRate: rate, amount: round2(days * rate) };
    }
  }
  return undefined;
}
