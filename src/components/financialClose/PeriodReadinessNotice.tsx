import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { invokeFinancialClose, type EfcpPeriodReadiness } from '../../lib/financialClose/api';
import { efcpFlags } from '../../lib/financialClose/flags';
import { periodStatusLabel } from '../../lib/financialClose/presentation';

/**
 * EFCP V6.8.0 — Financial Statements integration (read-only).
 * Verifies the accounting period before Annual Financial Statements
 * generation: mandatory reconciliations, critical issues, approvals,
 * and period lock status. Display only — never blocks silently and
 * never regenerates anything.
 */
export default function PeriodReadinessNotice({
  companyId,
  startDate,
  endDate,
}: {
  companyId: string;
  startDate: string;
  endDate: string;
}) {
  const enabled =
    (efcpFlags.module() || efcpFlags.workspaceUi()) && !!companyId && !!startDate && !!endDate;

  const readinessQuery = useQuery({
    queryKey: ['efcp_period_readiness', companyId, startDate, endDate],
    queryFn: () =>
      invokeFinancialClose<EfcpPeriodReadiness>(companyId, 'GET_PERIOD_READINESS', {
        start_date: startDate,
        end_date: endDate,
      }),
    enabled,
    retry: false,
  });

  if (!enabled || readinessQuery.isLoading || readinessQuery.isError) return null;
  const r = readinessQuery.data;
  if (!r) return null;

  if (r.close_exists && r.ready_for_financial_statements) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          Accounting period verified through Financial Close ({periodStatusLabel(r.period_status)}).
          Ready for Financial Statements.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {r.close_exists ? (
          <>
            This accounting period has not completed Financial Close (
            {periodStatusLabel(r.period_status)}). Complete reconciliations and approvals in{' '}
            <Link
              to={r.close_workspace_id ? `/financial-close/${r.close_workspace_id}` : '/financial-close'}
              className="underline"
            >
              Financial Close
            </Link>{' '}
            before relying on these Financial Statements.
          </>
        ) : (
          <>
            No Financial Close has been opened for this accounting period.{' '}
            <Link to="/financial-close" className="underline">
              Open a Financial Close
            </Link>{' '}
            to verify the period before preparing Financial Statements.
          </>
        )}
      </span>
    </div>
  );
}
