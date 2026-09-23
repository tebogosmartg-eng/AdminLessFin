/**
 * The assembled document, loaded once.
 *
 * The document workspace, the readiness review and the export view all need the
 * same model, and each used to build its own query. They shared a cache key, so
 * they mostly agreed — but "mostly" is not a property you want in the thing that
 * decides whether a set of financial statements is fit to issue.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EfsDashboard, EfsWorkspaceGeneralInformation } from '../api';
import { ensureGenericDocument, loadDocumentModel, type DocumentModel } from './documentModel';

export function documentModelKey(companyId: string, workspaceId: string) {
  return ['efs_doc_model', companyId, workspaceId] as const;
}

export function useDocumentModel(params: {
  companyId: string;
  companyName?: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
}) {
  const { companyId, companyName, workspaceId, dashboard, generalInfo } = params;
  const qc = useQueryClient();

  const query = useQuery<DocumentModel>({
    queryKey: documentModelKey(companyId, workspaceId),
    queryFn: async () => {
      await ensureGenericDocument({
        companyId,
        workspaceId,
        frameworkPackId: dashboard.framework?.id ?? null,
      });
      return loadDocumentModel({ companyId, companyName, workspaceId, dashboard, generalInfo });
    },
  });

  return {
    ...query,
    reload: () => qc.invalidateQueries({ queryKey: documentModelKey(companyId, workspaceId) }),
  };
}
