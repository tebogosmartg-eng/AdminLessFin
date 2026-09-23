import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import {
  invokeFinancialStatements,
  type EfsDashboard,
  type EfsEngagementGeneralInformation,
} from '../../lib/financialStatements/api';
import { corporateDisplayFromEntity } from '../../lib/financialStatements/corporateInformation/accessors';
import {
  isLegacyKeepAcknowledged,
  resolveEngagementReportingPeriod,
} from '../../lib/financialStatements/calendarYearBinding';
import { accountantPrepareErrorMessage } from '../../lib/financialStatements/generationExperience';
import { useAccountingChangesDetected } from '../../hooks/useAccountingChangesDetected';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { showError, showSuccess } from '../../utils/toast';
import EngagementDocumentWorkspace from './experience/EngagementDocumentWorkspace';
import EngagementValidation from './experience/EngagementValidation';
import EngagementReview from './experience/EngagementReview';
import LegacyEngagementMigrationCard from './experience/LegacyEngagementMigrationCard';
import FinaliseAndExport from './FinaliseAndExport';
import { cn } from '../../lib/utils';

/**
 * The financial statements themselves.
 *
 * This page used to be a workflow console: ten tabs down the left — Overview,
 * Information, Trial Balance, Financial Statements, Document, Supporting
 * Schedules, Notes & Disclosures, Validation, Review, Publication — opening on
 * an eleven-step checklist that told the reader to "Use RUN_VALIDATION /
 * GET_VALIDATION_DASHBOARD". None of that is the document.
 *
 * Now the document is the page. The navigator on the left is the statement
 * structure; the middle is the page being read or edited; there are two other
 * modes, for checking the statements and for printing them.
 */
export default function FinancialStatementsWorkspaceDashboard() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { activeCompany } = useAuth();
  const { financialYears, activeFinancialYear } = useReportingPeriod();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const companyId = activeCompany?.id;
  const [mode, setMode] = useState('document');
  const [legacyDismissed, setLegacyDismissed] = useState(false);
  const autoPrepared = useRef(false);

  const dashQuery = useQuery({
    queryKey: ['efs_dashboard', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<EfsDashboard>(companyId!, 'GET_WORKSPACE_DASHBOARD', {
        workspace_id: workspaceId,
      }),
    enabled: !!companyId && !!workspaceId,
  });

  const generalInfoQuery = useQuery({
    queryKey: ['efs_engagement_gi', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<EfsEngagementGeneralInformation | null>(
        companyId!,
        'GET_WORKSPACE_GENERAL_INFORMATION',
        { workspace_id: workspaceId },
      ),
    enabled: !!companyId && !!workspaceId,
    retry: false,
  });

  const statementsQuery = useQuery({
    queryKey: ['efs_statements', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<{ statements: Array<{ id: string }> }>(
        companyId!,
        'GET_STATEMENTS',
        { workspace_id: workspaceId },
      ),
    enabled: !!companyId && !!workspaceId,
  });

  useEffect(() => {
    setLegacyDismissed(isLegacyKeepAcknowledged(dashQuery.data?.reportingPeriod?.id));
  }, [dashQuery.data?.reportingPeriod?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_statements', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_doc_model', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_validation_dash', companyId, workspaceId] });
  };

  /**
   * Build the statements from the accounting records. The snapshot, seal,
   * certify and generate steps are the engine's business, not the reader's.
   */
  const prepare = useMutation({
    mutationFn: async () => {
      const currentStatus = dashQuery.data?.snapshot?.currentVersion?.status;
      const draft = await invokeFinancialStatements<{ version: { id: string } }>(
        companyId!,
        'CREATE_SNAPSHOT_DRAFT',
        {
          workspace_id: workspaceId,
          force_successor:
            currentStatus === 'frozen' || currentStatus === 'publication_bound' ? true : undefined,
        },
      );
      const versionId = draft.version?.id;
      if (!versionId) throw new Error('The accounting snapshot could not be started.');
      await invokeFinancialStatements(companyId!, 'EXTRACT_FACT_SNAPSHOT', {
        snapshot_version_id: versionId,
        workspace_id: workspaceId,
      });
      await invokeFinancialStatements(companyId!, 'CERTIFY_SNAPSHOT_VERSION', {
        snapshot_version_id: versionId,
      });
      await invokeFinancialStatements(companyId!, 'GENERATE_STATEMENTS', {
        workspace_id: workspaceId,
        snapshot_version_id: versionId,
      });
      await invokeFinancialStatements(companyId!, 'RUN_VALIDATION', {
        workspace_id: workspaceId,
        framework_pack_id: dashQuery.data?.framework?.id ?? undefined,
        run_type: 'full',
      });
    },
    onSuccess: () => {
      showSuccess('Financial statements updated from your accounting records.');
      invalidate();
    },
    onError: (e: Error) => showError(accountantPrepareErrorMessage(e)),
  });

  const hasStatements = (statementsQuery.data?.statements || []).length > 0;

  // First time in: build the statements rather than showing a checklist about
  // building them. Runs once, and only when there is nothing to show.
  useEffect(() => {
    if (
      !autoPrepared.current &&
      dashQuery.isSuccess &&
      statementsQuery.isSuccess &&
      !hasStatements &&
      !prepare.isPending
    ) {
      autoPrepared.current = true;
      prepare.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashQuery.isSuccess, statementsQuery.isSuccess, hasStatements]);

  // The financial year in the header is the one context for the whole app. If it
  // moves off the year these statements belong to, leaving them on screen would
  // show one year's figures under another year's heading, so the page steps back
  // and the landing opens the right year's statements.
  const documentYearId = dashQuery.data?.reportingPeriod?.financial_year_id ?? null;
  const yearMismatch =
    !!documentYearId && !!activeFinancialYear && documentYearId !== activeFinancialYear.id;
  useEffect(() => {
    if (yearMismatch) navigate('/financial-statements-workspace', { replace: true });
  }, [yearMismatch, navigate]);

  const capturedAt =
    dashQuery.data?.snapshot?.currentVersion?.certified_at ||
    dashQuery.data?.snapshot?.currentVersion?.frozen_at ||
    null;

  const accountingChanged = useAccountingChangesDetected({
    companyId,
    startDate: dashQuery.data?.reportingPeriod?.start_date,
    endDate: dashQuery.data?.reportingPeriod?.end_date,
    capturedAt,
  });

  if (dashQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-[70vh] w-full" />
      </div>
    );
  }

  if (dashQuery.isError || !dashQuery.data) {
    return (
      <div className="whitespace-pre-line p-6 text-sm text-destructive">
        {(dashQuery.error as Error)?.message || 'These financial statements could not be opened.'}
      </div>
    );
  }

  const d = dashQuery.data;
  const generalInfo = generalInfoQuery.data ?? null;
  const fy = resolveEngagementReportingPeriod(d.reportingPeriod, financialYears, activeFinancialYear);
  // "Reporting Entity" is the default entity name the module creates, not a
  // company's registered name — showing it as the heading reads as a placeholder.
  const rawName = corporateDisplayFromEntity(generalInfo).registeredName;
  const registeredName =
    rawName && rawName.trim().toLowerCase() !== 'reporting entity' ? rawName : null;
  const preparing = prepare.isPending;

  const MODES = [
    { value: 'document', label: 'Document' },
    { value: 'review', label: 'Review' },
    { value: 'finalise', label: 'Finalise & Export' },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6">
      {/* Who and when. Nothing else belongs in a document header. */}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/financial-statements-workspace"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Financial Statements
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
            {registeredName || activeCompany?.name || 'Annual Financial Statements'}
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="afs-period">
            {fy.displayLabel}
            {fy.isHistorical ? ' · not the current financial year' : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => prepare.mutate()}
          disabled={preparing}
          data-testid="afs-update"
        >
          {preparing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Update from accounting
        </Button>
      </div>

      {accountingChanged && !preparing && (
        <p className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Your accounting records have changed since these statements were built. Update from
          accounting to bring them in.
        </p>
      )}

      {fy.isLegacyUnbound && companyId && (
        <LegacyEngagementMigrationCard
          companyId={companyId}
          workspaceId={d.workspace.id}
          workspaceStatus={d.workspace.status}
          period={d.reportingPeriod}
          financialYears={financialYears}
          dismissed={legacyDismissed}
          onDismissed={() => setLegacyDismissed(true)}
          onMigrated={() => {
            setLegacyDismissed(false);
            invalidate();
          }}
        />
      )}

      {preparing && !hasStatements ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 rounded-md border">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Building your financial statements from your accounting records…
          </p>
        </div>
      ) : (
        <Tabs value={mode} onValueChange={setMode} className="min-w-0 space-y-4">
          <TabsList className="h-auto w-fit gap-1 bg-muted/40 p-1">
            {MODES.map((m) => (
              <TabsTrigger
                key={m.value}
                value={m.value}
                className={cn('px-4 py-1.5 text-sm')}
                data-testid={`afs-mode-${m.value}`}
              >
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="document" className="mt-0 min-w-0">
            {companyId && workspaceId && (
              <EngagementDocumentWorkspace
                companyId={companyId}
                workspaceId={workspaceId}
                dashboard={d}
                generalInfo={generalInfo}
              />
            )}
          </TabsContent>

          <TabsContent value="review" className="mt-0 min-w-0 space-y-6">
            {companyId && workspaceId && (
              <>
                <EngagementValidation
                  companyId={companyId}
                  workspaceId={workspaceId}
                  frameworkPackId={d.framework?.id ?? null}
                />
                <EngagementReview companyId={companyId} workspaceId={workspaceId} />
              </>
            )}
          </TabsContent>

          <TabsContent value="finalise" className="mt-0 min-w-0">
            {companyId && workspaceId && (
              <FinaliseAndExport
                companyId={companyId}
                workspaceId={workspaceId}
                dashboard={d}
                generalInfo={generalInfo}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
