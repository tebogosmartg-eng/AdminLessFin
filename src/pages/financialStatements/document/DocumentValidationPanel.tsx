import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';
import type { DocumentModel } from '../../../lib/financialStatements/document/documentModel';
import type { DocOverrides } from '../../../lib/financialStatements/document/documentStore';
import { validateAfsArticulation } from '../../../lib/financialStatements/publication/afsAccountingValidation';
import {
  validateProfessionalLayout,
} from '../../../lib/financialStatements/publication/afsProfessionalPdf';
import { generateWorkspaceAfsPdf } from '../../../lib/financialStatements/publication/afsWorkspacePdf';
import { collectCrossReferenceIssues } from '../../../lib/financialStatements/document/crossRefRewrite';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Skeleton } from '../../../components/ui/skeleton';
import { showError, showSuccess } from '../../../utils/toast';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { useEnterpriseMateriality } from '../../../hooks/useEnterpriseMateriality';

type ValidationDashboard = {
  ready_for_review: boolean;
  blocking_count: number;
  significant_count: number;
  advisory_count: number;
  open_issues: Array<{
    id: string;
    title: string;
    severity: string;
    recommendation?: string | null;
  }>;
};

function CheckRow({ pass, label, detail }: { pass: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
      {pass ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      )}
      <div>
        <p className="font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

export default function DocumentValidationPanel({
  companyId,
  workspaceId,
  model,
  overrides,
}: {
  companyId: string;
  workspaceId: string;
  model: DocumentModel;
  overrides: DocOverrides;
}) {
  const qc = useQueryClient();
  const { options: materialityOptions, percentageThreshold } = useEnterpriseMateriality(companyId);

  const dashQuery = useQuery({
    queryKey: ['efs_doc_validation', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<ValidationDashboard>(companyId, 'GET_VALIDATION_DASHBOARD', {
        workspace_id: workspaceId,
      }),
  });

  const runValidation = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'RUN_VALIDATION', { workspace_id: workspaceId }),
    onSuccess: () => {
      showSuccess('Validation complete');
      qc.invalidateQueries({ queryKey: ['efs_doc_validation', companyId, workspaceId] });
    },
    onError: (e: Error) => showError(e.message),
  });

  const articulation = useMemo(
    () =>
      validateAfsArticulation({
        statements: model.statements.map((s) => ({
          statement_type: s.statement_type,
          lines: s.lines,
        })),
      }),
    [model.statements],
  );

  const layout = useMemo(() => {
    try {
      return validateProfessionalLayout(
        generateWorkspaceAfsPdf(model, overrides, materialityOptions),
      );
    } catch {
      return { ok: false, checks: {} as Record<string, boolean> };
    }
  }, [model, overrides, materialityOptions]);

  const materialityConfigured = percentageThreshold != null && percentageThreshold >= 0;

  const crossRefIssues = useMemo(
    () => collectCrossReferenceIssues(model.notes, overrides),
    [model.notes, overrides],
  );

  const dash = dashQuery.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Validation</CardTitle>
          <CardDescription>
            Engine validation plus live document checks. The document checks run on the exact PDF
            that will be produced.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : dash ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={dash.ready_for_review ? 'default' : 'secondary'}>
                  {dash.ready_for_review ? 'Ready for review' : 'Not yet ready'}
                </Badge>
                <Badge variant="outline">{dash.blocking_count} blocking</Badge>
                <Badge variant="outline">{dash.significant_count} significant</Badge>
                <Badge variant="outline">{dash.advisory_count} advisory</Badge>
              </div>
              {(dash.open_issues || []).slice(0, 6).map((issue) => (
                <div key={issue.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{issue.title}</span>
                    <Badge variant="outline">{issue.severity}</Badge>
                  </div>
                  {issue.recommendation && (
                    <p className="mt-1 text-xs text-muted-foreground">{issue.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Validation has not been run yet.</p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => runValidation.mutate()}
            disabled={runValidation.isPending}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${runValidation.isPending ? 'animate-spin' : ''}`} />
            {runValidation.isPending ? 'Running...' : 'Run validation'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enterprise materiality</CardTitle>
          <CardDescription>
            Disclosure materiality uses company materiality settings (Accounting Policies), not a
            parallel FS threshold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CheckRow
            pass={materialityConfigured}
            label={
              materialityConfigured
                ? `Company threshold ${percentageThreshold}% applied to reporting intelligence`
                : 'Company materiality settings not configured'
            }
            detail={
              materialityConfigured
                ? 'Validation PDF and publication use the same enterprise threshold.'
                : 'Configure materiality on the Accounting Dashboard — FS will fall back to size heuristics until set.'
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting articulation</CardTitle>
          <CardDescription>Checks the published statement lines reconcile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {articulation.checks.map((c) => (
            <CheckRow key={c.id} pass={c.pass} label={c.label} detail={c.detail} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cross-references</CardTitle>
          <CardDescription>
            Advisory only — numbering is rewritten at preview/PDF time; stored wording is never
            overwritten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {crossRefIssues.map((c) => (
            <CheckRow key={c.id} pass={c.pass} label={c.label} detail={c.detail} />
          ))}
          {model.crossReferences.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {model.crossReferences.length} structured cross-reference
              {model.crossReferences.length === 1 ? '' : 's'} on the engagement (disclosure
              platform).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document layout</CardTitle>
          <CardDescription>Presentation quality of the generated PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <CheckRow
            pass={layout.ok}
            label={layout.ok ? 'Document layout checks passed' : 'Document layout needs attention'}
          />
          {!layout.ok &&
            Object.entries(layout.checks)
              .filter(([, v]) => !v)
              .map(([k]) => <CheckRow key={k} pass={false} label={k} />)}
        </CardContent>
      </Card>
    </div>
  );
}
