/**
 * The assembled document, loaded once.
 *
 * The document workspace, the readiness review and the export view all need the
 * same model, and each used to build its own query. They shared a cache key, so
 * they mostly agreed — but "mostly" is not a property you want in the thing that
 * decides whether a set of financial statements is fit to issue.
 *
 * The model is composed from the workspace dashboard AND the entity's general
 * information, and those arrive on separate requests. The key used to name only
 * the company and the workspace, so whichever value general information had at
 * the moment of the first render was baked in for good — and on a cold open that
 * value is null. The page header re-rendered when the real details landed; the
 * cover did not, and printed the company's internal name where its registered
 * name belongs. The entity is part of what the model is, so it is part of the
 * key, and the model is not built until the entity has been asked for.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EfsDashboard, EfsWorkspaceGeneralInformation } from '../api';
import { ensureGenericDocument, loadDocumentModel, type DocumentModel } from './documentModel';

export function documentModelKey(companyId: string, workspaceId: string) {
  return ['efs_doc_model', companyId, workspaceId] as const;
}

/**
 * What the document would show differently if this entity changed. Invalidation
 * by prefix still matches, so callers can keep invalidating the shorter key.
 */
export function entityFingerprint(
  entity: EfsWorkspaceGeneralInformation | null | undefined,
): string {
  if (!entity) return 'no-entity';
  const e = entity as Record<string, unknown>;
  return [
    e.registered_name,
    e.trading_name,
    e.registration_number,
    e.reporting_framework,
    e.updated_at,
  ]
    .map((v) => (v == null ? '' : String(v)))
    .join('|');
}

export function useDocumentModel(params: {
  companyId: string;
  companyName?: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
  /**
   * Whether general information has been asked for and answered — successfully
   * or not. Building the document before then bakes in an entity of null.
   */
  generalInfoReady?: boolean;
}) {
  const { companyId, companyName, workspaceId, dashboard, generalInfo } = params;
  const generalInfoReady = params.generalInfoReady ?? true;
  const qc = useQueryClient();

  const query = useQuery<DocumentModel>({
    queryKey: [...documentModelKey(companyId, workspaceId), entityFingerprint(generalInfo)],
    enabled: !!companyId && !!workspaceId && generalInfoReady,
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
    // Still loading as far as callers are concerned while we wait for the
    // entity, so nothing renders a cover from a document that has no entity.
    isLoading: query.isLoading || !generalInfoReady,
    reload: () => qc.invalidateQueries({ queryKey: documentModelKey(companyId, workspaceId) }),
  };
}
