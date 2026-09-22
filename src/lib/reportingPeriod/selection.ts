/**
 * The year and period a user has chosen to work in, for one company.
 *
 * The choice is remembered per tab (sessionStorage), per user and per company:
 * a refresh keeps it, switching back to a company restores it, a new tab or a
 * new sign-in starts at the current year. It is only ever a request. Before it
 * is used it is checked against the company's own calendar, so a stored year
 * that no longer exists (or belongs to another company) falls back to the
 * current year rather than being trusted.
 */
import { format } from 'date-fns';
import type {
  AccountingPeriodDomainModel,
  FinancialYearDomainModel,
} from '@/governance/domains/financialCalendar/model';
import { calendarContextFromYears } from '@/lib/enterpriseMasterData/calendar';
import {
  REPORTING_PERIOD_PRESET_LABELS,
  parseIsoDateSafe,
  type ReportingPeriodPreset,
  type ReportingPeriodRange,
} from './presets';

export type StoredSelection = {
  yearId: string | null;
  preset: ReportingPeriodPreset;
  periodId: string | null;
  customFrom: string | null;
  customTo: string | null;
};

export const DEFAULT_SELECTION: StoredSelection = {
  yearId: null,
  preset: 'current_financial_year',
  periodId: null,
  customFrom: null,
  customTo: null,
};

const PREFIX = 'adminless.context.v1';

export function selectionStorageKey(userId: string, companyId: string): string {
  return `${PREFIX}.${userId}.${companyId}`;
}

const PRESETS = new Set<string>(Object.keys(REPORTING_PERIOD_PRESET_LABELS));

export function readSelection(key: string | null): StoredSelection | null {
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSelection>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      yearId: typeof parsed.yearId === 'string' ? parsed.yearId : null,
      preset: typeof parsed.preset === 'string' && PRESETS.has(parsed.preset)
        ? parsed.preset as ReportingPeriodPreset
        : 'current_financial_year',
      periodId: typeof parsed.periodId === 'string' ? parsed.periodId : null,
      customFrom: typeof parsed.customFrom === 'string' ? parsed.customFrom : null,
      customTo: typeof parsed.customTo === 'string' ? parsed.customTo : null,
    };
  } catch {
    return null;
  }
}

export function writeSelection(key: string | null, selection: StoredSelection): void {
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(selection));
  } catch {
    // Storage unavailable (private window, quota): the choice just isn't remembered.
  }
}

/** Forget every remembered choice in this tab (sign-out, or a different user signing in). */
export function clearStoredSelections(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // nothing to clear
  }
}

/**
 * The year to show: the requested one if it is one of this company's years,
 * otherwise the current year (financial_year_current(), carried on the row as
 * isCurrent). Never a year the company does not have.
 */
export function resolveSelectedYear(
  years: FinancialYearDomainModel[],
  requestedYearId: string | null | undefined,
): FinancialYearDomainModel | null {
  if (requestedYearId) {
    const requested = years.find((y) => y.id === requestedYearId);
    if (requested) return requested;
  }
  return calendarContextFromYears(years).activeYear;
}

/** The chosen accounting period, only if it belongs to the selected year. */
export function resolveSelectedPeriod(
  periods: AccountingPeriodDomainModel[],
  year: FinancialYearDomainModel | null,
  periodId: string | null | undefined,
): AccountingPeriodDomainModel | null {
  if (!year || !periodId) return null;
  return periods.find((p) => p.id === periodId && p.financialYearId === year.id) ?? null;
}

/** The periods of one year, in order. */
export function periodsOfYear(
  periods: AccountingPeriodDomainModel[],
  year: FinancialYearDomainModel | null,
): AccountingPeriodDomainModel[] {
  if (!year) return [];
  return periods
    .filter((p) => p.financialYearId === year.id)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** "01 Mar 2026 – 28 Feb 2027" */
export function formatYearRange(year: Pick<FinancialYearDomainModel, 'startDate' | 'endDate'>): string {
  const from = parseIsoDateSafe(year.startDate);
  const to = parseIsoDateSafe(year.endDate);
  if (!from || !to) return `${year.startDate} – ${year.endDate}`;
  return `${format(from, 'dd MMM yyyy')} – ${format(to, 'dd MMM yyyy')}`;
}

/** "September 2026" — or the exact dates when a period is not a whole calendar month. */
export function formatPeriodName(period: Pick<AccountingPeriodDomainModel, 'startDate' | 'endDate'>): string {
  const from = parseIsoDateSafe(period.startDate);
  const to = parseIsoDateSafe(period.endDate);
  if (!from || !to) return `${period.startDate} – ${period.endDate}`;
  const wholeMonth =
    from.getDate() === 1 &&
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear() &&
    to.getDate() === new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  return wholeMonth ? format(from, 'MMMM yyyy') : `${format(from, 'dd MMM')} – ${format(to, 'dd MMM yyyy')}`;
}

/** What the reporting range is, in words: "Full year", "September 2026", "Q2 · Jun – Aug 2026". */
export function describeReportingRange(
  preset: ReportingPeriodPreset,
  range: ReportingPeriodRange | null,
  period: AccountingPeriodDomainModel | null,
): string {
  if (!range) return '—';
  if (preset === 'current_financial_year') return 'Full year';
  if (preset === 'accounting_period' && period) return formatPeriodName(period);
  const span = `${format(range.from, 'dd MMM')} – ${format(range.to, 'dd MMM yyyy')}`;
  if (preset === 'custom') return `Custom · ${span}`;
  return `${REPORTING_PERIOD_PRESET_LABELS[preset]} · ${span}`;
}
