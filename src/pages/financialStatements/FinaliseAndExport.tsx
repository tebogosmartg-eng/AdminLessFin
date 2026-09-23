import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen } from 'lucide-react';
import {
  invokeFinancialStatements,
  type EfsDashboard,
  type EfsWorkspaceGeneralInformation,
} from '../../lib/financialStatements/api';
import { useDocumentModel } from '../../lib/financialStatements/document/useDocumentModel';
import { useDocumentOverrides } from '../../lib/financialStatements/document/documentStore';
import { assessReadiness } from '../../lib/financialStatements/readiness';
import DocumentPreview from './document/DocumentPreview';
import { Skeleton } from '../../components/ui/skeleton';
import { Button } from '../../components/ui/button';
import { showError, showSuccess } from '../../utils/toast';

/**
 * The finished document, exactly as it will print — and the point at which it
 * stops being a draft.
 *
 * Preview and download come from the same builder, so what is on screen is the
 * file the user gets. Marking a set final freezes the accounting snapshot it was
 * built from, which is what makes the figures reproducible afterwards: the same
 * statements can be rendered again from the same sealed facts.
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
  const qc = useQueryClient();
  const overridesApi = useDocumentOverrides(workspaceId);
  const modelQuery = useDocumentModel({
    companyId,
    companyName,
    workspaceId,
    dashboard,
    generalInfo,
  });

  const version = dashboard.snapshot?.currentVersion ?? null;
  const locked = version?.status === 'frozen' || version?.status === 'publication_bound';

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });

  const finalise = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'FREEZE_SNAPSHOT_VERSION', {
        snapshot_version_id: version?.id,
      }),
    onSuccess: async () => {
      showSuccess('These financial statements are now final.');
      await refresh();
    },
    onError: (e: Error) => showError(e.message),
  });

  const reopen = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'CREATE_SNAPSHOT_DRAFT', {
        workspace_id: workspaceId,
        force_successor: true,
      }),
    onSuccess: async () => {
      showSuccess('Reopened as a new draft. The final version is kept.');
      await refresh();
    },
    onError: (e: Error) => showError(e.message),
  });

  if (modelQuery.isLoading) return <Skeleton className="h-[75vh] w-full" />;
  if (modelQuery.isError) {
    return (
      <p className="p-6 text-sm text-destructive">{(modelQuery.error as Error).message}</p>
    );
  }
  if (!modelQuery.data) return null;

  const readiness = assessReadiness(modelQuery.data);
  const blocked = readiness.state === 'blocked';

  return (
    <div className="space-y-4" data-testid="afs-finalise">
      <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium" data-testid="afs-final-state">
            {locked ? (
              <>
                <Lock className="h-4 w-4" />
                Final — version {version?.version_no}
              </>
            ) : (
              <>
                <LockOpen className="h-4 w-4 text-muted-foreground" />
                Draft — version {version?.version_no ?? 1}
              </>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {locked
              ? 'The accounting behind these statements is frozen. Reopening keeps this version and starts a new one.'
              : blocked
                ? 'These cannot be marked final while the Review tab reports a blocking problem.'
                : 'Marking these final freezes the accounting they were built from, so they can be reproduced exactly.'}
          </p>
        </div>
        {locked ? (
          <Button
            variant="outline"
            onClick={() => reopen.mutate()}
            disabled={reopen.isPending}
            data-testid="afs-reopen"
          >
            <LockOpen className="mr-2 h-4 w-4" />
            {reopen.isPending ? 'Reopening…' : 'Reopen for changes'}
          </Button>
        ) : (
          <Button
            onClick={() => finalise.mutate()}
            disabled={finalise.isPending || blocked || !version}
            data-testid="afs-finalise-action"
          >
            <Lock className="mr-2 h-4 w-4" />
            {finalise.isPending ? 'Finalising…' : 'Mark as final'}
          </Button>
        )}
      </div>

      <DocumentPreview model={modelQuery.data} overrides={overridesApi.overrides} />
    </div>
  );
}
