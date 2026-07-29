/**
 * V16.1 — Deployment diagnostics panel (Company Master Data infrastructure).
 */
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { DeploymentReadinessReport } from '../../../lib/financialStatements/masterData/deploymentVerification';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

export default function V161DeploymentDiagnostics({
  report,
}: {
  report: DeploymentReadinessReport;
}) {
  const failed = report.checks.filter((c) => c.status === 'FAIL');

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">Deployment Status — NOT READY</CardTitle>
        </div>
        <CardDescription>
          Version {report.version} Company Master Data infrastructure is blocked. Master data
          features and publication are disabled until migrations are applied.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="destructive">{report.readiness}</Badge>
          <Badge variant="outline">Edge {report.edgeFunctionVersion}</Badge>
        </div>

        <div className="rounded-md border border-destructive/20 bg-background/60 p-3 font-mono text-xs whitespace-pre-wrap">
          {[
            'Deployment Status',
            'NOT READY',
            '',
            'Reason',
            report.reason || failed[0]?.detail || 'Missing infrastructure',
            '',
            'Required migration:',
            failed[0]?.requiredMigration || report.requiredMigrations[0],
            '',
            'Status',
            'BLOCKED',
          ].join('\n')}
        </div>

        {failed.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Failed checks
            </p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {failed.map((c) => (
                <li key={c.id}>
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.detail ? ` — ${c.detail}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1 font-medium">Required migrations</p>
          <ul className="list-inside list-disc text-muted-foreground">
            {report.requiredMigrations.map((m) => (
              <li key={m} className="font-mono text-xs">
                {m}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
