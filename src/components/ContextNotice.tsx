/**
 * A strip under the header whenever the global context is not the everyday
 * one: another financial year, a period that refuses postings, or a company
 * with no financial year yet. It is there so nobody reads last year's figures
 * believing they are this year's.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, History, Lock } from 'lucide-react';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { Button } from './ui/button';
import { formatPeriodName, formatYearRange } from '../lib/reportingPeriod/selection';
import { periodStatusMeta, yearStatusMeta } from '../lib/reportingPeriod/status';

export default function ContextNotice() {
  const {
    companyName,
    activeFinancialYear,
    currentFinancialYear,
    isCurrentFinancialYear,
    selectedAccountingPeriod,
    isCalendarFallback,
    resetToCurrentFinancialYear,
  } = useReportingPeriod();

  if (isCalendarFallback) {
    return (
      <div role="status" data-testid="context-notice" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 print:hidden">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          {companyName ?? 'This company'} has no financial year set up, so screens show calendar year {new Date().getFullYear()}.
        </span>
        <Button asChild size="sm" variant="outline" className="h-7">
          <Link to="/settings?tab=accounting">Set up financial year</Link>
        </Button>
      </div>
    );
  }

  const notices: JSX.Element[] = [];

  if (activeFinancialYear && !isCurrentFinancialYear) {
    const status = yearStatusMeta(activeFinancialYear.status).label.toLowerCase();
    notices.push(
      <div key="year" role="status" data-testid="context-notice" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 print:hidden">
        <History className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          Viewing <strong>{activeFinancialYear.yearCode}</strong> ({status}, {formatYearRange(activeFinancialYear)}), not the current financial year.
          Every screen shows this year until you change it.
        </span>
        {currentFinancialYear && (
          <Button size="sm" variant="outline" className="h-7" onClick={resetToCurrentFinancialYear}>
            Back to {currentFinancialYear.yearCode}
          </Button>
        )}
      </div>,
    );
  }

  if (selectedAccountingPeriod) {
    const meta = periodStatusMeta(selectedAccountingPeriod.status);
    if (!meta.acceptsPostings) {
      notices.push(
        <div key="period" role="status" data-testid="locked-period-notice" className="flex items-center gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 sm:px-6 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 print:hidden">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {formatPeriodName(selectedAccountingPeriod)} is <strong>{meta.label.toLowerCase()}</strong>. You can view it; postings dated in it are refused.
          </span>
        </div>,
      );
    }
  }

  return notices.length ? <>{notices}</> : null;
}
