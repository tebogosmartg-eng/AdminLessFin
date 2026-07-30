/**
 * Canonical reporting-period preset resolution.
 * Authority: company Financial Year from Enterprise Financial Calendar.
 * Pure helpers — no React, no persistence.
 */
import {
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  isValid,
  isWithinInterval,
  min as minDate,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import type { FinancialYearDomainModel } from '@/governance/domains/financialCalendar/model';

export type ReportingPeriodPreset =
  | 'current_financial_year'
  | 'previous_financial_year'
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
  current_financial_year: 'Current Financial Year',
  previous_financial_year: 'Previous Financial Year',
  current_quarter: 'Current Quarter',
  previous_quarter: 'Previous Quarter',
  current_month: 'Current Month',
  previous_month: 'Previous Month',
  year_to_date: 'Year-to-Date',
  month_to_date: 'Month-to-Date',
  custom: 'Custom Range',
};

export const REPORTING_PERIOD_PRESET_ORDER: ReportingPeriodPreset[] = [
  'current_financial_year',
  'previous_financial_year',
  'current_quarter',
  'previous_quarter',
  'current_month',
  'previous_month',
  'year_to_date',
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

function previousFinancialYearRange(
  years: FinancialYearDomainModel[],
  activeStart: Date,
  activeEnd: Date,
): ReportingPeriodRange {
  const sorted = [...years].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const activeIdx = sorted.findIndex(
    (y) => y.startDate === toIsoDate(activeStart) || parseIsoDate(y.startDate).getTime() === activeStart.getTime(),
  );
  if (activeIdx > 0) {
    const prev = sorted[activeIdx - 1];
    return { from: parseIsoDate(prev.startDate), to: endOfDay(parseIsoDate(prev.endDate)) };
  }
  const linked = years.find((y) => {
    const end = parseIsoDate(y.endDate);
    return end.getTime() === subDays(activeStart, 1).getTime();
  });
  if (linked) {
    return { from: parseIsoDate(linked.startDate), to: endOfDay(parseIsoDate(linked.endDate)) };
  }
  const spanMs = activeEnd.getTime() - activeStart.getTime();
  const prevEnd = endOfDay(subDays(activeStart, 1));
  const prevStart = startOfDay(new Date(prevEnd.getTime() - spanMs));
  return { from: prevStart, to: prevEnd };
}

export type ResolvePresetInput = {
  preset: ReportingPeriodPreset;
  financialYearStart: Date;
  financialYearEnd: Date;
  years?: FinancialYearDomainModel[];
  customRange?: ReportingPeriodRange | null;
  asOf?: Date;
};

/**
 * Resolve a preset into an inclusive reporting date range.
 * Non-custom presets ignore customRange.
 */
export function resolveReportingPeriodPreset(input: ResolvePresetInput): ReportingPeriodRange {
  const {
    preset,
    financialYearStart,
    financialYearEnd,
    years = [],
    customRange = null,
    asOf = new Date(),
  } = input;

  const fyStart = startOfDay(financialYearStart);
  const fyEnd = endOfDay(financialYearEnd);
  const today = clampToRange(startOfDay(asOf), fyStart, fyEnd);
  const calendarToday = startOfDay(asOf);

  switch (preset) {
    case 'current_financial_year':
      return { from: fyStart, to: fyEnd };

    case 'previous_financial_year':
      return previousFinancialYearRange(years, fyStart, fyEnd);

    case 'current_quarter': {
      const quarters = financialYearQuarters(fyStart, fyEnd);
      const idx = quarterIndexContaining(quarters, calendarToday < fyStart ? fyStart : calendarToday > fyEnd ? fyEnd : calendarToday);
      return quarters[idx];
    }

    case 'previous_quarter': {
      const quarters = financialYearQuarters(fyStart, fyEnd);
      const idx = quarterIndexContaining(quarters, calendarToday < fyStart ? fyStart : calendarToday > fyEnd ? fyEnd : calendarToday);
      if (idx > 0) return quarters[idx - 1];
      const prevFy = previousFinancialYearRange(years, fyStart, fyEnd);
      const prevQuarters = financialYearQuarters(prevFy.from, prevFy.to);
      return prevQuarters[prevQuarters.length - 1];
    }

    case 'current_month': {
      const from = startOfMonth(calendarToday);
      const to = endOfMonth(calendarToday);
      return { from, to };
    }

    case 'previous_month': {
      const prev = subMonths(calendarToday, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }

    case 'year_to_date':
      return { from: fyStart, to: endOfDay(minDate([calendarToday, fyEnd])) };

    case 'month_to_date':
      return {
        from: startOfMonth(calendarToday),
        to: endOfDay(minDate([calendarToday, endOfMonth(calendarToday)])),
      };

    case 'custom':
      if (customRange?.from && customRange?.to) {
        return {
          from: startOfDay(customRange.from),
          to: endOfDay(customRange.to),
        };
      }
      return { from: fyStart, to: fyEnd };

    default:
      return { from: fyStart, to: fyEnd };
  }
}

/** Calendar-year fallback when no Financial Year is configured yet. */
export function calendarYearFallback(asOf: Date = new Date()): ReportingPeriodRange {
  const y = asOf.getFullYear();
  return {
    from: startOfDay(new Date(y, 0, 1)),
    to: endOfDay(new Date(y, 11, 31)),
  };
}
