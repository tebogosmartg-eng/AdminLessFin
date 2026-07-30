/**
 * G3.6D / V3.6.10 — Financial Statements consumes Enterprise Financial Calendar years.
 * Financial Calendar is MASTER. Financial Statements never invents years or FY labels.
 *
 * Display rule: every FY label/date comes from `financial_years` (via ReportingPeriodContext
 * / financialCalendarService). Frozen `efs_reporting_periods.label` is never a display SoT.
 *
 * Historical integrity (V3.6.11): sealed workspaces keep their linked `financial_year_id`.
 * Changing the Current Financial Year in Settings must never rebind published/archived
 * engagements to a different calendar year. Artefacts (PDF/review/publication) are DB-immutable.
 */
import { format, parseISO } from 'date-fns';
import type { FinancialYearDomainModel } from '@/governance/domains/financialCalendar/model';
import type { EfsWorkspaceListItem } from './api';
import {
  reportingPeriodCoverTitle,
  reportingPeriodLabel,
} from './publication/reportingPeriodFormatter';

/**
 * Workspace statuses that must NOT auto-bind unbound periods to the active open FY.
 * Must stay aligned with `reconcileReportingPeriodWithCalendar` in financial-statements edge.
 */
export const SEALED_ENGAGEMENT_WORKSPACE_STATUSES = [
  'published',
  'certified',
  'closed',
  'locked',
  'archived',
] as const;

export function isSealedEngagementWorkspaceStatus(
  status: string | null | undefined,
): boolean {
  return SEALED_ENGAGEMENT_WORKSPACE_STATUSES.includes(
    String(status || '') as (typeof SEALED_ENGAGEMENT_WORKSPACE_STATUSES)[number],
  );
}

export type CalendarBoundReportingPeriod = {
  financial_year_id: string;
  period_key: string;
  label: string;
  start_date: string;
  end_date: string;
};

export type EngagementPeriodLike = {
  id?: string;
  financial_year_id?: string | null;
  period_key?: string | null;
  label?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  calendar_bound?: boolean;
};

export type ResolvedEngagementPeriod = {
  /** Calendar year when bound; null = unbound legacy snapshot. */
  calendarYear: FinancialYearDomainModel | null;
  /** Display title e.g. "FY2027 · 01 Mar 2026 – 28 Feb 2027" */
  displayLabel: string;
  /** Short code e.g. FY2027 */
  yearCode: string | null;
  startDate: string | null;
  endDate: string | null;
  coverTitle: string;
  reportingLabel: string;
  /** True when explicitly linked via financial_year_id to a live calendar year. */
  isCanonical: boolean;
  /** True when engagement FY differs from the company's active FY. */
  isHistorical: boolean;
  /**
   * True when financial_year_id is null or the linked year cannot be resolved.
   * Requires explicit migration — never auto-bound.
   */
  isLegacyUnbound: boolean;
};

/** True when the engagement period is not explicitly linked to a resolvable calendar year. */
export function isLegacyUnboundEngagement(
  period: EngagementPeriodLike | null | undefined,
  years: FinancialYearDomainModel[],
): boolean {
  if (!period) return true;
  if (!period.financial_year_id) return true;
  return !years.some((y) => y.id === period.financial_year_id);
}

/** Human date range for legacy engagement cards (period dates only). */
export function formatLegacyEngagementDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string | null {
  if (!startDate || !endDate) return null;
  try {
    return `${format(parseISO(startDate), 'dd MMM yyyy')} – ${format(parseISO(endDate), 'dd MMM yyyy')}`;
  } catch {
    return `${startDate} – ${endDate}`;
  }
}

/**
 * Suggested year_code when creating a matching historical Financial Year.
 * Matches Enterprise Calendar convention: FY + calendar year of end_date.
 */
export function suggestedHistoricalYearCode(endDate: string): string {
  return `FY${endDate.slice(0, 4)}`;
}

/** Suggest an existing calendar year whose dates match the engagement period. */
export function suggestCalendarYearByDates(
  period: EngagementPeriodLike | null | undefined,
  years: FinancialYearDomainModel[],
): FinancialYearDomainModel | null {
  if (!period?.start_date || !period?.end_date) return null;
  return (
    years.find(
      (y) => y.startDate === period.start_date && y.endDate === period.end_date,
    ) || null
  );
}

/** Map a calendar year into an EFS reporting-period payload (consume, do not invent). */
export function reportingPeriodFromCalendarYear(
  year: FinancialYearDomainModel,
): CalendarBoundReportingPeriod {
  return {
    financial_year_id: year.id,
    period_key: year.yearCode,
    label: year.yearCode,
    start_date: year.startDate,
    end_date: year.endDate,
  };
}

/** Human-readable Financial Year from calendar dates — never free-form legacy labels. */
export function formatCalendarYearDisplay(year: FinancialYearDomainModel): string {
  try {
    const from = format(parseISO(year.startDate), 'dd MMM yyyy');
    const to = format(parseISO(year.endDate), 'dd MMM yyyy');
    return `${year.yearCode} · ${from} – ${to}`;
  } catch {
    return `${year.yearCode} · ${year.startDate} – ${year.endDate}`;
  }
}

export function formatCalendarYearRange(year: FinancialYearDomainModel): string {
  try {
    return `${format(parseISO(year.startDate), 'dd MMM yyyy')} – ${format(parseISO(year.endDate), 'dd MMM yyyy')}`;
  } catch {
    return `${year.startDate} – ${year.endDate}`;
  }
}

export function periodMatchesCalendarYear(
  period: {
    financial_year_id?: string | null;
    period_key?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null | undefined,
  year: FinancialYearDomainModel,
): boolean {
  if (!period) return false;
  if (period.financial_year_id && period.financial_year_id === year.id) return true;
  if (period.period_key && period.period_key === year.yearCode) return true;
  return period.start_date === year.startDate && period.end_date === year.endDate;
}

/**
 * Resolve explicitly linked calendar year (financial_year_id only).
 * Date matches are suggestions for migration — they do not imply a bind.
 */
export function resolveLinkedCalendarYear(
  period: EngagementPeriodLike | null | undefined,
  years: FinancialYearDomainModel[],
): FinancialYearDomainModel | null {
  if (!period?.financial_year_id || years.length === 0) return null;
  return years.find((y) => y.id === period.financial_year_id) || null;
}

/** @deprecated Prefer resolveLinkedCalendarYear; date fallback is suggestion-only. */
export function resolveCalendarYearFromPeriod(
  period: EngagementPeriodLike | null | undefined,
  years: FinancialYearDomainModel[],
): FinancialYearDomainModel | null {
  const linked = resolveLinkedCalendarYear(period, years);
  if (linked) return linked;
  return suggestCalendarYearByDates(period, years);
}

/**
 * Canonical display resolution for any AFS surface.
 * Never returns frozen slash labels like "Financial Year 2025/26".
 * Canonical only when financial_year_id links to a live calendar year.
 */
export function resolveEngagementReportingPeriod(
  period: EngagementPeriodLike | null | undefined,
  years: FinancialYearDomainModel[],
  activeFinancialYear: FinancialYearDomainModel | null = null,
): ResolvedEngagementPeriod {
  const linkedYear = resolveLinkedCalendarYear(period, years);
  const legacyUnbound = isLegacyUnboundEngagement(period, years);

  if (linkedYear && !legacyUnbound) {
    return {
      calendarYear: linkedYear,
      displayLabel: formatCalendarYearDisplay(linkedYear),
      yearCode: linkedYear.yearCode,
      startDate: linkedYear.startDate,
      endDate: linkedYear.endDate,
      coverTitle: reportingPeriodCoverTitle(linkedYear.endDate),
      reportingLabel: reportingPeriodLabel(linkedYear.endDate),
      isCanonical: true,
      isHistorical: !!(
        activeFinancialYear && activeFinancialYear.id !== linkedYear.id
      ),
      isLegacyUnbound: false,
    };
  }

  // Legacy unbound — period dates only; never promote frozen label as FY identity.
  const start = period?.start_date ?? null;
  const end = period?.end_date ?? null;
  const range = formatLegacyEngagementDateRange(start, end);

  return {
    calendarYear: null,
    displayLabel: range
      ? `Legacy Financial Statement Engagement · ${range}`
      : 'Legacy Financial Statement Engagement',
    yearCode: null,
    startDate: start,
    endDate: end,
    coverTitle: reportingPeriodCoverTitle(end),
    reportingLabel: reportingPeriodLabel(end),
    isCanonical: false,
    isHistorical: true,
    isLegacyUnbound: true,
  };
}

/** Overlay document/model period fields from calendar when resolvable. */
export function canonicalPeriodFieldsForDocument(
  period: EngagementPeriodLike | null | undefined,
  years: FinancialYearDomainModel[],
): {
  label: string;
  period_key: string;
  start_date: string;
  end_date: string;
  financial_year_id?: string;
} | null {
  if (!period) return null;
  const resolved = resolveEngagementReportingPeriod(period, years);
  if (resolved.calendarYear) {
    const p = reportingPeriodFromCalendarYear(resolved.calendarYear);
    return {
      label: p.label,
      period_key: p.period_key,
      start_date: p.start_date,
      end_date: p.end_date,
      financial_year_id: p.financial_year_id,
    };
  }
  if (!period.start_date || !period.end_date) return null;
  return {
    label: resolved.displayLabel,
    period_key: period.period_key || 'UNBOUND',
    start_date: period.start_date,
    end_date: period.end_date,
    financial_year_id: period.financial_year_id ?? undefined,
  };
}

export function findEngagementForCalendarYear(
  workspaces: EfsWorkspaceListItem[],
  year: FinancialYearDomainModel,
): EfsWorkspaceListItem | undefined {
  return workspaces.find((ws) => periodMatchesCalendarYear(ws.efs_reporting_periods, year));
}

/** Financial years that do not yet have an AFS engagement. */
export function availableCalendarYearsForEngagement(
  years: FinancialYearDomainModel[],
  workspaces: EfsWorkspaceListItem[],
): FinancialYearDomainModel[] {
  return years.filter((year) => !findEngagementForCalendarYear(workspaces, year));
}

/** Resolve display Financial Year from calendar (explicit link only). */
export function resolveCalendarYearForWorkspace(
  workspace: EfsWorkspaceListItem,
  years: FinancialYearDomainModel[],
): FinancialYearDomainModel | null {
  return resolveLinkedCalendarYear(workspace.efs_reporting_periods, years);
}

const LEGACY_KEEP_PREFIX = 'efs_legacy_keep:';

export function isLegacyKeepAcknowledged(periodId: string | null | undefined): boolean {
  if (!periodId || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${LEGACY_KEEP_PREFIX}${periodId}`) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeLegacyKeep(periodId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${LEGACY_KEEP_PREFIX}${periodId}`, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLegacyKeepAcknowledgement(periodId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(`${LEGACY_KEEP_PREFIX}${periodId}`);
  } catch {
    /* ignore */
  }
}

/** Prior calendar year for comparative disclosure, when present. */
export function priorCalendarYear(
  year: FinancialYearDomainModel,
  years: FinancialYearDomainModel[],
): FinancialYearDomainModel | null {
  if (year.previousFinancialYearId) {
    return years.find((y) => y.id === year.previousFinancialYearId) || null;
  }
  const priorByEnd = years
    .filter((y) => y.endDate < year.startDate)
    .sort((a, b) => (a.endDate < b.endDate ? 1 : -1));
  return priorByEnd[0] || null;
}
