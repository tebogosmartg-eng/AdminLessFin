/**
 * SARS employer deadlines (EMP201 monthly, EMP501 interim and annual) for a year of
 * assessment. The year of assessment runs 1 March to the end of February and is named
 * by the year it ends in (YoA 2027 = March 2026 to February 2027).
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

export type Emp501Kind = 'interim' | 'annual';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Year of assessment a month (YYYY-MM) falls in: March 2026 → 2027. */
export function yearOfAssessmentFor(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return m >= 3 ? y + 1 : y;
}

/** The twelve months of a year of assessment, March first. */
export function monthsOfYear(yearOfAssessment: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const monthIndex = (2 + i) % 12; // 0-based: March = 2
    const year = i < 10 ? yearOfAssessment - 1 : yearOfAssessment;
    return `${year}-${pad(monthIndex + 1)}`;
  });
}

/** Months an EMP501 covers: interim March–August, annual March–February. */
export function monthsOfReconciliation(yearOfAssessment: number, kind: Emp501Kind): string[] {
  const months = monthsOfYear(yearOfAssessment);
  return kind === 'interim' ? months.slice(0, 6) : months;
}

/** SARS reconciliation period code (CCYYMM): interim = August of the first year, annual = February. */
export function reconciliationPeriod(yearOfAssessment: number, kind: Emp501Kind): string {
  return kind === 'interim' ? `${yearOfAssessment - 1}08` : `${yearOfAssessment}02`;
}

/** The last business day on or before a date (weekends and the given public holidays skipped). */
export function lastBusinessDayOnOrBefore(date: string, holidays: ReadonlySet<string>): string {
  const d = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i < 10; i += 1) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(iso(d))) return iso(d);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return iso(d);
}

/**
 * EMP201 due date: the 7th of the following month; when that is not a business day,
 * the last business day before it (Fourth Schedule para 2).
 */
export function emp201DueDate(month: string, holidays: ReadonlySet<string> = new Set()): string {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  return lastBusinessDayOnOrBefore(`${next}-07`, holidays);
}

/**
 * EMP501 submission window as SARS usually sets it: interim 1 September – 31 October,
 * annual 1 April – 31 May. SARS announces the exact window each season.
 */
export function emp501Window(yearOfAssessment: number, kind: Emp501Kind): { opens: string; due: string } {
  return kind === 'interim'
    ? { opens: `${yearOfAssessment - 1}-09-01`, due: `${yearOfAssessment - 1}-10-31` }
    : { opens: `${yearOfAssessment}-04-01`, due: `${yearOfAssessment}-05-31` };
}

export type MonthFilingState =
  | 'no_payroll'
  | 'not_filed'
  | 'filed'
  | 'approved'
  | 'submitted'
  | 'paid'
  | 'underpaid'
  | 'overpaid';

/**
 * Where a month stands. "paid" means the payments recorded equal the amount payable;
 * a nil return with nothing payable counts as paid once it is submitted.
 */
export function monthFilingState(input: {
  hasFinalisedPayroll: boolean;
  filed: { approved: boolean; submitted: boolean; totalPayable: number } | null;
  paid: number;
}): MonthFilingState {
  const { filed, paid } = input;
  if (!filed) return input.hasFinalisedPayroll ? 'not_filed' : 'no_payroll';
  const due = Math.round(filed.totalPayable * 100);
  const cents = Math.round(paid * 100);
  if (cents > due) return 'overpaid';
  if (filed.submitted && cents === due) return 'paid';
  if (cents > 0) return 'underpaid';
  if (filed.submitted) return due === 0 ? 'paid' : 'submitted';
  return filed.approved ? 'approved' : 'filed';
}

/** True when the month still needs action and its due date has passed. */
export function isOverdue(state: MonthFilingState, dueDate: string, today: string): boolean {
  return today > dueDate && ['not_filed', 'filed', 'approved', 'submitted', 'underpaid'].includes(state);
}
