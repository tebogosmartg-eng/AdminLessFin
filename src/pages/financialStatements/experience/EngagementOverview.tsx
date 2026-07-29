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
  type PreparationNavTarget,
} from '../../../lib/financialStatements/engagementPreparation';
import {
  humanizeActivityMessage,
  workspaceStatusLabel,
} from '../../../lib/financialStatements/presentation';
import { corporateDisplayFromEntity } from '../../../lib/financialStatements/corporateInformation/accessors';
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
 * V6.10.0 Overview — accountant dashboard.
 * Answers: What am I preparing? What is missing? What next? Ready for review/publication?
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
  const d = dashboard;
  const checklist = buildPreparationChecklist(d, generalInfo, {
    outstandingWorkingPapers,
  });
  const summary = buildAttentionSummary(checklist);

  const frameworkLabel =
    d.framework?.efs_frameworks?.name ||
    d.framework?.label ||
    corporateDisplayFromEntity(generalInfo).reportingFramework ||
    'Not selected';

  const financialYear =
    d.reportingPeriod?.label ||
    (d.reportingPeriod?.start_date && d.reportingPeriod?.end_date
      ? `${d.reportingPeriod.start_date} → ${d.reportingPeriod.end_date}`
      : 'Not set');

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
            The platform determines the next logical task. Focus on professional judgement — not
            software setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            </div>
            <Button onClick={() => onNavigate?.(summary.nextTarget)}>
              {summary.nextActionLabel}
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
          <div className="font-medium">{financialYear}</div>
          {d.reportingPeriod?.start_date && d.reportingPeriod?.end_date && d.reportingPeriod?.label && (
            <div className="mt-1 text-xs text-muted-foreground">
              {d.reportingPeriod.start_date} → {d.reportingPeriod.end_date}
            </div>
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
