import { describe, expect, it } from 'vitest';
import {
  formatCalendarYearDisplay,
  isSealedEngagementWorkspaceStatus,
  reportingPeriodFromCalendarYear,
  resolveCalendarYearFromPeriod,
  resolveEngagementReportingPeriod,
  SEALED_ENGAGEMENT_WORKSPACE_STATUSES,
} from '../../src/lib/financialStatements/calendarYearBinding';
import type { FinancialYearDomainModel } from '../../src/governance/domains/financialCalendar/model';

const fyMarFeb: FinancialYearDomainModel = {
  id: 'fy-2027',
  companyId: 'co-1',
  yearCode: 'FY2027',
  startDate: '2026-03-01',
  endDate: '2027-02-28',
  status: 'open',
  previousFinancialYearId: null,
  createdAt: null,
};

const fyLegacyMar: FinancialYearDomainModel = {
  id: 'fy-2026-legacy',
  companyId: 'co-1',
  yearCode: 'FY2026',
  startDate: '2025-04-01',
  endDate: '2026-03-31',
  status: 'open',
  previousFinancialYearId: null,
  createdAt: null,
};

const fyNext: FinancialYearDomainModel = {
  id: 'fy-2028',
  companyId: 'co-1',
  yearCode: 'FY2028',
  startDate: '2027-03-01',
  endDate: '2028-02-29',
  status: 'open',
  previousFinancialYearId: 'fy-2027',
  createdAt: null,
};

describe('AFS calendar year binding (no legacy FY labels)', () => {
  it('maps calendar year to EFS period payload without inventing slash labels', () => {
    expect(reportingPeriodFromCalendarYear(fyMarFeb)).toEqual({
      financial_year_id: 'fy-2027',
      period_key: 'FY2027',
      label: 'FY2027',
      start_date: '2026-03-01',
      end_date: '2027-02-28',
    });
  });

  it('resolves by financial_year_id before frozen label', () => {
    const period = {
      financial_year_id: 'fy-2027',
      label: 'Financial Year 2025/26',
      period_key: 'FY2025-26',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    };
    expect(resolveCalendarYearFromPeriod(period, [fyMarFeb, fyLegacyMar])?.id).toBe('fy-2027');
  });

  it('never promotes frozen "Financial Year 2025/26" as display identity', () => {
    const period = {
      label: 'Financial Year 2025/26',
      period_key: 'FY2025-26',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    };
    const resolved = resolveEngagementReportingPeriod(period, [fyMarFeb], fyMarFeb);
    expect(resolved.displayLabel).not.toContain('Financial Year 2025/26');
    expect(resolved.displayLabel).toContain('Legacy Financial Statement Engagement');
    expect(resolved.isCanonical).toBe(false);
    expect(resolved.isLegacyUnbound).toBe(true);
    expect(resolved.coverTitle).toBe('FOR THE YEAR ENDED 31 MARCH 2026');
  });

  it('does not treat date-only match as canonical (requires explicit financial_year_id)', () => {
    const period = {
      start_date: fyLegacyMar.startDate,
      end_date: fyLegacyMar.endDate,
      label: 'Financial Year 2025/26',
    };
    const resolved = resolveEngagementReportingPeriod(
      period,
      [fyLegacyMar, fyMarFeb],
      fyMarFeb,
    );
    expect(resolved.isLegacyUnbound).toBe(true);
    expect(resolved.isCanonical).toBe(false);
    expect(resolved.yearCode).toBeNull();
  });

  it('formats cover title from calendar end date when bound', () => {
    const period = reportingPeriodFromCalendarYear(fyMarFeb);
    const resolved = resolveEngagementReportingPeriod(period, [fyMarFeb], fyMarFeb);
    expect(resolved.displayLabel).toBe(formatCalendarYearDisplay(fyMarFeb));
    expect(resolved.coverTitle).toBe('FOR THE YEAR ENDED 28 FEBRUARY 2027');
    expect(resolved.isHistorical).toBe(false);
    expect(resolved.isCanonical).toBe(true);
  });

  it('marks engagement historical when FY differs from active calendar year', () => {
    const period = reportingPeriodFromCalendarYear(fyLegacyMar);
    const resolved = resolveEngagementReportingPeriod(period, [fyMarFeb, fyLegacyMar], fyMarFeb);
    expect(resolved.isHistorical).toBe(true);
    expect(resolved.yearCode).toBe('FY2026');
  });
});

describe('Historical engagement integrity (V3.6.11)', () => {
  it('treats published and archived as sealed (no active-FY auto-rebind)', () => {
    expect(SEALED_ENGAGEMENT_WORKSPACE_STATUSES).toEqual([
      'published',
      'certified',
      'closed',
      'locked',
      'archived',
    ]);
    expect(isSealedEngagementWorkspaceStatus('published')).toBe(true);
    expect(isSealedEngagementWorkspaceStatus('archived')).toBe(true);
    expect(isSealedEngagementWorkspaceStatus('opened')).toBe(false);
    expect(isSealedEngagementWorkspaceStatus('in_review')).toBe(false);
    expect(isSealedEngagementWorkspaceStatus('approved')).toBe(false);
  });

  it('Phase 5: published engagement keeps linked FY after Current FY changes', () => {
    const publishedPeriod = reportingPeriodFromCalendarYear(fyMarFeb);
    const years = [fyMarFeb, fyNext];

    // Create / draft under FY2027
    const whileDraft = resolveEngagementReportingPeriod(publishedPeriod, years, fyMarFeb);
    expect(whileDraft.yearCode).toBe('FY2027');
    expect(whileDraft.isHistorical).toBe(false);
    expect(whileDraft.coverTitle).toBe('FOR THE YEAR ENDED 28 FEBRUARY 2027');

    // Current Financial Year in Settings advances to FY2028
    const afterActiveYearChange = resolveEngagementReportingPeriod(
      publishedPeriod,
      years,
      fyNext,
    );
    expect(afterActiveYearChange.yearCode).toBe('FY2027');
    expect(afterActiveYearChange.calendarYear?.id).toBe('fy-2027');
    expect(afterActiveYearChange.isHistorical).toBe(true);
    expect(afterActiveYearChange.coverTitle).toBe('FOR THE YEAR ENDED 28 FEBRUARY 2027');
    expect(afterActiveYearChange.displayLabel).toBe(formatCalendarYearDisplay(fyMarFeb));
  });

  it('Phase 5: new draft engagement follows the active Financial Calendar', () => {
    const draftOnActive = reportingPeriodFromCalendarYear(fyNext);
    const resolved = resolveEngagementReportingPeriod(
      draftOnActive,
      [fyMarFeb, fyNext],
      fyNext,
    );
    expect(resolved.yearCode).toBe('FY2028');
    expect(resolved.isHistorical).toBe(false);
    expect(resolved.isCanonical).toBe(true);
    expect(resolved.coverTitle).toBe('FOR THE YEAR ENDED 29 FEBRUARY 2028');
  });

  it('Phase 5: archived engagement remains historically fixed', () => {
    const archivedPeriod = reportingPeriodFromCalendarYear(fyLegacyMar);
    const resolved = resolveEngagementReportingPeriod(
      archivedPeriod,
      [fyLegacyMar, fyMarFeb, fyNext],
      fyNext,
    );
    expect(isSealedEngagementWorkspaceStatus('archived')).toBe(true);
    expect(resolved.yearCode).toBe('FY2026');
    expect(resolved.isHistorical).toBe(true);
    expect(resolved.coverTitle).toBe('FOR THE YEAR ENDED 31 MARCH 2026');
  });
});
