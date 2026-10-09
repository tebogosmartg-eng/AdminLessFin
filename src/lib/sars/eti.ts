/**
 * Employment Tax Incentive (ETI Act 26 of 2013) for one employee and one month.
 *
 * Sources: SARS PAYE-GEN-01-G05 Guide for Employers in respect of ETI, revision 17
 * (19 Sept 2025); SARS "ETI changes with effect from 1 April 2025"; BGR (ETI) 47
 * (a weekly or fortnightly employer's month is its employees' tax month);
 * SARS_PAYE_BRS - PAYE Employer Reconciliation V25.3.0, codes 7002–7009.
 *
 * - Qualifying employee: 18–29 at the end of the month (no age limit in a special
 *   economic zone), valid SA ID, employed on or after 1 October 2013, not a domestic
 *   worker, not a connected person, monthly remuneration under the threshold, and paid
 *   at least the minimum wage for the hours worked — all judged per employee per month.
 * - Under 160 hours: remuneration is grossed up to 160 hours to find the amount, which
 *   is then scaled back by hours / 160 (section 7(5)).
 * - 24 qualifying months: the first 12 at the full amount, the next 12 at half.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

export type EtiRuleSet = {
  effectiveFrom: string;
  /** Monthly remuneration must be less than this. */
  threshold: number;
  /** Below this, a percentage of remuneration. */
  lowerBand: number;
  /** From lowerBand up to here, a flat amount; above, tapering to nil at the threshold. */
  flatBandUpper: number;
  firstYear: { rate: number; flat: number; taper: number };
  secondYear: { rate: number; flat: number; taper: number };
  /** Minimum wage for 160 hours where no wage regulating measure applies. */
  fallbackMinimumWage: number;
};

/** In force from 1 April 2025 (SARS guide revision 17, section 11). */
export const ETI_RULES: EtiRuleSet[] = [
  {
    effectiveFrom: '2025-04-01',
    threshold: 7500,
    lowerBand: 2500,
    flatBandUpper: 5500,
    firstYear: { rate: 0.6, flat: 1500, taper: 0.75 },
    secondYear: { rate: 0.3, flat: 750, taper: 0.375 },
    fallbackMinimumWage: 2500,
  },
];

/** National minimum wage per hour (National Minimum Wage Act), by effective date. */
export const NATIONAL_MINIMUM_WAGE_HOURLY: Array<{ effectiveFrom: string; hourly: number }> = [
  { effectiveFrom: '2025-03-01', hourly: 28.79 },
  { effectiveFrom: '2026-03-01', hourly: 30.23 },
];

export const ETI_HOURS_FULL_MONTH = 160;
export const ETI_MAX_QUALIFYING_MONTHS = 24;
export const ETI_EARLIEST_EMPLOYMENT_DATE = '2013-10-01';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export function etiRulesFor(month: string): EtiRuleSet | null {
  const end = monthEnd(month);
  const applicable = ETI_RULES.filter((r) => r.effectiveFrom <= end).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return applicable[applicable.length - 1] ?? null;
}

export function nationalMinimumWageHourly(month: string): number | null {
  const end = monthEnd(month);
  const applicable = NATIONAL_MINIMUM_WAGE_HOURLY.filter((r) => r.effectiveFrom <= end);
  return applicable.length ? applicable[applicable.length - 1].hourly : null;
}

/** Section 7(2)/(3) amount for a full (160-hour) month of remuneration. */
export function etiFullMonthAmount(monthlyRemuneration: number, cycle: 1 | 2, rules: EtiRuleSet): number {
  const r = cycle === 1 ? rules.firstYear : rules.secondYear;
  if (monthlyRemuneration <= 0 || monthlyRemuneration >= rules.threshold) return 0;
  if (monthlyRemuneration < rules.lowerBand) return round2(monthlyRemuneration * r.rate);
  if (monthlyRemuneration < rules.flatBandUpper) return r.flat;
  return round2(Math.max(0, r.flat - r.taper * (monthlyRemuneration - rules.flatBandUpper)));
}

export type EtiEmployeeMonthInput = {
  /** YYYY-MM: the employees' tax month (BGR 47 for weekly / fortnightly payrolls). */
  month: string;
  /** Age on the last day of the month; undefined when unknown. */
  ageAtMonthEnd: number | undefined;
  hasValidSaId: boolean;
  /** Date first employed by this employer (BRS code 3190). */
  employmentDate: string | null;
  /** Special economic zone where the employee mainly works (BRS Appendix E), if any. */
  sezCode: string | null;
  domesticWorker: boolean;
  connectedPerson: boolean;
  /** Cash remuneration paid in the month (non-cash benefits are disregarded). */
  remuneration: number;
  /** Ordinary hours employed and paid in the month. */
  hours: number;
  /** Hourly minimum wage under a wage regulating measure, if higher than the national minimum. */
  wageRegulatingMinimumHourly?: number | null;
  /** Qualifying months already claimed for this employee (this employer and associated institutions). */
  priorQualifyingMonths: number;
};

export type EtiEmployeeMonthResult = {
  qualifies: boolean;
  /** Why not, in plain words; null when the employee qualifies. */
  reason: string | null;
  /** BRS 7005: 0 not qualifying, 1 first 12 months, 2 second 12 months. */
  cycle: 0 | 1 | 2;
  /** BRS 7002: remuneration paid in the month. */
  remunerationPaid: number;
  /** Remuneration grossed up to 160 hours, used to find the amount. */
  monthlyRemuneration160: number;
  /** BRS 7007: hours, reported to a maximum of 160. */
  hoursReported: number;
  /** BRS 7003: hourly minimum wage applied. */
  minimumWageHourly: number;
  /** BRS 7008: hourly wage paid (same rate basis as 7003). */
  wagePaidHourly: number;
  /** BRS 7004: ETI for the month. */
  eti: number;
};

export function calculateEtiForEmployeeMonth(input: EtiEmployeeMonthInput): EtiEmployeeMonthResult {
  const rules = etiRulesFor(input.month);
  const nmw = nationalMinimumWageHourly(input.month) ?? 0;
  const minimumWageHourly = round2(Math.max(nmw, Number(input.wageRegulatingMinimumHourly ?? 0)));
  const hours = Math.max(0, Number(input.hours) || 0);
  const remunerationPaid = round2(Math.max(0, Number(input.remuneration) || 0));
  const hoursReported = Math.round(Math.min(hours, ETI_HOURS_FULL_MONTH) * 10_000) / 10_000;
  const wagePaidHourly = hours > 0 ? round2(remunerationPaid / hours) : 0;
  const monthlyRemuneration160 = hours > 0 && hours < ETI_HOURS_FULL_MONTH
    ? round2(remunerationPaid * (ETI_HOURS_FULL_MONTH / hours))
    : remunerationPaid;
  const base = { remunerationPaid, monthlyRemuneration160, hoursReported, minimumWageHourly, wagePaidHourly };
  const no = (reason: string): EtiEmployeeMonthResult => ({ ...base, qualifies: false, reason, cycle: 0, eti: 0 });

  if (!rules) return no('ETI rules for this month are not in the system (supported from April 2025).');
  if (!input.employmentDate) return no('No employment date.');
  if (input.employmentDate < ETI_EARLIEST_EMPLOYMENT_DATE) return no('Employed before 1 October 2013.');
  if (input.domesticWorker) return no('Domestic workers do not qualify.');
  if (input.connectedPerson) return no('A connected person to the employer does not qualify.');
  if (!input.hasValidSaId) return no('No valid South African ID number.');
  if (!input.sezCode) {
    if (input.ageAtMonthEnd === undefined) return no('Age unknown (no valid ID or date of birth).');
    if (input.ageAtMonthEnd < 18 || input.ageAtMonthEnd >= 30) return no(`Age ${input.ageAtMonthEnd} at month end is outside 18–29.`);
  }
  if (hours <= 0) return no('No hours captured for the month (set the employee\'s ordinary hours).');
  if (remunerationPaid <= 0) return no('No remuneration paid in the month.');
  if (wagePaidHourly < minimumWageHourly) {
    return no(`Paid R${wagePaidHourly.toFixed(2)} an hour, below the minimum wage of R${minimumWageHourly.toFixed(2)}.`);
  }
  if (monthlyRemuneration160 >= rules.threshold) {
    return no(`Monthly remuneration R${monthlyRemuneration160.toFixed(2)} is not below R${rules.threshold.toLocaleString('en-ZA')}.`);
  }
  const prior = Math.max(0, Math.floor(input.priorQualifyingMonths));
  if (prior >= ETI_MAX_QUALIFYING_MONTHS) return no('All 24 qualifying months have been used.');

  const cycle: 1 | 2 = prior < 12 ? 1 : 2;
  const fullMonth = etiFullMonthAmount(monthlyRemuneration160, cycle, rules);
  const eti = hours < ETI_HOURS_FULL_MONTH ? round2(fullMonth * (hours / ETI_HOURS_FULL_MONTH)) : fullMonth;
  return { ...base, qualifies: eti > 0, reason: eti > 0 ? null : 'Calculated ETI is nil.', cycle: eti > 0 ? cycle : 0, eti };
}

/**
 * Ordinary hours paid on one payslip, from weekly ordinary hours: a monthly payslip
 * covers 52/12 weeks, fortnightly 2, weekly 1, scaled for a partial period.
 */
export function payslipOrdinaryHours(hoursPerWeek: number | null | undefined, periodsPerYear: number, proRataFactor = 1): number {
  const weekly = Number(hoursPerWeek) || 0;
  if (weekly <= 0 || periodsPerYear <= 0) return 0;
  return Math.round(weekly * (52 / periodsPerYear) * Math.max(0, Math.min(1, proRataFactor)) * 10_000) / 10_000;
}
