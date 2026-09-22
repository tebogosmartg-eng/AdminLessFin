/**
 * The year and range a page is showing, from the global context. Replaces the
 * fixed "Current Financial Year" badges, which stayed on screen whatever year
 * or range was actually selected.
 */
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

export function ContextYearBadge({ className }: { className?: string }) {
  const { yearCode, isCurrentFinancialYear, reportingRangeLabel } = useReportingPeriod();
  if (!yearCode) return null;
  return (
    <Badge
      variant="outline"
      data-testid="page-year-badge"
      title={isCurrentFinancialYear ? 'The current financial year' : 'Not the current financial year'}
      className={cn(
        'whitespace-nowrap align-middle font-normal',
        !isCurrentFinancialYear && 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
        className,
      )}
    >
      {yearCode} · {reportingRangeLabel}
      {!isCurrentFinancialYear ? ' · not current' : ''}
    </Badge>
  );
}

export default ContextYearBadge;
