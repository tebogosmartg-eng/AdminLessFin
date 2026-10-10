/**
 * Pay for time worked, kept deliberately simple:
 *
 * - daily-paid:  pay = days worked × daily rate
 * - hourly-paid: pay = hours worked × hourly rate
 *
 * Nothing is added, split or multiplied on its own: no automatic overtime, Sunday or public
 * holiday premiums, no minimum-shift top-ups. Anything extra is a once-off earning on the
 * payslip. The national minimum wage is shown as advice, never enforced.
 *
 * Statutory deductions still follow the law: no UIF for anyone working under 24 hours in the
 * month (UI Act s3 / UIC Act s4). A day counts as the employee's ordinary hours a day when
 * they are captured, otherwise 8 hours.
 *
 * There is no daily pay frequency: SARS publishes no daily tax tables, so daily-paid and
 * casual workers are paid on weekly, fortnightly or monthly runs with their days captured.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

import { nationalMinimumWageHourly } from '../sars/eti';

export type PayBasis = 'salaried' | 'hourly' | 'daily';

export type TimeEmployee = {
  pay_basis?: string | null;
  /** Rate per hour (hourly) or per day (daily). */
  pay_rate?: number | null;
  ordinary_hours_per_week?: number | null;
  work_days_per_week?: number | null;
};

export type Timesheet = {
  ordinary_hours?: number | null;
  days_worked?: number | null;
};

export const UIF_MINIMUM_HOURS_PER_MONTH = 24;
/** Hours in a day when the employee's ordinary hours are not captured. */
export const DEFAULT_HOURS_PER_DAY = 8;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function payBasisOf(employee: Pick<TimeEmployee, 'pay_basis'>): PayBasis {
  return employee.pay_basis === 'hourly' || employee.pay_basis === 'daily' ? employee.pay_basis : 'salaried';
}

export function workDays(employee: TimeEmployee): number {
  const d = num(employee.work_days_per_week);
  return d > 0 && d <= 7 ? d : 5;
}

/** The employee's ordinary hours a day (weekly hours ÷ working days), or 8 when not captured. */
export function hoursPerDay(employee: TimeEmployee): number {
  const weekly = num(employee.ordinary_hours_per_week);
  return weekly > 0 ? round2(weekly / workDays(employee)) : DEFAULT_HOURS_PER_DAY;
}

/** Days (daily-paid) or hours (hourly-paid) on a timesheet. */
export function quantityWorked(employee: TimeEmployee, ts: Timesheet | null | undefined): number {
  if (!ts) return 0;
  const basis = payBasisOf(employee);
  if (basis === 'daily') return round2(num(ts.days_worked));
  if (basis === 'hourly') return round2(num(ts.ordinary_hours));
  return 0;
}

/** Pay for a timesheet: days × daily rate, or hours × hourly rate. */
export function timePay(employee: TimeEmployee, ts: Timesheet | null | undefined): number {
  return round2(quantityWorked(employee, ts) * num(employee.pay_rate));
}

/** The payslip line for the pay, e.g. "Days worked (2 × R250.00)". */
export function timePayDescription(employee: TimeEmployee, ts: Timesheet | null | undefined): string {
  const qty = quantityWorked(employee, ts);
  const rate = `R${num(employee.pay_rate).toFixed(2)}`;
  return payBasisOf(employee) === 'daily'
    ? `Days worked (${qty} × ${rate})`
    : `Hours worked (${qty} × ${rate})`;
}

/** Hours worked on a timesheet (days count at the employee's hours a day): ETI and the UIF 24-hour test. */
export function hoursWorked(employee: TimeEmployee, ts: Timesheet | null | undefined): number {
  if (!ts) return 0;
  const basis = payBasisOf(employee);
  if (basis === 'daily') return round2(num(ts.days_worked) * hoursPerDay(employee));
  if (basis === 'hourly') return round2(num(ts.ordinary_hours));
  return 0;
}

export type TimeIssue = { code: 'NO_RATE' | 'BELOW_MINIMUM_WAGE'; message: string };

/** Advice on a time-paid employee: a missing rate, or a rate below the national minimum wage. */
export function timesheetIssues(employee: TimeEmployee, periodEnd: string): TimeIssue[] {
  const issues: TimeIssue[] = [];
  const basis = payBasisOf(employee);
  if (basis === 'salaried') return issues;
  const rate = num(employee.pay_rate);
  if (rate <= 0) {
    issues.push({ code: 'NO_RATE', message: `no ${basis === 'hourly' ? 'hourly' : 'daily'} rate is set on the employee` });
    return issues;
  }
  const minimum = nationalMinimumWageHourly(periodEnd.slice(0, 7));
  if (!minimum) return issues;
  if (basis === 'hourly' && rate + 0.0001 < minimum) {
    issues.push({ code: 'BELOW_MINIMUM_WAGE', message: `R${rate.toFixed(2)} an hour is below the national minimum wage of R${minimum.toFixed(2)}` });
  }
  if (basis === 'daily') {
    const perDay = hoursPerDay(employee);
    const dayMinimum = round2(minimum * perDay);
    if (rate + 0.0001 < dayMinimum) {
      issues.push({ code: 'BELOW_MINIMUM_WAGE', message: `R${rate.toFixed(2)} a day is below the national minimum wage for a ${perDay}-hour day (R${dayMinimum.toFixed(2)})` });
    }
  }
  return issues;
}

/**
 * Ordinary hours a month for a salaried employee (weekly hours × 52 ÷ 12), or null when the
 * weekly hours are not captured (treated as full time).
 */
export function salariedMonthlyHours(employee: TimeEmployee): number | null {
  const h = num(employee.ordinary_hours_per_week);
  return h > 0 ? round2((h * 52) / 12) : null;
}

/** UI Act s3: no UIF when fewer than 24 hours are worked for the employer in the month. */
export function uifExemptForHours(hoursInMonth: number | null): boolean {
  return hoursInMonth !== null && hoursInMonth < UIF_MINIMUM_HOURS_PER_MONTH;
}

/** A day on the attendance register: hours (hourly-paid) or a full or half day (daily-paid). */
export type AttendanceDay = { date: string; hours?: number | null; days?: number | null };

/**
 * Period totals from the attendance register: the days ticked (a full day 1, a half day 0.5)
 * for daily-paid employees, the hours for hourly-paid ones. A day recorded only in hours
 * (before the register had ticks) counts as a full day.
 */
export function attendanceTotals(employee: TimeEmployee, days: AttendanceDay[]): { days_worked: number; ordinary_hours: number; daysRecorded: number } {
  const basis = payBasisOf(employee);
  let daysWorked = 0;
  let hours = 0;
  let daysRecorded = 0;
  for (const day of days) {
    const d = day.days != null ? num(day.days) : num(day.hours) > 0 ? 1 : 0;
    const h = num(day.hours);
    if (d <= 0 && h <= 0) continue;
    daysRecorded += 1;
    daysWorked += d;
    hours += h;
  }
  return {
    days_worked: basis === 'daily' ? round2(daysWorked) : 0,
    ordinary_hours: basis === 'hourly' ? round2(hours) : 0,
    daysRecorded,
  };
}
