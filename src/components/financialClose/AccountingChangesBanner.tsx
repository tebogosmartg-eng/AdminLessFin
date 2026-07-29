import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { useAccountingChangesDetected } from '../../hooks/useAccountingChangesDetected';
import { GENERATION_COPY } from '../../lib/financialStatements/generationExperience';

/**
 * EFCP / EFS V6.10.1 — Financial Statements integration banner.
 * When accounting changed after the last preparation, offer Refresh.
 * Never regenerates automatically — refresh is an explicit user action.
 * Never mentions Reporting Snapshots or internal pipeline terms.
 */
export default function AccountingChangesBanner({
  companyId,
  startDate,
  endDate,
  capturedAt,
  onRefresh,
  refreshing,
}: {
  companyId: string;
  startDate?: string | null;
  endDate?: string | null;
  /** When statements were last prepared from accounting */
  capturedAt?: string | null;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const { accountingChanged } = useAccountingChangesDetected({
    companyId,
    startDate,
    endDate,
    capturedAt,
  });

  if (!accountingChanged) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <span>{GENERATION_COPY.requireRefresh}</span>
      <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw className="mr-2 h-4 w-4" />
        {GENERATION_COPY.refreshAction}
      </Button>
    </div>
  );
}
