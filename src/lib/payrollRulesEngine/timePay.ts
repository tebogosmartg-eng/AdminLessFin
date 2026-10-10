/**
 * Pay for time worked: hourly and daily-paid employees, overtime, Sunday and public
 * holiday work, under the Basic Conditions of Employment Act 75 of 1997 (BCEA):
 *
 * - s35: the hourly wage of a salaried employee is the weekly wage ÷ ordinary weekly hours
 *   (at most 45); monthly = 4⅓ × weekly. A day is the ordinary weekly hours ÷ working days.
 * - s10: overtime at 1.5× the wage; at most 10 hours a week.
 * - s16: Sunday work at 2×, or 1.5× when the employee ordinarily works on Sundays.
 * - s18: public holiday work at 2× (the greater-of rule reduces to this for a normal day);
 *   a public holiday not worked on a normal working day is paid at the daily wage.
 * - s9: ordinary hours at most 45 a week.
 * - UI Act s3 / UIC Act s4: no UIF for an employee working under 24 hours in a month.
 * - National Minimum Wage Act: an hourly rate below the NMW is flagged.
 *
 * There is no daily pay frequency: SARS publishes no daily tax tables, so daily-paid and
 * casual workers are paid on weekly (or fortnightly) runs with their days captured.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

import { nationalMinimumWageHourly } from '../sars/eti';
import { saPublicHolidays } from './periodEmployment';

export type PayBasis = 'salaried' | 'hourly' | 'daily';

export type TimeEmployee = {
  pay_basis?: string | null;
  /** Rate per hour (hourly) or per day (daily). */
  pay_rate?: number | null;
  salary_amount?: number | null;
  salary_period?: string | null;
  ordinary_hours_per_week?: number | null;
  work_days_per_week?: number | null;
  works_sundays?: boolean | null;
};

export type Timesheet = {
  ordinary_hours?: number | null;
  days_worked?: number | null;
  overtime_hours?: number | null;
  sunday_hours?: number | null;
  public_holiday_hours?: number | null;
  /** Public holidays on a normal working day that were not worked (hourly / daily pay). */
  public_holiday_days_paid?: number | null;
};

export type TimePayLine = {
  code: 'time_ordinary' | 'time_public_holiday_paid' | 'time_overtime' | 'time_sunday' | 'time_public_holiday_worked';
  description: string;
  hours: number;
  rate: number;
  multiplier: number;
  amount: number;
  irp5Code: string;
};

/**
 * The company's pay rules for time. The defaults are the BCEA rates; an employer may set
 * other multipliers (the BCEA rates are the legal minimum, shown as advice, never enforced).
 */
export type TimePolicy = {
  overtimeMultiplier: number;
  sundayMultiplier: number;
  sundayMultiplierRegular: number;
  publicHolidayMultiplier: number;
  /** BCEA s9A: a shift shorter than this is paid as this many hours; 0 = off. */
  minimumShiftHours: number;
};

export const OVERTIME_MULTIPLIER = 1.5;
export const SUNDAY_MULTIPLIER = 2;
export const SUNDAY_MULTIPLIER_ORDINARY_SUNDAY_WORKER = 1.5;
export const PUBLIC_HOLIDAY_MULTIPLIER = 2;
export const MAX_ORDINARY_HOURS_PER_WEEK = 45;
export const MAX_OVERTIME_HOURS_PER_WEEK = 10;
export const UIF_MINIMUM_HOURS_PER_MONTH = 24;

export const BCEA_TIME_POLICY: TimePolicy = {
  overtimeMultiplier: OVERTIME_MULTIPLIER,
  sundayMultiplier: SUNDAY_MULTIPLIER,
  sundayMultiplierRegular: SUNDAY_MULTIPLIER_ORDINARY_SUNDAY_WORKER,
  publicHolidayMultiplier: PUBLIC_HOLIDAY_MULTIPLIER,
  minimumShiftHours: 4,
};

/** A stored policy row (or none) as the rules use it. */
export function timePolicyFrom(row: Record<string, unknown> | null | undefined): TimePolicy {
  const n = (v: unknown, fallback: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? fallback : Number(v));
  return {
    overtimeMultiplier: n(row?.overtime_multiplier, OVERTIME_MULTIPLIER),
    sundayMultiplier: n(row?.sunday_multiplier, SUNDAY_MULTIPLIER),
    sundayMultiplierRegular: n(row?.sunday_multiplier_regular, SUNDAY_MULTIPLIER_ORDINARY_SUNDAY_WORKER),
    publicHolidayMultiplier: n(row?.public_holiday_multiplier, PUBLIC_HOLIDAY_MULTIPLIER),
    minimumShiftHours: n(row?.minimum_shift_hours, 4),
  };
}

/** Where a company's rules fall below the BCEA (advice for the settings screen). */
export function policyBelowBcea(policy: TimePolicy): string[] {
  const out: string[] = [];
  if (policy.overtimeMultiplier < OVERTIME_MULTIPLIER) out.push(`Overtime below ${OVERTIME_MULTIPLIER}× (BCEA s10)`);
  if (policy.sundayMultiplier < SUNDAY_MULTIPLIER) out.push(`Sunday work below ${SUNDAY_MULTIPLIER}× (BCEA s16)`);
  if (policy.sundayMultiplierRegular < SUNDAY_MULTIPLIER_ORDINARY_SUNDAY_WORKER) out.push(`Sunday work for regular Sunday workers below ${SUNDAY_MULTIPLIER_ORDINARY_SUNDAY_WORKER}× (BCEA s16)`);
  if (policy.publicHolidayMultiplier < PUBLIC_HOLIDAY_MULTIPLIER) out.push(`Public holiday work below ${PUBLIC_HOLIDAY_MULTIPLIER}× (BCEA s18)`);
  if (policy.minimumShiftHours < 4) out.push('Shifts shorter than 4 hours paid for fewer than 4 hours (BCEA s9A)');
  return out;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function payBasisOf(employee: Pick<TimeEmployee, 'pay_basis'>): PayBasis {
  return employee.pay_basis === 'hourly' || employee.pay_basis === 'daily' ? employee.pay_basis : 'salaried';
}

/** Ordinary hours a week (s35: at most 45; 45 when not captured). */
export function weeklyHours(employee: TimeEmployee): number {
  const h = num(employee.ordinary_hours_per_week);
  return h > 0 ? Math.min(h, MAX_ORDINARY_HOURS_PER_WEEK) : MAX_ORDINARY_HOURS_PER_WEEK;
}

export function workDays(employee: TimeEmployee): number {
  const d = num(employee.work_days_per_week);
  return d > 0 && d <= 7 ? d : 5;
}

/** Ordinary hours in a working day (s35(2): at most 9, or 7.5 when working more than 5 days a week). */
export function hoursPerDay(employee: TimeEmployee): number {
  const days = workDays(employee);
  const cap = days > 5 ? 7.5 : 9;
  return round4(Math.min(cap, weeklyHours(employee) / days));
}

/** The employee's ordinary hourly wage (s35). */
export function hourlyWage(employee: TimeEmployee): number {
  const basis = payBasisOf(employee);
  if (basis === 'hourly') return round4(num(employee.pay_rate));
  if (basis === 'daily') return round4(num(employee.pay_rate) / hoursPerDay(employee));
  const salary = num(employee.salary_amount);
  if (salary <= 0) return 0;
  const weekly = employee.salary_period === 'weekly'
    ? salary
    : employee.salary_period === 'fortnightly'
      ? salary / 2
      : (salary * 12) / 52;
  return round4(weekly / weeklyHours(employee));
}

/** The employee's ordinary daily wage. */
export function dailyWage(employee: TimeEmployee): number {
  return payBasisOf(employee) === 'daily' ? round2(num(employee.pay_rate)) : round2(hourlyWage(employee) * hoursPerDay(employee));
}

/** Ordinary hours on a timesheet (days count at the employee's hours per day). */
export function ordinaryHoursWorked(employee: TimeEmployee, ts: Timesheet | null | undefined): number {
  if (!ts) return 0;
  return round2(payBasisOf(employee) === 'daily' ? num(ts.days_worked) * hoursPerDay(employee) : num(ts.ordinary_hours));
}

/** Every hour worked on a timesheet (ordinary, overtime, Sunday, public holiday). */
export function totalHoursWorked(employee: TimeEmployee, ts: Timesheet | null | undefined): number {
  if (!ts) return 0;
  return round2(ordinaryHoursWorked(employee, ts) + num(ts.overtime_hours) + num(ts.sunday_hours) + num(ts.public_holiday_hours));
}

/**
 * Pay lines for a timesheet. For hourly and daily-paid employees the ordinary pay is the
 * basic pay; for salaried employees only the premiums are added (the salary already pays
 * ordinary time and public holidays not worked).
 */
export function timePayLines(employee: TimeEmployee, ts: Timesheet | null | undefined, policy: TimePolicy = BCEA_TIME_POLICY): {
  ordinaryPay: number;
  lines: TimePayLine[];
} {
  const lines: TimePayLine[] = [];
  if (!ts) return { ordinaryPay: 0, lines };
  const basis = payBasisOf(employee);
  const hourly = hourlyWage(employee);
  const add = (code: TimePayLine['code'], description: string, hours: number, rate: number, multiplier: number, irp5Code: string) => {
    const amount = round2(hours * rate * multiplier);
    if (hours > 0 && amount > 0) lines.push({ code, description, hours: round2(hours), rate: round4(rate), multiplier, amount, irp5Code });
  };

  let ordinaryPay = 0;
  if (basis === 'hourly') {
    ordinaryPay = round2(num(ts.ordinary_hours) * hourly);
  } else if (basis === 'daily') {
    ordinaryPay = round2(num(ts.days_worked) * num(employee.pay_rate));
  }
  if (basis !== 'salaried' && num(ts.public_holiday_days_paid) > 0) {
    const days = num(ts.public_holiday_days_paid);
    const amount = round2(days * dailyWage(employee));
    if (amount > 0) {
      lines.push({
        code: 'time_public_holiday_paid', description: `Public holiday pay (${round2(days)} day${days === 1 ? '' : 's'})`,
        hours: round2(days * hoursPerDay(employee)), rate: dailyWage(employee), multiplier: 1, amount, irp5Code: '3601',
      });
    }
  }
  add('time_overtime', `Overtime (${round2(num(ts.overtime_hours))} h × ${policy.overtimeMultiplier})`, num(ts.overtime_hours), hourly, policy.overtimeMultiplier, '3607');
  const sundayMultiplier = employee.works_sundays ? policy.sundayMultiplierRegular : policy.sundayMultiplier;
  add('time_sunday', `Sunday work (${round2(num(ts.sunday_hours))} h × ${sundayMultiplier})`, num(ts.sunday_hours), hourly, sundayMultiplier, '3601');
  add('time_public_holiday_worked', `Public holiday work (${round2(num(ts.public_holiday_hours))} h × ${policy.publicHolidayMultiplier})`, num(ts.public_holiday_hours), hourly, policy.publicHolidayMultiplier, '3601');
  return { ordinaryPay, lines };
}

/** Weeks in a pay period (inclusive days ÷ 7), for the weekly limits. */
export function weeksInPeriod(periodStart: string, periodEnd: string): number {
  const days = (Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86_400_000 + 1;
  return days > 0 ? days / 7 : 1;
}

export type TimeIssue = { code: 'OVERTIME_LIMIT' | 'ORDINARY_HOURS_LIMIT' | 'BELOW_MINIMUM_WAGE' | 'NO_RATE'; message: string };

/** Checks a timesheet against the BCEA limits and the national minimum wage. */
export function timesheetIssues(employee: TimeEmployee, ts: Timesheet | null | undefined, periodStart: string, periodEnd: string): TimeIssue[] {
  const issues: TimeIssue[] = [];
  const basis = payBasisOf(employee);
  if (basis !== 'salaried' && num(employee.pay_rate) <= 0) {
    issues.push({ code: 'NO_RATE', message: `no ${basis === 'hourly' ? 'hourly' : 'daily'} rate is set on the employee` });
  }
  const weeks = weeksInPeriod(periodStart, periodEnd);
  if (ts) {
    const overtime = num(ts.overtime_hours);
    if (overtime > MAX_OVERTIME_HOURS_PER_WEEK * weeks + 0.001) {
      issues.push({ code: 'OVERTIME_LIMIT', message: `${round2(overtime)} overtime hours is more than the BCEA limit of ${MAX_OVERTIME_HOURS_PER_WEEK} a week (${round2(MAX_OVERTIME_HOURS_PER_WEEK * weeks)} for this period), unless a collective agreement allows it` });
    }
    const ordinary = ordinaryHoursWorked(employee, ts);
    if (ordinary > MAX_ORDINARY_HOURS_PER_WEEK * weeks + 0.001) {
      issues.push({ code: 'ORDINARY_HOURS_LIMIT', message: `${ordinary} ordinary hours is more than ${MAX_ORDINARY_HOURS_PER_WEEK} a week (${round2(MAX_ORDINARY_HOURS_PER_WEEK * weeks)} for this period); record the extra as overtime` });
    }
  }
  const minimum = nationalMinimumWageHourly(periodEnd.slice(0, 7));
  const hourly = hourlyWage(employee);
  if (minimum && hourly > 0 && hourly + 0.0001 < minimum) {
    issues.push({ code: 'BELOW_MINIMUM_WAGE', message: `the hourly wage of R${hourly.toFixed(2)} is below the national minimum wage of R${minimum.toFixed(2)}` });
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

export type AttendanceDay = { date: string; hours: number };

/**
 * Period totals from the daily attendance register. Each day: a public holiday's hours are
 * public holiday work; a Sunday's are Sunday work; otherwise hours up to the employee's
 * ordinary day are ordinary time and the rest overtime. A shift shorter than the policy's
 * minimum is paid as the minimum (BCEA s9A). Daily-paid: each day counts as hours ÷ hours
 * per day (a full day = 1). Salaried employees: only overtime, Sunday and public holiday
 * hours (their salary pays ordinary time).
 */
export function attendanceTotals(employee: TimeEmployee, days: AttendanceDay[], policy: TimePolicy = BCEA_TIME_POLICY): Required<Timesheet> & { shiftTopUpHours: number; daysRecorded: number } {
  const basis = payBasisOf(employee);
  const perDay = hoursPerDay(employee);
  const totals = { ordinary_hours: 0, days_worked: 0, overtime_hours: 0, sunday_hours: 0, public_holiday_hours: 0, public_holiday_days_paid: 0, shiftTopUpHours: 0, daysRecorded: 0 };
  const holidays = new Map<number, Set<string>>();
  for (const day of days) {
    const worked = num(day.hours);
    if (worked <= 0) continue;
    totals.daysRecorded += 1;
    const year = Number(day.date.slice(0, 4));
    if (!holidays.has(year)) holidays.set(year, saPublicHolidays(year));
    const topUp = basis !== 'salaried' && policy.minimumShiftHours > 0 && worked < policy.minimumShiftHours ? policy.minimumShiftHours - worked : 0;
    const paid = worked + topUp;
    totals.shiftTopUpHours += topUp;
    if (holidays.get(year)!.has(day.date)) { totals.public_holiday_hours += paid; continue; }
    if (new Date(`${day.date}T00:00:00Z`).getUTCDay() === 0) { totals.sunday_hours += paid; continue; }
    const ordinary = Math.min(paid, perDay);
    totals.overtime_hours += Math.max(0, paid - perDay);
    if (basis === 'hourly') totals.ordinary_hours += ordinary;
    if (basis === 'daily') totals.days_worked += ordinary / perDay;
  }
  return {
    ordinary_hours: round2(totals.ordinary_hours),
    days_worked: round2(totals.days_worked),
    overtime_hours: round2(totals.overtime_hours),
    sunday_hours: round2(totals.sunday_hours),
    public_holiday_hours: round2(totals.public_holiday_hours),
    public_holiday_days_paid: 0,
    shiftTopUpHours: round2(totals.shiftTopUpHours),
    daysRecorded: totals.daysRecorded,
  };
}
