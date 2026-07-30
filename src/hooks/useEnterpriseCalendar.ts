/**
 * Data adapter for Enterprise Financial Calendar (G3.6C).
 *
 * Used ONLY by:
 *   - ReportingPeriodContext (app-facing facade)
 *   - Settings / Financial Years register (calendar writers & admin lists)
 *
 * Financial modules must consume `useReportingPeriod()` — never call this
 * hook to invent reporting defaults or active-year labels.
 */
import { useQuery } from '@tanstack/react-query';
import { financialCalendarService } from '@/governance/domains/financialCalendar/service';
import { calendarContextFromYears } from '@/lib/enterpriseMasterData/calendar';

export function useEnterpriseCalendar(companyId: string | undefined | null) {
  const query = useQuery({
    queryKey: ['financial_years', companyId],
    queryFn: () => financialCalendarService.getFinancialYears(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const context = calendarContextFromYears(query.data || []);

  return {
    ...context,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
