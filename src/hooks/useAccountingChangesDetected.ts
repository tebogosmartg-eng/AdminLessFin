import { useQuery } from '@tanstack/react-query';
import { invokeFinancialClose, type EfcpPeriodReadiness } from '../lib/financialClose/api';
import { efcpFlags } from '../lib/financialClose/flags';
import { isAccountingChangedSinceCapture } from '../lib/financialStatements/generationExperience';

/**
 * Shared accounting-change detection for FS generation experience (V6.10.1).
 * Uses certified Financial Close readiness — no Snapshot Engine changes.
 */
export function useAccountingChangesDetected(opts: {
  companyId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  capturedAt?: string | null;
}) {
  const closeEnabled = efcpFlags.module() || efcpFlags.workspaceUi();
  const enabled =
    closeEnabled &&
    !!opts.companyId &&
    !!opts.startDate &&
    !!opts.endDate &&
    !!opts.capturedAt;

  const readinessQuery = useQuery({
    queryKey: ['efcp_period_readiness', opts.companyId, opts.startDate, opts.endDate],
    queryFn: () =>
      invokeFinancialClose<EfcpPeriodReadiness>(opts.companyId!, 'GET_PERIOD_READINESS', {
        start_date: opts.startDate,
        end_date: opts.endDate,
      }),
    enabled,
    retry: false,
  });

  const readiness = readinessQuery.data;
  const accountingChanged = enabled
    ? isAccountingChangedSinceCapture({
        latestJournalAt: readiness?.latest_journal_at,
        capturedAt: opts.capturedAt,
        periodLocked: readiness?.period_status === 'locked',
      })
    : false;

  return {
    enabled,
    isLoading: enabled && readinessQuery.isLoading,
    isError: readinessQuery.isError,
    accountingChanged,
    readiness,
  };
}
