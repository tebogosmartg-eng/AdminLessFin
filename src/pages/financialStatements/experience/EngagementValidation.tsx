import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';
import {
  severityBadgeLabel,
  severityLabel,
  validationScore,
} from '../../../lib/financialStatements/presentation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { showError, showSuccess } from '../../../utils/toast';

type ValDash = {
  latest_run: {
    id: string;
    status: string;
    ready_for_review: boolean;
    blocking_count: number;
    significant_count: number;
    advisory_count: number;
    total_issues: number;
  } | null;
  issues: Array<{
    id: string;
    title: string;
    severity: string;
    resolution_status: string;
    recommendation: string | null;
  }>;
  ready_for_review: boolean;
  blocking_count: number;
  significant_count: number;
  advisory_count: number;
};

export default function WorkspaceValidation({
  companyId,
  workspaceId,
  frameworkPackId,
}: {
  companyId: string;
  workspaceId: string;
  frameworkPackId?: string | null;
}) {
  const qc = useQueryClient();

  const dashQuery = useQuery({
    queryKey: ['efs_validation_dash', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<ValDash>(companyId, 'GET_VALIDATION_DASHBOARD', {
        workspace_id: workspaceId,
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_validation_dash', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });
  };

  const runValidation = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'RUN_VALIDATION', {
        workspace_id: workspaceId,
        framework_pack_id: frameworkPackId || undefined,
        run_type: 'full',
      }),
    onSuccess: () => {
      showSuccess('Checks completed');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const resolve = useMutation({
    mutationFn: (issueId: string) =>
      invokeFinancialStatements(companyId, 'RESOLVE_VALIDATION_ISSUE', {
        issue_id: issueId,
        resolution_status: 'acknowledged',
      }),
    onSuccess: () => {
      showSuccess('Marked as acknowledged');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const d = dashQuery.data;
  const score = validationScore({
    blocking_count: d?.blocking_count,
    significant_count: d?.significant_count,
    advisory_count: d?.advisory_count,
    total_issues: d?.latest_run?.total_issues,
    ready_for_review: d?.ready_for_review,
  });

  const groups: Array<'Critical Issues' | 'Warnings' | 'Information'> = [
    'Critical Issues',
    'Warnings',
    'Information',
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Validation</CardTitle>
            <CardDescription>
              Overall Readiness, Critical Issues, Warnings, Recommended Actions, and Ready for
              Manager Review.
            </CardDescription>
          </div>
          <Button disabled={runValidation.isPending} onClick={() => runValidation.mutate()}>
            Check again
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Overall Readiness</div>
              <div className="text-3xl font-semibold">{score.score}</div>
              <div className="text-xs text-muted-foreground">{score.label}</div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Critical Issues</div>
              <div className="text-3xl font-semibold text-destructive">{d?.blocking_count ?? 0}</div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Warnings</div>
              <div className="text-3xl font-semibold">{d?.significant_count ?? 0}</div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Information</div>
              <div className="text-3xl font-semibold">{d?.advisory_count ?? 0}</div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Ready for Manager Review</div>
              <div className="text-lg font-semibold">
                {d?.ready_for_review ? 'Yes' : 'Not yet'}
              </div>
            </div>
          </div>

          {groups.map((group) => {
            const issues = (d?.issues || []).filter((i) => severityLabel(i.severity) === group);
            if (!issues.length) return null;
            return (
              <div key={group} className="space-y-2">
                <h3 className="text-sm font-medium">{group}</h3>
                <ul className="space-y-2">
                  {issues.map((issue) => (
                    <li
                      key={issue.id}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              severityBadgeLabel(issue.severity) === 'Critical'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {severityBadgeLabel(issue.severity)}
                          </Badge>
                          <span className="text-sm font-medium">{issue.title}</span>
                        </div>
                        {issue.recommendation && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium">Recommended Action: </span>
                            {issue.recommendation}
                          </p>
                        )}
                      </div>
                      {issue.resolution_status === 'open' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resolve.isPending}
                          onClick={() => resolve.mutate(issue.id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {!d?.issues?.length && (
            <p className="text-sm text-muted-foreground">
              {d?.ready_for_review
                ? 'No outstanding issues. Ready for review.'
                : 'Run checks to see validation results.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
