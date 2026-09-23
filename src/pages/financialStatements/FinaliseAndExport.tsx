import { useQuery } from '@tanstack/react-query';
import type {
  EfsDashboard,
  EfsWorkspaceGeneralInformation,
} from '../../lib/financialStatements/api';
import {
  ensureGenericDocument,
  loadDocumentModel,
} from '../../lib/financialStatements/document/documentModel';
import { useDocumentOverrides } from '../../lib/financialStatements/document/documentStore';
import DocumentPreview from './document/DocumentPreview';
import { Skeleton } from '../../components/ui/skeleton';

/**
 * The finished document, exactly as it will print.
 *
 * Preview and download come from the same builder, so what is on screen is the
 * file the user gets.
 */
export default function FinaliseAndExport({
  companyId,
  companyName,
  workspaceId,
  dashboard,
  generalInfo,
}: {
  companyId: string;
  companyName?: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
}) {
  const overridesApi = useDocumentOverrides(workspaceId);

  // Same key as the document workspace, so switching back and forth does not refetch.
  const modelQuery = useQuery({
    queryKey: ['efs_doc_model', companyId, workspaceId],
    queryFn: async () => {
      await ensureGenericDocument({
        companyId,
        workspaceId,
        frameworkPackId: dashboard.framework?.id ?? null,
      });
      return loadDocumentModel({ companyId, companyName, workspaceId, dashboard, generalInfo });
    },
  });

  if (modelQuery.isLoading) return <Skeleton className="h-[75vh] w-full" />;
  if (modelQuery.isError) {
    return (
      <p className="p-6 text-sm text-destructive">{(modelQuery.error as Error).message}</p>
    );
  }
  if (!modelQuery.data) return null;

  return (
    <div data-testid="afs-finalise">
      <DocumentPreview model={modelQuery.data} overrides={overridesApi.overrides} />
    </div>
  );
}
