/**
 * Canonical reporting-period preset resolution.
 * Authority: the financial year SELECTED in the global context (company
 * calendar, financial_years). Pure helpers — no React, no persistence.
 *
 * Every preset resolves to a range INSIDE the selected financial year, or to
 * nothing. The header says which year is on screen; no preset may show figures
 * from another one under it. That is why there is no "previous financial year"
 * preset (choose that year in the switcher instead), why the relative presets
 * anchor to a date clamped into the year, and why "previous quarter" in the
 * first quarter is unavailable rather than quietly reaching into last year.
 */
import {
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  isValid,
  isWithinInterval,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';

export type ReportingPeriodPreset =
  | 'current_financial_year'
  | 'accounting_period'
  | 'current_quarter'
  | 'previous_quarter'
  | 'current_month'
  | 'previous_month'
  | 'year_to_date'
  | 'month_to_date'
  | 'custom';

export type ReportingPeriodRange = {
  from: Date;
  to: Date;
};

export const REPORTING_PERIOD_PRESET_LABELS: Record<ReportingPeriodPreset, string> = {
  current_financial_year: 'Full financial year',
  accounting_period: 'Accounting period',
  current_quarter: 'Current quarter',
  previous_quarter: 'Previous quarter',
  current_month: 'Current month',
  previous_month: 'Previous month',
  year_to_date: 'Year to date',
  month_to_date: 'Month to date',
  custom: 'Custom range',
};

/** What the page-level picker offers. An accounting period is chosen in the header switcher. */
export const REPORTING_PERIOD_PRESET_ORDER: ReportingPeriodPreset[] = [
  'current_financial_year',
  'year_to_date',
  'current_quarter',
  'previous_quarter',
  'current_month',
  'previous_month',
  'month_to_date',
  'custom',
];

export function parseIsoDate(iso: string): Date {
  return startOfDay(parseISO(iso));
}

/**
 * Trust-boundary parser (RB-001). Returns `null` for any value that is not a
 * valid ISO date, so callers' truthiness guards actually hold. `parseISO`
 * returns a *truthy* Invalid Date for malformed input (e.g. "2026-02-30"),
 * which then throws `RangeError: Invalid time value` the moment it reaches
 * `format()`. Every string→Date conversion at a reporting-authority boundary
 * must go through this, never the raw `parseIsoDate`.
 */
export function parseIsoDateSafe(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parsed = parseISO(iso);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function clampToRange(date: Date, from: Date, to: Date): Date {
  if (date < from) return from;
  if (date > to) return to;
  return date;
}

/** Split a financial year into four contiguous quarters (≈3 months each). */
export function financialYearQuarters(fyStart: Date, fyEnd: Date): ReportingPeriodRange[] {
  const start = startOfDay(fyStart);
  const end = endOfDay(fyEnd);
  const quarters: ReportingPeriodRange[] = [];
  let cursor = start;
  for (let i = 0; i < 4; i++) {
    if (i === 3) {
      quarters.push({ from: cursor, to: end });
      break;
    }
    const nextStart = startOfDay(addMonths(cursor, 3));
    const qEnd = endOfDay(subDays(nextStart, 1));
    quarters.push({ from: cursor, to: qEnd > end ? end : qEnd });
    cursor = nextStart;
    if (cursor > end) break;
  }
  while (quarters.length < 4) {
    const last = quarters[quarters.length - 1];
    quarters.push(last ? { ...last } : { from: start, to: end });
  }
  return quarters;
}

function quarterIndexContaining(quarters: ReportingPeriodRange[], asOf: Date): number {
  const idx = quarters.findIndex((q) =>
    isWithinInterval(asOf, { start: q.from, end: q.to }),
  );
  if (idx >= 0) return idx;
  if (asOf < quarters[0].from) return 0;
  return quarters.length - 1;
}

/** The part of `range` inside the year, or null when they do not meet. */
function withinYear(range: ReportingPeriodRange, fyStart: Date, fyEnd: Date): ReportingPeriodRange | null {
  const from = maxDate([startOfDay(range.from), fyStart]);
  const to = minDate([endOfDay(range.to), fyEnd]);
  return from <= to ? { from, to } : null;
}

export type ResolvePresetInput = {
  preset: ReportingPeriodPreset;
  financialYearStart: Date;
  financialYearEnd: Date;
  customRange?: ReportingPeriodRange | null;
  /** The accounting period chosen in the header, for the 'accounting_period' preset. */
  accountingPeriod?: { startDate: string; endDate: string } | null;
  asOf?: Date;
};

/**
 * The range a preset covers inside the selected financial year, or null when
 * it has none there (e.g. "previous month" in the year's first month, or an
 * accounting period from another year).
 *
 * Relative presets ("current month", "year to date") anchor to today when
 * today is inside the year; for a past year they anchor to its last day, and
 * for a future year to its first. So "current month" while viewing FY2025
 * is the last month of FY2025, never a month of FY2026.
 */
export function presetRange(input: ResolvePresetInput): ReportingPeriodRange | null {
  const {
    preset,
    financialYearStart,
    financialYearEnd,
    customRange = null,
    accountingPeriod = null,
    asOf = new Date(),
  } = input;

  const fyStart = startOfDay(financialYearStart);
  const fyEnd = endOfDay(financialYearEnd);
  const anchor = clampToRange(startOfDay(asOf), fyStart, startOfDay(fyEnd));

  switch (preset) {
    case 'current_financial_year':
      return { from: fyStart, to: fyEnd };

    case 'accounting_period': {
      const from = parseIsoDateSafe(accountingPeriod?.startDate);
      const to = parseIsoDateSafe(accountingPeriod?.endDate);
      if (!from || !to) return null;
      return withinYear({ from, to }, fyStart, fyEnd);
    }

    case 'current_quarter': {
      const quarters = financialYearQuarters(fyStart, fyEnd);
      return quarters[quarterIndexContaining(quarters, anchor)];
    }

    case 'previous_quarter': {
      const quarters = financialYearQuarters(fyStart, fyEnd);
      const idx = quarterIndexContaining(quarters, anchor);
      return idx > 0 ? quarters[idx - 1] : null;
    }

    case 'current_month':
      return withinYear({ from: startOfMonth(anchor), to: endOfMonth(anchor) }, fyStart, fyEnd);

    case 'previous_month': {
      const prev = subMonths(startOfMonth(anchor), 1);
      return withinYear({ from: startOfMonth(prev), to: endOfMonth(prev) }, fyStart, fyEnd);
    }

    case 'year_to_date':
      return { from: fyStart, to: endOfDay(anchor) };

    case 'month_to_date':
      return withinYear({ from: startOfMonth(anchor), to: endOfDay(anchor) }, fyStart, fyEnd);

    case 'custom':
      if (customRange?.from && customRange?.to) {
        return withinYear(customRange, fyStart, fyEnd);
      }
      return { from: fyStart, to: fyEnd };

    default:
      return { from: fyStart, to: fyEnd };
  }
}

/**
 * Resolve a preset into an inclusive reporting date range inside the year.
 * A preset with no range in the year resolves to the full year, so a caller
 * always gets the selected year's figures, never another year's.
 */
export function resolveReportingPeriodPreset(input: ResolvePresetInput): ReportingPeriodRange {
  return presetRange(input) ?? {
    from: startOfDay(input.financialYearStart),
    to: endOfDay(input.financialYearEnd),
  };
}

/** Calendar-year fallback when no Financial Year is configured yet. */
export function calendarYearFallback(asOf: Date = new Date()): ReportingPeriodRange {
  const y = asOf.getFullYear();
  return {
    from: startOfDay(new Date(y, 0, 1)),
    to: endOfDay(new Date(y, 11, 31)),
  };
}
