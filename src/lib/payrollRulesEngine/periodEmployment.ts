/**
 * Period employment helpers — age, eligibility, pro-rata, year-to-date and the
 * SDL annual estimate. Pure functions; safe to unit-test without a database.
 *
 * Keep in sync with supabase/functions/_shared/payrollRulesEngine/periodEmployment.ts
 * (tests/unit/period-employment.test.ts compares the two copies).
 */

export type PeriodEmployee = {
  id?: string;
  start_date?: string | null;
  end_date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  id_number?: string | null;
  idNumber?: string | null;
  date_of_birth?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  salary_amount?: number | null;
  salaryAmount?: number | null;
  salary_period?: 'monthly' | 'weekly' | 'fortnightly' | null;
  salaryPeriod?: 'monthly' | 'weekly' | 'fortnightly' | null;
};

export type YtdTotals = {
  taxableIncome: number;
  payePaid: number;
  grossEarnings: number;
  /** Distinct pay months already paid in this tax year (supplementary runs in a month count once). */
  periodsProcessed: number;
};

/** Youngest age at which a person can be on a payroll; younger ID-derived ages belong to the previous century. */
const MIN_EMPLOYMENT_AGE = 15;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOf(employee: PeriodEmployee): string | null {
  return employee.start_date ?? employee.startDate ?? null;
}

function endOf(employee: PeriodEmployee): string | null {
  return employee.end_date ?? employee.endDate ?? null;
}

function utc(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive calendar-day count between YYYY-MM-DD dates (UTC). */
export function inclusiveDayCount(from: string, to: string): number {
  const a = utc(from);
  const b = utc(to);
  if (b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Last day of the SA tax year (end of February) that contains the date. */
export function taxYearEnd(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const endYear = month >= 3 ? year + 1 : year;
  // Day 0 of March is the last day of February (28 or 29).
  return iso(Date.UTC(endYear, 2, 0));
}

/** Luhn check used by SA identity numbers. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Date of birth from a 13-digit SA ID (YYMMDD SSSS C A Z), or undefined when the
 * number is not a valid SA ID (wrong length, impossible date, failed check digit).
 * The century is the one that makes the person at least of working age on referenceDate.
 */
export function birthDateFromSaId(idNumber: string | null | undefined, referenceDate: string): string | undefined {
  if (!idNumber) return undefined;
  const digits = String(idNumber).replace(/\s/g, '');
  if (!/^\d{13}$/.test(digits) || !luhnValid(digits)) return undefined;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const refYear = Number(referenceDate.slice(0, 4));
  let year = Math.floor(refYear / 100) * 100 + yy;
  if (year > refYear - MIN_EMPLOYMENT_AGE) year -= 100;

  const birth = new Date(Date.UTC(year, mm - 1, dd));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== mm - 1 || birth.getUTCDate() !== dd) {
    return undefined;
  }
  return iso(birth.getTime());
}

/** Completed years between birthDate and asOf (both YYYY-MM-DD). */
export function ageOn(birthDate: string, asOf: string): number {
  let age = Number(asOf.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (asOf.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}

/** Back-compatible: age on asOfDate from an SA ID, undefined when the ID is not valid. */
export function resolveAgeFromSaId(idNumber: string | null | undefined, asOfDate: string): number | undefined {
  const birth = birthDateFromSaId(idNumber, asOfDate);
  if (!birth) return undefined;
  const age = ageOn(birth, asOfDate);
  return age >= 0 && age <= 120 ? age : undefined;
}

export type AgeResolution = {
  /** Age on the last day of the tax year — the age SARS uses for the secondary and tertiary rebates. */
  age: number | undefined;
  asAt: string;
  source: 'date_of_birth' | 'id_number' | 'age' | 'none';
  warning?: string;
};

/**
 * Age for PAYE rebates. SARS grants the secondary (65) and tertiary (75) rebate for the
 * whole tax year when the person reaches that age by the last day of February, so the
 * age is taken at the end of the tax year containing the pay date, not on the pay date.
 * Order: date of birth, then a valid SA ID, then an explicit age.
 */
export function resolveEmployeeAgeDetail(employee: PeriodEmployee, payDate: string): AgeResolution {
  const asAt = taxYearEnd(payDate);
  const dob = employee.date_of_birth ?? employee.dateOfBirth ?? null;
  if (dob && /^\d{4}-\d{2}-\d{2}/.test(dob)) {
    return { age: ageOn(dob.slice(0, 10), asAt), asAt, source: 'date_of_birth' };
  }
  const idNumber = employee.id_number ?? employee.idNumber ?? null;
  if (idNumber) {
    const birth = birthDateFromSaId(idNumber, asAt);
    if (birth) return { age: ageOn(birth, asAt), asAt, source: 'id_number' };
  }
  if (employee.age != null && Number.isFinite(Number(employee.age))) {
    return { age: Number(employee.age), asAt, source: 'age' };
  }
  return {
    age: undefined,
    asAt,
    source: 'none',
    warning: idNumber
      ? 'ID number is not a valid SA ID and no date of birth is recorded: age-based rebates were not applied.'
      : 'No date of birth or SA ID recorded: age-based rebates were not applied.',
  };
}

/** Age (at tax-year end) for PAYE rebates, or undefined when it cannot be established. */
export function resolveEmployeeAge(employee: PeriodEmployee, payDate: string): number | undefined {
  return resolveEmployeeAgeDetail(employee, payDate).age;
}

/**
 * Employee is paid in a period when their employment overlaps the pay period.
 * Uses period bounds — not "today" — so back-dated and historical runs stay correct.
 */
export function isEmployeeActiveInPeriod(employee: PeriodEmployee, periodStart: string, periodEnd: string): boolean {
  const start = startOf(employee);
  const end = endOf(employee);
  if (start && start > periodEnd) return false;
  if (end && end < periodStart) return false;
  return true;
}

/**
 * Calendar-day fraction of the pay period the employee was employed.
 * Full period → 1. Mid-period join/leave → partial. Outside period → 0.
 */
export function employmentProRataFactor(
  employee: PeriodEmployee,
  periodStart: string,
  periodEnd: string,
  method: ProRataMethod = 'calendar_days'
): number {
  if (!isEmployeeActiveInPeriod(employee, periodStart, periodEnd)) return 0;
  const count = method === 'working_days' ? workingDayCount : inclusiveDayCount;
  const periodDays = count(periodStart, periodEnd);
  if (periodDays <= 0) {
    // A period with no working days (e.g. a holiday week) falls back to calendar days.
    return method === 'working_days' ? employmentProRataFactor(employee, periodStart, periodEnd, 'calendar_days') : 0;
  }
  const start = startOf(employee);
  const end = endOf(employee);
  const workedFrom = start && start > periodStart ? start : periodStart;
  const workedTo = end && end < periodEnd ? end : periodEnd;
  const workedDays = count(workedFrom, workedTo);
  if (workedDays <= 0) return 0;
  if (workedDays >= periodDays) return 1;
  return workedDays / periodDays;
}

/** How a partial period is measured: every calendar day, or Monday–Friday excluding SA public holidays. */
export type ProRataMethod = 'calendar_days' | 'working_days';

export function proRataMethodOf(value: unknown): ProRataMethod {
  return value === 'working_days' ? 'working_days' : 'calendar_days';
}

/** Easter Sunday (Gregorian, anonymous algorithm) as YYYY-MM-DD. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(year, month - 1, day));
}

/**
 * South African public holidays for a year (Public Holidays Act 36 of 1994):
 * the twelve statutory days, Good Friday and Family Day from Easter, and the
 * following Monday when a holiday falls on a Sunday. Once-off proclaimed
 * holidays (e.g. election days) are not included.
 */
export function saPublicHolidays(year: number): Set<string> {
  const fixed = ['01-01', '03-21', '04-27', '05-01', '06-16', '08-09', '09-24', '12-16', '12-25', '12-26'];
  const days = fixed.map((md) => `${year}-${md}`);
  const easter = utc(easterSunday(year));
  days.push(iso(easter - 2 * 86_400_000), iso(easter + 86_400_000));
  const holidays = new Set(days);
  for (const day of days) {
    if (new Date(utc(day)).getUTCDay() === 0) {
      let monday = utc(day) + 86_400_000;
      while (holidays.has(iso(monday))) monday += 86_400_000;
      holidays.add(iso(monday));
    }
  }
  return holidays;
}

/** Monday–Friday days between two dates (inclusive), excluding SA public holidays. */
export function workingDayCount(from: string, to: string): number {
  const a = utc(from);
  const b = utc(to);
  if (b < a) return 0;
  const holidayCache = new Map<number, Set<string>>();
  let count = 0;
  for (let t = a; t <= b; t += 86_400_000) {
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const day = iso(t);
    const year = Number(day.slice(0, 4));
    if (!holidayCache.has(year)) holidayCache.set(year, saPublicHolidays(year));
    if (holidayCache.get(year)!.has(day)) continue;
    count += 1;
  }
  return count;
}

export function applyProRata(amount: number, factor: number): number {
  if (factor >= 1) return roundCurrency(amount);
  if (factor <= 0) return 0;
  return roundCurrency(amount * factor);
}

/**
 * Standing pay-package amounts that accrue with time and so follow the employment
 * fraction of a partial period. Deliberately absent: a bonus (an agreed amount),
 * subsistence (actual days and amount paid) and an employer insurance premium
 * (the premium actually paid is the benefit).
 */
const TIME_ACCRUING_FIELDS: Record<string, string[]> = {
  travel_allowance: ['monthlyAllowance', 'monthly_allowance', 'amount'],
  other_cash: ['amount'],
  fringe_company_car: ['determinedValue', 'determined_value'],
  fringe_low_interest_loan: ['loanBalance', 'loan_balance'],
  fringe_accommodation: ['monthlyRentalValue', 'monthly_rental_value'],
  fringe_asset: ['monthlyValueOfUse', 'monthly_value_of_use'],
  fringe_other: ['monthlyValue', 'monthly_value', 'amount'],
};

/**
 * Monthly package amounts converted to one pay period of a weekly or fortnightly run.
 * Everything in a standing package is stated per month, including the premium paid.
 */
const MONTHLY_PACKAGE_FIELDS: Record<string, string[]> = {
  ...TIME_ACCRUING_FIELDS,
  fringe_employer_insurance: ['monthlyPremium', 'monthly_premium'],
};

export function packageConfigForPayPeriod(
  componentCode: string,
  config: Record<string, unknown>,
  periodsPerYear: number
): Record<string, unknown> {
  if (!periodsPerYear || periodsPerYear === 12) return config;
  const fields = MONTHLY_PACKAGE_FIELDS[componentCode];
  if (!fields) return config;
  if (componentCode === 'other_cash' && config.onceOff === true) return config;
  const next = { ...config };
  for (const key of fields) {
    // determinedValue/loanBalance are capital values: scaling them scales the benefit.
    const raw = next[key];
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) next[key] = roundCurrency((value * 12) / periodsPerYear);
  }
  return next;
}

/** Pro-rates a standing package component for a partial period. Unknown or once-off fields are left as entered. */
export function proRatePackageConfig(
  componentCode: string,
  config: Record<string, unknown>,
  factor: number
): Record<string, unknown> {
  if (factor >= 1) return config;
  const fields = TIME_ACCRUING_FIELDS[componentCode];
  if (!fields) return config;
  if (componentCode === 'other_cash' && config.onceOff === true) return config;
  const next = { ...config };
  for (const key of fields) {
    const raw = next[key];
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) next[key] = applyProRata(value, factor);
  }
  return next;
}

/** One prior payslip, as read for year-to-date and the SDL estimate. */
export type PayslipYtdSource = {
  employee_id: string;
  payroll_run_id: string;
  /** Pay date of the run; used to count distinct pay months. */
  pay_date?: string | null;
  calculation_snapshot?: Record<string, unknown> | null;
};

function snapshotNumber(snapshot: Record<string, unknown> | null | undefined, key: string): number {
  if (!snapshot) return 0;
  const value = Number(snapshot[key]);
  return Number.isFinite(value) ? value : 0;
}

function engineRows(snapshot: Record<string, unknown> | null | undefined): Array<Record<string, unknown>> {
  const engines = snapshot?.engine_results;
  return Array.isArray(engines) ? (engines.filter((e) => e && typeof e === 'object') as Array<Record<string, unknown>>) : [];
}

function snapshotPaye(snapshot: Record<string, unknown> | null | undefined): number {
  let paye = 0;
  for (const row of engineRows(snapshot)) {
    if (row.engine_id === 'paye' || row.engine_id === 'bonus_tax' || row.engine_id === 'termination_tax') {
      const amount = Number(row.employee_amount ?? 0);
      if (Number.isFinite(amount)) paye += amount;
    }
  }
  return roundCurrency(paye);
}

/**
 * Fourth Schedule remuneration the payslip carried for SDL: recorded by the generator
 * from 2026-10 on, else the SDL engine's base, else cash gross (older payslips).
 */
export function snapshotSdlRemuneration(snapshot: Record<string, unknown> | null | undefined): number {
  const recorded = (snapshot?.period_employment as Record<string, unknown> | undefined)?.sdl_remuneration;
  if (recorded != null && Number.isFinite(Number(recorded))) return Number(recorded);
  const sdl = engineRows(snapshot).find((row) => row.engine_id === 'sdl');
  const base = Number((sdl?.breakdown as Record<string, unknown> | undefined)?.remuneration);
  if (Number.isFinite(base) && base > 0) return base;
  return snapshotNumber(snapshot, 'gross_earnings');
}

/** Year-to-date taxable income, PAYE and gross for one employee from prior finalised payslips. */
export function aggregateEmployeeYtd(
  payslips: PayslipYtdSource[],
  employeeId: string,
  periodsPerYear = 12
): YtdTotals {
  // Monthly: distinct pay months (a supplementary run in a month is not a new period).
  // Weekly/fortnightly: each pay date is a period.
  const periodKey = (slip: PayslipYtdSource) =>
    slip.pay_date
      ? periodsPerYear === 12 ? slip.pay_date.slice(0, 7) : slip.pay_date.slice(0, 10)
      : `run:${slip.payroll_run_id}`;
  const months = new Set<string>();
  let taxableIncome = 0;
  let payePaid = 0;
  let grossEarnings = 0;
  for (const slip of payslips) {
    if (slip.employee_id !== employeeId) continue;
    const snapshot = slip.calculation_snapshot ?? null;
    taxableIncome = roundCurrency(taxableIncome + snapshotNumber(snapshot, 'taxable_earnings'));
    payePaid = roundCurrency(payePaid + snapshotPaye(snapshot));
    grossEarnings = roundCurrency(grossEarnings + snapshotNumber(snapshot, 'gross_earnings'));
    months.add(periodKey(slip));
  }
  return { taxableIncome, payePaid, grossEarnings, periodsProcessed: months.size };
}

/**
 * UIF remuneration already counted for an employee in earlier runs paid in the same
 * calendar month as payDate — the part of the monthly UIF ceiling already used.
 */
export function uifRemunerationMonthToDate(payslips: PayslipYtdSource[], employeeId: string, payDate: string): number {
  const month = payDate.slice(0, 7);
  let total = 0;
  for (const slip of payslips) {
    if (slip.employee_id !== employeeId || !slip.pay_date || slip.pay_date.slice(0, 7) !== month) continue;
    const uif = engineRows(slip.calculation_snapshot ?? null).find((row) => row.engine_id === 'uif');
    const counted = Number((uif?.breakdown as Record<string, unknown> | undefined)?.cappedRemuneration);
    if (Number.isFinite(counted)) total += counted;
  }
  return roundCurrency(total);
}

export type RunPeriod = { pay_period_start: string; pay_period_end: string };

/** Calendar days covered by a set of pay periods, counting overlapping days once. */
export function coveredDays(periods: RunPeriod[]): number {
  const sorted = periods
    .filter((p) => p.pay_period_start && p.pay_period_end && p.pay_period_end >= p.pay_period_start)
    .map((p) => [utc(p.pay_period_start), utc(p.pay_period_end)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let days = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of sorted) {
    if (curStart < 0) {
      curStart = s;
      curEnd = e;
    } else if (s <= curEnd + 86_400_000) {
      curEnd = Math.max(curEnd, e);
    } else {
      days += Math.floor((curEnd - curStart) / 86_400_000) + 1;
      curStart = s;
      curEnd = e;
    }
  }
  if (curStart >= 0) days += Math.floor((curEnd - curStart) / 86_400_000) + 1;
  return days;
}

/** Company-wide SDL remuneration from prior finalised payslips in the tax year. */
export function aggregateCompanyRemunerationYtd(payslips: PayslipYtdSource[]): number {
  return roundCurrency(payslips.reduce((sum, slip) => sum + snapshotSdlRemuneration(slip.calculation_snapshot ?? null), 0));
}

/**
 * Estimated leviable remuneration for the year, for the SDL exemption (Skills
 * Development Levies Act s4(b): exempt when it will not exceed R500 000).
 * Annualised by the calendar days actually covered — prior finalised periods plus
 * this one, overlaps counted once (see coveredDays) — so weekly, fortnightly and
 * supplementary runs are not mistaken for months.
 */
export function estimateCompanyAnnualRemuneration(input: {
  priorRemuneration: number;
  currentRemuneration: number;
  coveredDays: number;
}): number {
  const total = Math.max(0, input.priorRemuneration) + Math.max(0, input.currentRemuneration);
  if (input.coveredDays <= 0) return 0;
  return roundCurrency((total / input.coveredDays) * 365);
}

/** Back-compatible name for the company gross aggregation. */
export function aggregateCompanyGrossYtd(payslips: PayslipYtdSource[]): { grossEarnings: number; periodsProcessed: number } {
  const runIds = new Set(payslips.map((p) => p.payroll_run_id));
  return {
    grossEarnings: roundCurrency(payslips.reduce((s, p) => s + snapshotNumber(p.calculation_snapshot ?? null, 'gross_earnings'), 0)),
    periodsProcessed: runIds.size,
  };
}
