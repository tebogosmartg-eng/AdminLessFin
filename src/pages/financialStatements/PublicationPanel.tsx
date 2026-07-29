import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../lib/financialStatements/api';
import { downloadBase64Artifact } from '../../lib/financialStatements/publication/canonical';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { showError, showSuccess } from '../../utils/toast';
import { format } from 'date-fns';

type PubDash = {
  review: { id: string; stage: string; publication_executed: boolean; pack_fingerprint: string | null } | null;
  publication_ready: boolean;
  publication_executed: boolean;
  latest_record: {
    id: string;
    executed_at: string;
    publication_fingerprint: string;
    efs_publication_packs?: {
      publication_seal_hash: string;
      metadata: { title?: string };
    };
  } | null;
  artifacts: Array<{
    id: string;
    format: string;
    content_hash: string;
    byte_size: number;
    generated_at: string;
  }>;
  history: Array<{ id: string; event_type: string; message: string; created_at: string }>;
  mutates_accounting: boolean;
  live_gl: boolean;
  publication: boolean;
};

/**
 * Publication Platform panel — Phase E.
 * Generates immutable PDF / Word / Excel from sealed Publication Pack only.
 */
export default function PublicationPanel({
  companyId,
  workspaceId,
}: {
  companyId: string;
  workspaceId: string;
}) {
  const qc = useQueryClient();

  const dashQuery = useQuery({
    queryKey: ['efs_publication_dash', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<PubDash>(companyId, 'GET_PUBLICATION_DASHBOARD', {
        workspace_id: workspaceId,
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_publication_dash', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });
  };

  const execute = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'EXECUTE_PUBLICATION', {
        workspace_id: workspaceId,
      }),
    onSuccess: () => {
      showSuccess('Publication executed — PDF, Word, and Excel archived');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const download = useMutation({
    mutationFn: async (artifactId: string) => {
      const res = await invokeFinancialStatements<{
        artifact: { format: string };
        content_base64: string;
      }>(companyId, 'GET_PUBLICATION_ARTIFACT', { artifact_id: artifactId });
      return res;
    },
    onSuccess: (res) => {
      const title =
        dashQuery.data?.latest_record?.efs_publication_packs?.metadata?.title ||
        'Annual-Financial-Statements';
      const safe = title.replace(/[^\w-]+/g, '-').slice(0, 60);
      downloadBase64Artifact(res.content_base64, res.artifact.format, safe);
      showSuccess(`Downloaded ${res.artifact.format.toUpperCase()}`);
    },
    onError: (e: Error) => showError(e.message),
  });

  const d = dashQuery.data;
  const canExecute = d?.publication_ready && !d?.publication_executed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Publication</CardTitle>
        <CardDescription>
          Enterprise Publication Platform — consumes only publication_ready engagements. Never reads
          live GL or recalculates balances. Generates immutable PDF, Word, and Excel from the same
          sealed Publication Pack.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={d?.publication_executed ? 'default' : 'secondary'}>
            {d?.publication_executed ? 'Published' : d?.publication_ready ? 'Ready' : 'Not ready'}
          </Badge>
          {d?.review?.stage && (
            <Badge variant="outline">Review: {d.review.stage.replace(/_/g, ' ')}</Badge>
          )}
          <Button size="sm" disabled={!canExecute || execute.isPending} onClick={() => execute.mutate()}>
            Execute publication
          </Button>
        </div>

        {d?.latest_record && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="font-medium">Latest publication record</div>
            <div className="text-muted-foreground">
              Executed {format(new Date(d.latest_record.executed_at), 'dd MMM yyyy HH:mm')}
            </div>
            <div className="font-mono text-xs truncate">
              Fingerprint: {d.latest_record.publication_fingerprint?.slice(0, 24)}…
            </div>
            {d.latest_record.efs_publication_packs?.publication_seal_hash && (
              <div className="font-mono text-xs truncate">
                Seal: {d.latest_record.efs_publication_packs.publication_seal_hash.slice(0, 24)}…
              </div>
            )}
          </div>
        )}

        {(d?.artifacts?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Publication archive (download)</div>
            <div className="flex flex-wrap gap-2">
              {d!.artifacts.map((a) => (
                <Button
                  key={a.id}
                  variant="outline"
                  size="sm"
                  disabled={download.isPending}
                  onClick={() => download.mutate(a.id)}
                >
                  Download {a.format.toUpperCase()} ({Math.round(a.byte_size / 1024)} KB)
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              All formats generated from the same immutable Publication Pack — identical amounts.
            </p>
          </div>
        )}

        {(d?.history?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Publication history</div>
            <ul className="text-sm space-y-1">
              {d!.history.slice(0, 5).map((h) => (
                <li key={h.id} className="flex justify-between gap-2 border-b border-border/50 pb-1">
                  <span>{h.message}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(h.created_at), 'dd MMM HH:mm')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          mutates_accounting={String(d?.mutates_accounting ?? false)} · live_gl=
          {String(d?.live_gl ?? false)} · XBRL/AI not implemented
        </p>
      </CardContent>
    </Card>
  );
}
