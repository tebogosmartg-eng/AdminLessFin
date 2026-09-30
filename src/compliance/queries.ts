import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeCompliance } from './api';
import type { ComplianceCalendarEvent, ComplianceOverview, ObligationDetail } from './types';

/**
 * Compliance query keys and hooks. Deliberately NOT in src/lib/queries.ts:
 * that barrel is part of the eager shell, and this module must stay out of
 * the startup bundle.
 */
export const complianceKeys = {
  all: (companyId: string) => ['compliance', companyId] as const,
  overview: (companyId: string) => ['compliance', companyId, 'overview'] as const,
  obligation: (companyId: string, id: string) => ['compliance', companyId, 'obligation', id] as const,
  calendar: (companyId: string, start: string, end: string) => ['compliance', companyId, 'calendar', start, end] as const,
};

export function useComplianceOverview(companyId: string | undefined) {
  return useQuery({
    queryKey: complianceKeys.overview(companyId ?? ''),
    queryFn: () => invokeCompliance<ComplianceOverview>(companyId!, 'GET_OVERVIEW'),
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useComplianceObligation(companyId: string | undefined, obligationId: string | undefined) {
  return useQuery({
    queryKey: complianceKeys.obligation(companyId ?? '', obligationId ?? ''),
    queryFn: () => invokeCompliance<ObligationDetail>(companyId!, 'GET_OBLIGATION', { obligation_id: obligationId }),
    enabled: !!companyId && !!obligationId,
    staleTime: 30_000,
  });
}

export function useComplianceCalendar(companyId: string | undefined, start: string, end: string, enabled: boolean) {
  return useQuery({
    queryKey: complianceKeys.calendar(companyId ?? '', start, end),
    queryFn: async () =>
      (await invokeCompliance<{ events: ComplianceCalendarEvent[] }>(companyId!, 'GET_CALENDAR', {
        start_date: start,
        end_date: end,
      })).events,
    enabled: enabled && !!companyId,
    staleTime: 60_000,
    // A failure here must not look like "nothing due": the calendar shows a notice.
    retry: 1,
  });
}

/**
 * Every obligation action returns the fresh obligation detail. It is written
 * straight into the cache, and the overview and calendar are invalidated.
 */
export function useObligationAction(companyId: string, obligationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method, payload }: { method: string; payload: Record<string, unknown> }) =>
      invokeCompliance<ObligationDetail>(companyId, method, { obligation_id: obligationId, ...payload }),
    onSuccess: (detail) => {
      qc.setQueryData(complianceKeys.obligation(companyId, obligationId), detail);
      qc.invalidateQueries({ queryKey: complianceKeys.overview(companyId) });
      qc.invalidateQueries({ queryKey: ['compliance', companyId, 'calendar'] });
    },
  });
}
