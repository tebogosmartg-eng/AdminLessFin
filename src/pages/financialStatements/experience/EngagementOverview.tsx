import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import type { EfsDashboard, EfsEngagementGeneralInformation } from '../../../lib/financialStatements/api';
import {
  buildAttentionSummary,
  buildPreparationChecklist,
  preparationStatusGlyph,
  WORKFLOW_STEPS,
  type PreparationNavTarget,
} from '../../../lib/financialStatements/engagementPreparation';
import {
  humanizeActivityMessage,
  workspaceStatusLabel,
} from '../../../lib/financialStatements/presentation';
import { corporateDisplayFromEntity } from '../../../lib/financialStatements/corporateInformation/accessors';
import {
  formatCalendarYearRange,
  resolveEngagementReportingPeriod,
} from '../../../lib/financialStatements/calendarYearBinding';
import { useReportingPeriod } from '../../../contexts/ReportingPeriodContext';
import { cn } from '../../../lib/utils';

function Widget({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

/**
 * V6.10.2 Overview — accountant dashboard with truthful next-action workflow.
 */
export default function WorkspaceOverview({
  dashboard,
  generalInfo,
  outstandingWorkingPapers,
  onNavigate,
}: {
  dashboard: EfsDashboard;
  generalInfo?: EfsEngagementGeneralInformation | null;
  outstandingWorkingPapers?: number;
  onNavigate?: (target: PreparationNavTarget) => void;
}) {
  const { financialYears, activeFinancialYear } = useReportingPeriod();
  const d = dashboard;
  const checklist = buildPreparationChecklist(d, generalInfo, {
    outstandingWorkingPapers,
  });
  const summary = buildAttentionSummary(checklist);
  const checklistById = Object.fromEntries(checklist.map((i) => [i.id, i]));
  const nextItem = checklist.find(
    (c) =>
      c.target === summary.nextTarget &&
      (c.status === 'blocking' || c.status === 'attention' || c.status === 'pending'),
  );

  const frameworkLabel =
    d.framework?.efs_frameworks?.name ||
    d.framework?.label ||
    corporateDisplayFromEntity(generalInfo).reportingFramework ||
    'Not selected';

  const fy = resolveEngagementReportingPeriod(
    d.reportingPeriod,
    financialYears,
    activeFinancialYear,
  );

  const corporateDisplay = corporateDisplayFromEntity(generalInfo);
  const preparedBy = corporateDisplay.preparedBy || '—';
  const reviewedBy =
    corporateDisplay.reviewedBy ||
    corporateDisplay.partner ||
    d.reviewStatus?.manager ||
    d.reviewStatus?.partner ||
    '—';

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Continue Preparing Annual Financial Statements</CardTitle>
          <CardDescription>
            Follow the year-end workflow below. The next recommended action is always highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="flex flex-wrap gap-1.5" aria-label="Engagement workflow">
            {WORKFLOW_STEPS.map((step) => {
              const item = checklistById[step.id];
              const status = item?.status ?? 'pending';
              const recommended = nextItem?.id === step.id;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.(step.target)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      status === 'complete' &&
                        'border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
                      recommended && 'border-primary bg-primary text-primary-foreground',
                      !recommended &&
                        status !== 'complete' &&
                        'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {status === 'complete' ? '✓ ' : recommended ? '→ ' : ''}
                    {step.label}
                  </button>
                </li>
              );
            })}
          </ol>

          <ul className="space-y-2 text-sm">
            {checklist.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-background/80"
                  onClick={() => onNavigate?.(item.target)}
                >
                  <span className="mt-0.5 w-4 shrink-0 font-medium" aria-hidden>
                    {preparationStatusGlyph(item.status)}
                  </span>
                  <span className="flex-1">
                    <span className="font-medium">{item.label}</span>
                    {item.detail ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Next Recommended Action</div>
              <div className="font-medium">{summary.nextActionLabel}</div>
              <div className="text-xs text-muted-foreground">{summary.overallReadiness}</div>
            </div>
            <Button onClick={() => onNavigate?.(summary.nextTarget)}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Widget title="Workspace Status">
          <Badge variant="secondary">{workspaceStatusLabel(d.workspace.status)}</Badge>
          <div className="mt-2 text-muted-foreground">{d.progress.pct.toFixed(0)}% complete</div>
        </Widget>

        <Widget title="Reporting Framework">
          <div className="font-medium">{frameworkLabel}</div>
        </Widget>

        <Widget title="Financial Year">
          <div className="font-medium">{fy.yearCode || fy.displayLabel}</div>
          {fy.calendarYear ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {formatCalendarYearRange(fy.calendarYear)}
            </div>
          ) : fy.startDate && fy.endDate ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {fy.startDate} → {fy.endDate}
            </div>
          ) : null}
          {fy.isHistorical && (
            <Badge variant="outline" className="mt-2">
              {fy.isLegacyUnbound
                ? 'Legacy Financial Statement Engagement'
                : 'Historical engagement'}
            </Badge>
          )}
        </Widget>

        <Widget title="Overall Readiness">
          <div className="font-medium">{summary.overallReadiness}</div>
        </Widget>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Widget title="Prepared By">
          <div className="font-medium">{preparedBy}</div>
        </Widget>

        <Widget title="Reviewed By">
          <div className="font-medium">{reviewedBy}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Manager: {corporateDisplay.reviewedBy || d.reviewStatus?.manager || '—'}
          </div>
          <div className="text-xs text-muted-foreground">
            Partner: {corporateDisplay.partner || d.reviewStatus?.partner || '—'}
          </div>
        </Widget>

        <Widget title="Outstanding Items">
          {summary.outstanding.length === 0 ? (
            <p className="text-muted-foreground">Nothing outstanding</p>
          ) : (
            <ul className="space-y-1 text-amber-700 dark:text-amber-400">
              {summary.outstanding.slice(0, 6).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </Widget>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {(d.recentActivity || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.recentActivity.map((a) => (
                <li
                  key={a.id}
                  className={cn('flex justify-between gap-4 border-b border-border/60 pb-2')}
                >
                  <span>{humanizeActivityMessage(a.message)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(a.created_at), 'dd MMM HH:mm')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
