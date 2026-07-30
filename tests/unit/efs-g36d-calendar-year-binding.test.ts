import { describe, expect, it } from 'vitest';
import type { FinancialYearDomainModel } from '@/governance/domains/financialCalendar/model';
import type { EfsWorkspaceListItem } from '@/lib/financialStatements/api';
import {
  availableCalendarYearsForEngagement,
  findEngagementForCalendarYear,
  priorCalendarYear,
  reportingPeriodFromCalendarYear,
  resolveCalendarYearForWorkspace,
} from '@/lib/financialStatements/calendarYearBinding';

function year(
  partial: Partial<FinancialYearDomainModel> & Pick<FinancialYearDomainModel, 'id' | 'yearCode' | 'startDate' | 'endDate'>,
): FinancialYearDomainModel {
  return {
    companyId: 'co-1',
    status: 'open',
    previousFinancialYearId: null,
    createdAt: null,
    ...partial,
  };
}

function workspace(
  period: { period_key: string; label: string; start_date: string; end_date: string },
): EfsWorkspaceListItem {
  return {
    id: `ws-${period.period_key}`,
    name: `${period.label} AFS`,
    status: 'opened',
    progress_pct: 10,
    updated_at: '2026-07-26T00:00:00Z',
    efs_reporting_periods: {
      id: `rp-${period.period_key}`,
      period_key: period.period_key,
      label: period.label,
      start_date: period.start_date,
      end_date: period.end_date,
      status: 'open_for_reporting',
    },
  };
}

describe('G3.6D calendar year binding (FS consumer)', () => {
  const y2425 = year({
    id: 'fy-2425',
    yearCode: '2024/25',
    startDate: '2024-03-01',
    endDate: '2025-02-28',
    status: 'closed',
  });
  const y2526 = year({
    id: 'fy-2526',
    yearCode: '2025/26',
    startDate: '2025-03-01',
    endDate: '2026-02-28',
    status: 'open',
    previousFinancialYearId: 'fy-2425',
  });
  const y2627 = year({
    id: 'fy-2627',
    yearCode: '2026/27',
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    status: 'draft',
    previousFinancialYearId: 'fy-2526',
  });

  it('maps period identity from calendar year only (no invented FY labels)', () => {
    expect(reportingPeriodFromCalendarYear(y2526)).toEqual({
      financial_year_id: 'fy-2526',
      period_key: '2025/26',
      label: '2025/26',
      start_date: '2025-03-01',
      end_date: '2026-02-28',
    });
  });

  it('hides Financial Years that already have an engagement', () => {
    const workspaces = [
      workspace({
        period_key: '2025/26',
        label: '2025/26',
        start_date: '2025-03-01',
        end_date: '2026-02-28',
      }),
    ];
    const available = availableCalendarYearsForEngagement([y2425, y2526, y2627], workspaces);
    expect(available.map((y) => y.yearCode)).toEqual(['2024/25', '2026/27']);
    expect(findEngagementForCalendarYear(workspaces, y2526)?.id).toBe('ws-2025/26');
  });

  it('resolves list display year only when explicitly linked', () => {
    const unbound = workspace({
      period_key: '2025/26',
      label: '2025/26',
      start_date: '2025-03-01',
      end_date: '2026-02-28',
    });
    expect(resolveCalendarYearForWorkspace(unbound, [y2425, y2526, y2627])).toBeNull();

    const linked: EfsWorkspaceListItem = {
      ...unbound,
      efs_reporting_periods: {
        ...unbound.efs_reporting_periods,
        financial_year_id: 'fy-2526',
      },
    };
    expect(resolveCalendarYearForWorkspace(linked, [y2425, y2526, y2627])?.yearCode).toBe(
      '2025/26',
    );
  });

  it('resolves prior calendar year for comparative period', () => {
    expect(priorCalendarYear(y2526, [y2425, y2526, y2627])?.yearCode).toBe('2024/25');
  });
});
