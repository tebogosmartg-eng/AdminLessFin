/**
 * Leave under the Basic Conditions of Employment Act 75 of 1997 (BCEA), sections 20–27:
 * leave types, balances, the working days a leave period uses, unpaid leave in a pay
 * period, and the daily rate for leave paid out.
 *
 * - Annual leave (s20): 21 consecutive days a cycle = 3 weeks of the employee's working
 *   days (15 on a 5-day week), or more by contract. Accrued daily from the start date;
 *   unused leave carries over (forfeiture is recorded explicitly, never automatic).
 * - Sick leave (s22): the days normally worked in 6 weeks, per 36-month cycle. In the
 *   first 6 months: 1 day for every 26 days worked; those days count against the cycle.
 * - Family responsibility leave (s27): 3 days per annual cycle, for employees employed for
 *   longer than 4 months who work at least 4 days a week. It does not carry over.
 * - Maternity, parental and unpaid leave have no balance; unpaid leave reduces pay.
 *
 * Pure: balances are worked out from the employee and the leave register, so they are
 * the same whenever they are read. The copies in src/lib and supabase/functions/_shared
 * must stay identical (a unit test compares them).
 */

import { saPublicHolidays } from './periodEmployment.ts';

export type LeaveCategory = 'annual' | 'sick' | 'family' | 'maternity' | 'parental' | 'unpaid' | 'other';
export type LeaveAccrual = 'bcea_annual' | 'bcea_sick' | 'bcea_family' | 'none';
export type LeaveEntryType = 'taken' | 'opening_balance' | 'adjustment' | 'payout' | 'forfeit';

export type LeaveTypeDefinition = {
  code: string;
  name: string;
  category: LeaveCategory;
  paid: boolean;
  accrual: LeaveAccrual;
};

/** The types every company starts with. */
export const DEFAULT_LEAVE_TYPES: LeaveTypeDefinition[] = [
  { code: 'annual', name: 'Annual leave', category: 'annual', paid: true, accrual: 'bcea_annual' },
  { code: 'sick', name: 'Sick leave', category: 'sick', paid: true, accrual: 'bcea_sick' },
  { code: 'family', name: 'Family responsibility leave', category: 'family', paid: true, accrual: 'bcea_family' },
  { code: 'maternity', name: 'Maternity leave', category: 'maternity', paid: false, accrual: 'none' },
  { code: 'parental', name: 'Parental leave', category: 'parental', paid: false, accrual: 'none' },
  { code: 'unpaid', name: 'Unpaid leave', category: 'unpaid', paid: false, accrual: 'none' },
];

export type LeaveEmployee = {
  startDate: string | null;
  endDate: string | null;
  /** Days normally worked a week; null = 5. */
  workDaysPerWeek: number | null;
  /** Annual leave days a cycle by contract; null = the BCEA minimum (3 weeks). */
  annualLeaveDaysPerCycle: number | null;
};

export type LeaveEntry = {
  leaveTypeId: string;
  entryType: LeaveEntryType;
  /** First and last day of leave taken; null for other entry types. */
  startDate: string | null;
  endDate: string | null;
  /** The date the entry counts from (leave start, payout date, adjustment date). */
  effectiveDate: string;
  /** Positive, except adjustments which may be negative. */
  days: number;
  status: 'approved' | 'cancelled';
};

export type LeaveBalance = {
  /** Accrued or entitled to as at the date (opening balance included). */
  entitled: number;
  taken: number;
  /** Approved leave starting after the date. */
  booked: number;
  adjustments: number;
  paidOut: number;
  forfeited: number;
  /** entitled − taken + adjustments − paid out − forfeited (as at the date). */
  balance: number;
  /** balance less leave already booked after the date. */
  available: number;
  cycleStart: string | null;
  cycleEnd: string | null;
  note: string | null;
};

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);

export function workDaysOf(employee: Pick<LeaveEmployee, 'workDaysPerWeek'>): number {
  const d = Number(employee.workDaysPerWeek);
  return Number.isFinite(d) && d > 0 && d <= 7 ? d : 5;
}

/** Same day-of-month `months` later, clamped to the month end. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return iso(target.getTime());
}

/**
 * Working days a leave period uses: the employee's working week (Monday–Friday for up to
 * 5 days, Monday–Saturday for 6, every day for 7), excluding public holidays (s21: a public
 * holiday during annual leave is not a leave day).
 */
export function leaveWorkingDays(from: string, to: string, workDaysPerWeek: number | null = 5): number {
  const a = utc(from);
  const b = utc(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  const week = workDaysOf({ workDaysPerWeek });
  const holidays = new Map<number, Set<string>>();
  let count = 0;
  for (let t = a; t <= b; t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (week < 7 && weekday === 0) continue;
    if (week < 6 && weekday === 6) continue;
    const day = iso(t);
    const year = Number(day.slice(0, 4));
    if (!holidays.has(year)) holidays.set(year, saPublicHolidays(year));
    if (holidays.get(year)!.has(day)) continue;
    count += 1;
  }
  return count;
}

export function annualEntitlementPerCycle(employee: LeaveEmployee): number {
  const contract = Number(employee.annualLeaveDaysPerCycle);
  if (Number.isFinite(contract) && contract > 0) return contract;
  return 3 * workDaysOf(employee);
}

export function sickEntitlementPerCycle(employee: LeaveEmployee): number {
  return 6 * workDaysOf(employee);
}

/** The cycle (start, end) of `lengthMonths` that contains `asAt`, counted from the start date. */
export function cycleContaining(startDate: string, asAt: string, lengthMonths: number): { start: string; end: string; index: number } {
  let index = 0;
  let start = startDate;
  let next = addMonths(startDate, lengthMonths);
  while (next <= asAt) {
    index += 1;
    start = next;
    next = addMonths(startDate, lengthMonths * (index + 1));
  }
  return { start, end: iso(utc(next) - DAY), index };
}

function sumDays(entries: LeaveEntry[], pick: (e: LeaveEntry) => boolean): number {
  return round2(entries.filter((e) => e.status === 'approved' && pick(e)).reduce((s, e) => s + Number(e.days || 0), 0));
}

function emptyBalance(note: string | null): LeaveBalance {
  return { entitled: 0, taken: 0, booked: 0, adjustments: 0, paidOut: 0, forfeited: 0, balance: 0, available: 0, cycleStart: null, cycleEnd: null, note };
}

/**
 * The balance of one leave type for one employee as at a date. `entries` are that
 * employee's register entries for that type.
 */
export function leaveBalance(accrual: LeaveAccrual, employee: LeaveEmployee, entries: LeaveEntry[], asAt: string): LeaveBalance {
  const start = employee.startDate;
  if (!start || start > asAt) return emptyBalance(start ? 'Not yet employed on this date.' : 'No start date on the employee record.');
  const lastDay = employee.endDate ? minDate(employee.endDate, asAt) : asAt;
  const taken = (e: LeaveEntry, from: string, to: string) => e.entryType === 'taken' && (e.startDate ?? e.effectiveDate) >= from && (e.startDate ?? e.effectiveDate) <= to;

  if (accrual === 'bcea_annual') {
    const serviceDays = Math.max(0, (utc(lastDay) - utc(start)) / DAY + 1);
    const accrued = round2((annualEntitlementPerCycle(employee) * serviceDays) / 365);
    const opening = sumDays(entries, (e) => e.entryType === 'opening_balance' && e.effectiveDate <= asAt);
    const result = {
      entitled: round2(accrued + opening),
      taken: sumDays(entries, (e) => taken(e, '0000-01-01', asAt)),
      booked: sumDays(entries, (e) => taken(e, iso(utc(asAt) + DAY), '9999-12-31')),
      adjustments: sumDays(entries, (e) => e.entryType === 'adjustment' && e.effectiveDate <= asAt),
      paidOut: sumDays(entries, (e) => e.entryType === 'payout' && e.effectiveDate <= asAt),
      forfeited: sumDays(entries, (e) => e.entryType === 'forfeit' && e.effectiveDate <= asAt),
    };
    const cycle = cycleContaining(start, asAt, 12);
    const balance = round2(result.entitled - result.taken + result.adjustments - result.paidOut - result.forfeited);
    return { ...result, balance, available: round2(balance - result.booked), cycleStart: cycle.start, cycleEnd: cycle.end, note: null };
  }

  if (accrual === 'bcea_sick') {
    const cycle = cycleContaining(start, asAt, 36);
    const firstSixMonthsEnd = iso(utc(addMonths(start, 6)) - DAY);
    let entitled = sickEntitlementPerCycle(employee);
    let note: string | null = null;
    if (cycle.index === 0 && asAt <= firstSixMonthsEnd) {
      // s22(3): 1 day's paid sick leave for every 26 days worked in the first 6 months.
      entitled = Math.floor(leaveWorkingDays(start, lastDay, employee.workDaysPerWeek) / 26);
      note = 'First 6 months: 1 day for every 26 days worked.';
    }
    const opening = sumDays(entries, (e) => e.entryType === 'opening_balance' && e.effectiveDate >= cycle.start && e.effectiveDate <= asAt);
    const result = {
      entitled: round2(entitled + opening),
      taken: sumDays(entries, (e) => taken(e, cycle.start, asAt)),
      booked: sumDays(entries, (e) => taken(e, iso(utc(asAt) + DAY), cycle.end)),
      adjustments: sumDays(entries, (e) => e.entryType === 'adjustment' && e.effectiveDate >= cycle.start && e.effectiveDate <= asAt),
      paidOut: 0,
      forfeited: 0,
    };
    const balance = round2(result.entitled - result.taken + result.adjustments);
    return { ...result, balance, available: round2(balance - result.booked), cycleStart: cycle.start, cycleEnd: cycle.end, note };
  }

  if (accrual === 'bcea_family') {
    const cycle = cycleContaining(start, asAt, 12);
    const eligible = asAt > addMonths(start, 4) && workDaysOf(employee) >= 4;
    const result = {
      entitled: eligible ? 3 : 0,
      taken: sumDays(entries, (e) => taken(e, cycle.start, asAt)),
      booked: sumDays(entries, (e) => taken(e, iso(utc(asAt) + DAY), cycle.end)),
      adjustments: sumDays(entries, (e) => e.entryType === 'adjustment' && e.effectiveDate >= cycle.start && e.effectiveDate <= asAt),
      paidOut: 0,
      forfeited: 0,
    };
    const balance = round2(result.entitled - result.taken + result.adjustments);
    return {
      ...result, balance, available: round2(balance - result.booked), cycleStart: cycle.start, cycleEnd: cycle.end,
      note: eligible ? null : 'Only after 4 months of employment, for employees working at least 4 days a week.',
    };
  }

  // No balance: only what was taken is shown.
  const takenDays = sumDays(entries, (e) => taken(e, '0000-01-01', asAt));
  return { ...emptyBalance(null), taken: takenDays, booked: sumDays(entries, (e) => taken(e, iso(utc(asAt) + DAY), '9999-12-31')) };
}

/**
 * BCEA s35 daily wage: for a monthly salary, the monthly amount ÷ (4.333 × days worked a
 * week); weekly ÷ days a week; fortnightly ÷ (2 × days a week).
 */
export function dailyRate(salaryAmount: number, salaryPeriod: string | null | undefined, workDaysPerWeek: number | null): number {
  const salary = Number(salaryAmount) || 0;
  const days = workDaysOf({ workDaysPerWeek });
  if (salary <= 0) return 0;
  if (salaryPeriod === 'weekly') return round2(salary / days);
  if (salaryPeriod === 'fortnightly') return round2(salary / (2 * days));
  return round2((salary * 12) / (52 * days));
}

/**
 * Unpaid leave days that fall in a pay period: each unpaid entry counts in proportion to
 * its working days inside the period (a 2-day entry recorded over a weekend counts 2).
 */
export function unpaidLeaveDaysInPeriod(
  entries: LeaveEntry[],
  periodStart: string,
  periodEnd: string,
  workDaysPerWeek: number | null,
): number {
  let total = 0;
  for (const e of entries) {
    if (e.status !== 'approved' || e.entryType !== 'taken' || !e.startDate || !e.endDate) continue;
    if (e.endDate < periodStart || e.startDate > periodEnd) continue;
    const span = leaveWorkingDays(e.startDate, e.endDate, workDaysPerWeek);
    const inside = leaveWorkingDays(maxDate(e.startDate, periodStart), minDate(e.endDate, periodEnd), workDaysPerWeek);
    total += span > 0 ? (Number(e.days) * inside) / span : 0;
  }
  return round2(total);
}

/**
 * Share of the period's basic salary still paid after unpaid leave: the employment
 * fraction less the unpaid working days over the working days employed in the period.
 */
export function paidShareAfterUnpaidLeave(input: {
  employmentFactor: number;
  unpaidDays: number;
  workingDaysEmployed: number;
}): number {
  const { employmentFactor, unpaidDays, workingDaysEmployed } = input;
  if (employmentFactor <= 0) return 0;
  if (unpaidDays <= 0 || workingDaysEmployed <= 0) return employmentFactor;
  const kept = Math.max(0, 1 - unpaidDays / workingDaysEmployed);
  return Math.round(employmentFactor * kept * 1_000_000) / 1_000_000;
}
