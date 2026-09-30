import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, LockOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
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
  generalInfoReady,
}: {
  companyId: string;
  companyName?: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
  /** General information has been asked for and answered. */
  generalInfoReady?: boolean;
}) {
  const qc = useQueryClient();
  const overridesApi = useDocumentOverrides(workspaceId, companyId);
  const modelQuery = useDocumentModel({
    companyId,
    companyName,
    workspaceId,
    dashboard,
    generalInfo,
    generalInfoReady,
  });

  const version = dashboard.snapshot?.currentVersion ?? null;
  const locked = version?.status === 'frozen' || version?.status === 'publication_bound';

  // The engagement's review workflow decides when a set may be finalised:
  // a draft becomes final only once the partner has approved it.
  const reviewQuery = useQuery({
    queryKey: ['efs_review_dash', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<{ stage?: string; review?: { stage?: string } }>(
        companyId,
        'GET_REVIEW_DASHBOARD',
        { workspace_id: workspaceId },
      ),
  });
  const stage = reviewQuery.data?.stage || reviewQuery.data?.review?.stage || 'draft';
  const STAGE_RANK: Record<string, number> = {
    draft: 0,
    rejected: 0,
    corrections: 1,
    validation_complete: 1,
    manager_review: 2,
    manager_approved: 3,
    partner_review: 4,
    partner_approved: 5,
    publication_ready: 6,
  };
  const rank = STAGE_RANK[stage] ?? 0;
  const approved = rank >= 5;

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

  // The engagement's path, in the words the profession uses for it.
  const ladder: Array<{ label: string; done: boolean; current: boolean }> = (() => {
    const steps = [
      { label: 'Draft', done: true },
      { label: 'Prepared', done: rank >= 1 },
      { label: 'Reviewed', done: rank >= 3 },
      { label: 'Approved', done: approved },
      { label: 'Finalised', done: locked },
    ];
    const firstOpen = steps.findIndex((s) => !s.done);
    return steps.map((s, i) => ({ ...s, current: i === (firstOpen === -1 ? steps.length - 1 : firstOpen) }));
  })();

  return (
    <div className="space-y-4" data-testid="afs-finalise">
      <ol className="flex flex-wrap items-center gap-1 rounded-md border p-3" data-testid="afs-status-ladder">
        {ladder.map((step, i) => (
          <li key={step.label} className="flex items-center gap-1">
            {i > 0 && <span className="mx-1 text-muted-foreground">→</span>}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                step.done
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : step.current
                    ? 'border-foreground/30 text-foreground'
                    : 'border-muted text-muted-foreground',
              )}
            >
              {step.done && <Check className="h-3 w-3" />}
              {step.label}
            </span>
          </li>
        ))}
      </ol>

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
                : !approved
                  ? 'These can be marked final once the partner has approved them on the Review tab.'
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
            disabled={finalise.isPending || blocked || !version || !approved}
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
