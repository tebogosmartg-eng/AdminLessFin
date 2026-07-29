/**
 * G3.6D — Financial Statements consumes Enterprise Financial Calendar years.
 * Financial Calendar is MASTER. Financial Statements never invents years.
 */
import type { FinancialYearDomainModel } from '@/governance/domains/financialCalendar/model';
import type { EfsWorkspaceListItem } from './api';

export type CalendarBoundReportingPeriod = {
  financial_year_id: string;
  period_key: string;
  label: string;
  start_date: string;
  end_date: string;
};

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

export function periodMatchesCalendarYear(
  period: {
    period_key?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null | undefined,
  year: FinancialYearDomainModel,
): boolean {
  if (!period) return false;
  if (period.period_key && period.period_key === year.yearCode) return true;
  return period.start_date === year.startDate && period.end_date === year.endDate;
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

/** Resolve display Financial Year from calendar (never synthesize FY labels). */
export function resolveCalendarYearForWorkspace(
  workspace: EfsWorkspaceListItem,
  years: FinancialYearDomainModel[],
): FinancialYearDomainModel | null {
  const period = workspace.efs_reporting_periods;
  if (!period) return null;
  return (
    years.find((y) => periodMatchesCalendarYear(period, y)) ||
    null
  );
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
