import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../lib/financialStatements/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { showError, showSuccess } from '../../utils/toast';
import { format } from 'date-fns';

type ValDash = {
  latest_run: {
    id: string;
    status: string;
    ready_for_review: boolean;
    blocking_count: number;
    significant_count: number;
    advisory_count: number;
    total_issues: number;
    completed_at: string | null;
    started_at: string;
  } | null;
  issues: Array<{
    id: string;
    rule_code: string;
    issue_code: string;
    title: string;
    severity: string;
    resolution_status: string;
    recommendation: string | null;
  }>;
  open_issues: Array<{ id: string }>;
  ready_for_review: boolean;
  blocking_count: number;
  significant_count: number;
  advisory_count: number;
  mutates_financial_data: boolean;
  approves_statements: boolean;
  manager_review: boolean;
  publication: boolean;
};

function severityVariant(s: string): 'destructive' | 'default' | 'secondary' | 'outline' {
  if (s === 'blocking') return 'destructive';
  if (s === 'significant') return 'default';
  return 'secondary';
}

/**
 * Validation Platform panel — Phase D1.
 * Identifies defects for review readiness. Does not approve statements.
 */
export default function ValidationPanel({
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
  };

  const runValidation = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'RUN_VALIDATION', {
        workspace_id: workspaceId,
        framework_pack_id: frameworkPackId || undefined,
        run_type: 'full',
      }),
    onSuccess: (r: { ready_for_review?: boolean; run?: { status: string; total_issues: number } }) => {
      showSuccess(
        `Validation ${r.run?.status || 'completed'} — ${r.run?.total_issues ?? 0} issues · ready_for_review=${String(r.ready_for_review)}`,
      );
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const resolveIssue = useMutation({
    mutationFn: ({ issueId, status }: { issueId: string; status: string }) =>
      invokeFinancialStatements(companyId, 'RESOLVE_VALIDATION_ISSUE', {
        issue_id: issueId,
        resolution_status: status,
        resolution_note: 'Triaged from Validation panel (not approval)',
      }),
    onSuccess: () => {
      showSuccess('Issue resolution status updated (triage only)');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const d = dashQuery.data;
  const latest = d?.latest_run;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Validation</CardTitle>
        <CardDescription>
          Technical and Framework Validation identify defects against Reporting Snapshots, Structure,
          Disclosures, and Working Papers. Validation never changes financial data and does not approve
          statements. Manager/Partner Review, Publication, XBRL, and AI remain deferred.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={runValidation.isPending} onClick={() => runValidation.mutate()}>
            Run full validation
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4 text-sm">
          <div>
            <div className="text-muted-foreground">Ready for review</div>
            <div className="text-lg font-medium">{d?.ready_for_review ? 'Yes' : 'No'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Blocking</div>
            <div className="text-lg font-medium">{d?.blocking_count ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Significant</div>
            <div className="text-lg font-medium">{d?.significant_count ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Advisory</div>
            <div className="text-lg font-medium">{d?.advisory_count ?? 0}</div>
          </div>
        </div>

        {latest && (
          <div className="text-xs text-muted-foreground">
            Latest run · {latest.status} · {latest.total_issues} issues ·{' '}
            {latest.completed_at
              ? format(new Date(latest.completed_at), 'dd MMM yyyy HH:mm')
              : format(new Date(latest.started_at), 'dd MMM yyyy HH:mm')}
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium">Validation issues</div>
          <ul className="space-y-2 text-sm">
            {(d?.issues || []).length === 0 && (
              <li className="text-muted-foreground">No issues yet — run validation.</li>
            )}
            {(d?.issues || []).map((issue) => (
              <li
                key={issue.id}
                className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-2"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
                    <Badge variant="outline">{issue.resolution_status}</Badge>
                    <span className="font-medium">{issue.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {issue.rule_code} · {issue.issue_code}
                  </div>
                  {issue.recommendation && (
                    <div className="text-xs text-muted-foreground">Rec: {issue.recommendation}</div>
                  )}
                </div>
                {issue.resolution_status === 'open' && (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveIssue.mutate({ issueId: issue.id, status: 'acknowledged' })}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveIssue.mutate({ issueId: issue.id, status: 'remediated' })}
                    >
                      Remediated
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolveIssue.mutate({ issueId: issue.id, status: 'waived' })}
                    >
                      Waive
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          mutates_financial_data={String(d?.mutates_financial_data ?? false)} · approves=
          {String(d?.approves_statements ?? false)} · manager_review=
          {String(d?.manager_review ?? false)} · publication={String(d?.publication ?? false)}
        </p>
      </CardContent>
    </Card>
  );
}
