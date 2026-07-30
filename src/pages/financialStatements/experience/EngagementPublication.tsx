/**
 * Publication experience — Critical Gap 1 (V11.7).
 *
 * Accountant-facing Published PDF / DOCX are produced from the SAME canonical
 * Document Model + presentation overrides as Live Preview / Workspace PDF.
 * Server EXECUTE_PUBLICATION remains available for engagement archive (API
 * contract unchanged) but is no longer the source of the issued document.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  invokeFinancialStatements,
  type EfsDashboard,
  type EfsWorkspaceGeneralInformation,
} from '../../../lib/financialStatements/api';
import { ensureGenericDocument, loadDocumentModel } from '../../../lib/financialStatements/document/documentModel';
import { loadOverrides } from '../../../lib/financialStatements/document/documentStore';
import {
  buildCanonicalPublishPackage,
  downloadBytes,
} from '../../../lib/financialStatements/publication/canonicalDocumentPublish';
import { downloadBase64Artifact } from '../../../lib/financialStatements/publication/canonical';
import { publicationStatusLabel } from '../../../lib/financialStatements/presentation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { showError, showSuccess } from '../../../utils/toast';
import { format } from 'date-fns';
import { FileSpreadsheet, FileText, FileType } from 'lucide-react';
import { useEnterpriseMateriality } from '../../../hooks/useEnterpriseMateriality';

type PubDash = {
  review: { id: string; stage: string; publication_executed: boolean } | null;
  publication_ready: boolean;
  publication_executed: boolean;
  latest_record: {
    id: string;
    executed_at: string;
    efs_publication_packs?: { metadata: { title?: string } };
  } | null;
  artifacts: Array<{
    id: string;
    format: string;
    byte_size: number;
    generated_at: string;
  }>;
};

export default function WorkspacePublication({
  companyId,
  workspaceId,
  dashboard,
  generalInfo,
  v161DeploymentReady = true,
}: {
  companyId: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
  v161DeploymentReady?: boolean;
}) {
  const qc = useQueryClient();
  const { options: materialityOptions } = useEnterpriseMateriality(companyId);

  const dashQuery = useQuery({
    queryKey: ['efs_publication_dash', companyId, workspaceId],
    enabled: v161DeploymentReady,
    queryFn: () =>
      invokeFinancialStatements<PubDash>(companyId, 'GET_PUBLICATION_DASHBOARD', {
        workspace_id: workspaceId,
      }),
  });

  const docQuery = useQuery({
    queryKey: ['efs_doc_model', companyId, workspaceId],
    enabled: v161DeploymentReady,
    queryFn: async () => {
      await ensureGenericDocument({
        companyId,
        workspaceId,
        frameworkPackId: dashboard.framework?.id ?? null,
      });
      return loadDocumentModel({
        companyId,
        workspaceId,
        dashboard,
        generalInfo,
      });
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_publication_dash', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_doc_model', companyId, workspaceId] });
  };

  const filenameBase = () => {
    const title =
      generalInfo?.registered_name ||
      dashQuery.data?.latest_record?.efs_publication_packs?.metadata?.title ||
      docQuery.data?.workspaceName ||
      'Annual-Financial-Statements';
    return title.replace(/[^\w-]+/g, '-').slice(0, 60) || 'Annual-Financial-Statements';
  };

  const buildPackage = () => {
    if (!docQuery.data) throw new Error('Document model is not ready yet.');
    const overrides = loadOverrides(workspaceId);
    return buildCanonicalPublishPackage(docQuery.data, overrides, materialityOptions);
  };

  const execute = useMutation({
    mutationFn: async () => {
      // Archive via existing API (contract unchanged). Issued document = canonical package.
      await invokeFinancialStatements(companyId, 'EXECUTE_PUBLICATION', {
        workspace_id: workspaceId,
      });
      return buildPackage();
    },
    onSuccess: (pkg) => {
      showSuccess('Annual Financial Statements published from the live document');
      downloadBytes(pkg.pdfBytes, 'pdf', filenameBase());
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const downloadCanonical = useMutation({
    mutationFn: async (format: 'pdf' | 'docx') => {
      const pkg = buildPackage();
      return { format, pkg };
    },
    onSuccess: ({ format, pkg }) => {
      downloadBytes(format === 'pdf' ? pkg.pdfBytes : pkg.docxBytes, format, filenameBase());
      showSuccess(`Downloaded published ${format.toUpperCase()} (identical to live document)`);
    },
    onError: (e: Error) => showError(e.message),
  });

  const downloadArchive = useMutation({
    mutationFn: async (artifactId: string) => {
      const res = await invokeFinancialStatements<{
        artifact: { format: string };
        content_base64: string;
      }>(companyId, 'GET_PUBLICATION_ARTIFACT', { artifact_id: artifactId });
      return res;
    },
    onSuccess: (res) => {
      downloadBase64Artifact(res.content_base64, res.artifact.format, `${filenameBase()}-archive`);
      showSuccess(`Downloaded archive ${res.artifact.format.toUpperCase()}`);
    },
    onError: (e: Error) => showError(e.message),
  });

  const d = dashQuery.data;
  const canExecute = d?.publication_ready && !d?.publication_executed;
  const status = d?.publication_executed
    ? 'published'
    : d?.publication_ready
      ? 'publication_ready'
      : 'pending';

  const formatIcon = (fmt: string) => {
    if (fmt === 'pdf') return <FileText className="mr-2 h-4 w-4" />;
    if (fmt === 'docx' || fmt === 'word') return <FileType className="mr-2 h-4 w-4" />;
    return <FileSpreadsheet className="mr-2 h-4 w-4" />;
  };

  const formatLabel = (fmt: string) => {
    if (fmt === 'pdf') return 'PDF';
    if (fmt === 'docx' || fmt === 'word') return 'Word';
    if (fmt === 'xlsx' || fmt === 'excel') return 'Excel';
    return fmt.toUpperCase();
  };

  if (!v161DeploymentReady) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Publication blocked</CardTitle>
          <CardDescription>
            Version 16.1 Company Master Data infrastructure is not deployed. Publication is disabled
            until required migrations are applied.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Publication</CardTitle>
        <CardDescription>
          Published PDF and Word are generated from the exact same document as Live Preview —
          visibility, numbering, cross-references, and signatures included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={d?.publication_executed ? 'default' : 'secondary'}>
            {d?.publication_ready || d?.publication_executed
              ? publicationStatusLabel(status)
              : 'Not yet ready for publication'}
          </Badge>
          <Button
            disabled={!canExecute || execute.isPending || docQuery.isLoading}
            onClick={() => execute.mutate()}
          >
            {d?.publication_executed
              ? 'Already published'
              : execute.isPending
                ? 'Publishing…'
                : 'Publish live document (PDF)'}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Issued document (identical to preview)
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              disabled={downloadCanonical.isPending || !docQuery.data}
              onClick={() => downloadCanonical.mutate('pdf')}
            >
              <FileText className="mr-2 h-4 w-4" />
              Download Published PDF
            </Button>
            <Button
              variant="outline"
              disabled={downloadCanonical.isPending || !docQuery.data}
              onClick={() => downloadCanonical.mutate('docx')}
            >
              <FileType className="mr-2 h-4 w-4" />
              Download Published Word
            </Button>
          </div>
        </div>

        {d?.latest_record && (
          <p className="text-sm text-muted-foreground">
            Archive recorded {format(new Date(d.latest_record.executed_at), 'dd MMM yyyy HH:mm')} ·
            Engagement archive retained with this publication.
          </p>
        )}

        {(d?.artifacts || []).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Engagement archive (optional)
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(d?.artifacts || []).map((a) => (
                <Button
                  key={a.id}
                  variant="ghost"
                  disabled={downloadArchive.isPending}
                  onClick={() => downloadArchive.mutate(a.id)}
                >
                  {formatIcon(a.format)}
                  Archive {formatLabel(a.format)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {!d?.publication_ready && !d?.publication_executed && (
          <p className="text-sm text-muted-foreground">
            Complete manager and partner review before publication. You may still download a draft
            Published PDF/Word from the live document above.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
