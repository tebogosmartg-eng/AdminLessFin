import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  invokeFinancialStatements,
  type EfsDashboard,
  type EfsEngagementGeneralInformation,
  type EfsStatementInstance,
} from '../../lib/financialStatements/api';
import {
  efsDeferredCapabilities,
  efsFlags,
  isFinancialStatementsInternalPersona,
} from '../../lib/financialStatements/flags';
import { workspaceStatusLabel } from '../../lib/financialStatements/presentation';
import { corporateDisplayFromEntity } from '../../lib/financialStatements/corporateInformation/accessors';
import {
  verifyV161Deployment,
  type DeploymentReadinessReport,
} from '../../lib/financialStatements/masterData';
import {
  GENERATION_COPY,
  accountantPrepareErrorMessage,
} from '../../lib/financialStatements/generationExperience';
import { useAccountingChangesDetected } from '../../hooks/useAccountingChangesDetected';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ArrowLeft, Snowflake, ShieldCheck, Database, FileSpreadsheet } from 'lucide-react';
import { showError, showSuccess } from '../../utils/toast';
import CloseEvidencePanel from './CloseEvidencePanel';
import DisclosurePanel from './DisclosurePanel';
import ValidationPanel from './ValidationPanel';
import ReviewWorkflowPanel from './ReviewWorkflowPanel';
import PublicationPanel from './PublicationPanel';
import EngagementOverview from './experience/EngagementOverview';
import EngagementInformation from './experience/EngagementInformation';
import EngagementStatements from './experience/EngagementStatements';
import EngagementWorkingPapers from './experience/EngagementWorkingPapers';
import EngagementNotesDisclosures from './experience/EngagementNotesDisclosures';
import EngagementValidation from './experience/EngagementValidation';
import EngagementReview from './experience/EngagementReview';
import EngagementPublication from './experience/EngagementPublication';
import EngagementDocumentWorkspace from './experience/EngagementDocumentWorkspace';
import AccountingChangesBanner from '../../components/financialClose/AccountingChangesBanner';
import TrialBalanceSourcePanel from './TrialBalanceSourcePanel';
import V161DeploymentDiagnostics from './experience/V161DeploymentDiagnostics';

type FrameworkPack = {
  id: string;
  framework_key: string;
  version_id: string;
  label: string;
};

const ACCOUNTANT_NAV: Array<{ value: string; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'information', label: 'Information' },
  { value: 'trial-balance', label: 'Trial Balance' },
  { value: 'statements', label: 'Financial Statements' },
  { value: 'supporting-schedules', label: 'Supporting Schedules' },
  { value: 'notes', label: 'Notes & Disclosures' },
  { value: 'validation', label: 'Validation' },
  { value: 'review', label: 'Review' },
  { value: 'publication', label: 'Publication' },
];

/**
 * V6.10.1 Engagement workspace — accountant generation experience.
 * Reporting Snapshot / pipeline tools only when VITE_EFS_DEVELOPER_TOOLS=true.
 */
export default function FinancialStatementsWorkspaceDashboard() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { activeCompany, role, session, profile } = useAuth();
  const qc = useQueryClient();
  const companyId = activeCompany?.id;
  const [packId, setPackId] = useState('');
  const [activeNav, setActiveNav] = useState('overview');

  const showAdvanced =
    efsFlags.developerTools() &&
    isFinancialStatementsInternalPersona({
      role,
      userEmail: session?.user?.email,
      userId: session?.user?.id || profile?.id,
    });

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

  const deploymentQuery = useQuery({
    queryKey: ['efs_v161_deployment', companyId],
    queryFn: () => verifyV161Deployment(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
    retry: false,
  });

  const packsQuery = useQuery({
    queryKey: ['efs_framework_packs', companyId],
    queryFn: () => invokeFinancialStatements<FrameworkPack[]>(companyId!, 'LIST_FRAMEWORK_PACKS'),
    enabled: !!companyId && showAdvanced,
  });

  const statementsQuery = useQuery({
    queryKey: ['efs_statements', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<{ live_gl: boolean; statements: EfsStatementInstance[] }>(
        companyId!,
        'GET_STATEMENTS',
        { workspace_id: workspaceId },
      ),
    enabled: !!companyId && !!workspaceId && showAdvanced,
  });

  const closeEvidenceQuery = useQuery({
    queryKey: ['efs_close_evidence', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<{
        working_papers: Array<{ status: string }>;
        open_review_notes: number;
      }>(companyId!, 'GET_CLOSE_EVIDENCE_DASHBOARD', { workspace_id: workspaceId }),
    enabled: !!companyId && !!workspaceId && efsFlags.workingPaperPlatform(),
  });

  const outstandingWorkingPapers = (closeEvidenceQuery.data?.working_papers || []).filter(
    (wp) => !['final', 'closed', 'reviewed'].includes((wp.status || '').toLowerCase()),
  ).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });
  };

  const bindMutation = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId!, 'BIND_FRAMEWORK', {
        framework_pack_id: packId,
        reporting_period_id: dashQuery.data?.reportingPeriod?.id,
        workspace_id: workspaceId,
      }),
    onSuccess: () => {
      showSuccess('Framework bound');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const createDraftMutation = useMutation({
    mutationFn: () =>
      invokeFinancialStatements<{ snapshot_id: string; version: { id: string } }>(
        companyId!,
        'CREATE_SNAPSHOT_DRAFT',
        { workspace_id: workspaceId },
      ),
    onSuccess: () => {
      showSuccess('Draft Snapshot Version created');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const extractMutation = useMutation({
    mutationFn: async () => {
      let versionId = dashQuery.data?.snapshot?.currentVersion?.id;
      if (!versionId || dashQuery.data?.snapshot?.currentVersion?.status === 'frozen') {
        const draft = await invokeFinancialStatements<{ version: { id: string } }>(
          companyId!,
          'CREATE_SNAPSHOT_DRAFT',
          {
            workspace_id: workspaceId,
            force_successor: dashQuery.data?.snapshot?.currentVersion?.status === 'frozen',
          },
        );
        versionId = draft.version.id;
      }
      return invokeFinancialStatements(companyId!, 'EXTRACT_FACT_SNAPSHOT', {
        snapshot_version_id: versionId,
        workspace_id: workspaceId,
      });
    },
    onSuccess: () => {
      showSuccess('Fact Snapshot sealed from Accounting');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const certifyMutation = useMutation({
    mutationFn: () => {
      const versionId = dashQuery.data?.snapshot?.currentVersion?.id;
      if (!versionId) throw new Error('No Snapshot Version');
      return invokeFinancialStatements(companyId!, 'CERTIFY_SNAPSHOT_VERSION', {
        snapshot_version_id: versionId,
      });
    },
    onSuccess: () => {
      showSuccess('Snapshot Version certified');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const freezeMutation = useMutation({
    mutationFn: () => {
      const versionId = dashQuery.data?.snapshot?.currentVersion?.id;
      if (!versionId) throw new Error('No Snapshot Version');
      return invokeFinancialStatements(companyId!, 'FREEZE_SNAPSHOT_VERSION', {
        snapshot_version_id: versionId,
      });
    },
    onSuccess: () => {
      showSuccess('Snapshot Version frozen');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId!, 'GENERATE_STATEMENTS', {
        workspace_id: workspaceId,
        snapshot_version_id: dashQuery.data?.snapshot?.currentVersion?.id,
      }),
    onSuccess: () => {
      showSuccess('Statements generated from Reporting Snapshot');
      invalidate();
      qc.invalidateQueries({ queryKey: ['efs_statements', companyId, workspaceId] });
    },
    onError: (e: Error) => showError(e.message),
  });

  /**
   * Silent orchestration for accountant Generate / Refresh.
   * Chains certified APIs (trial balance capture → statements → checks).
   * Accountant never sees snapshot / seal / certify steps.
   */
  const prepareStatements = useMutation({
    mutationFn: async (mode: 'generate' | 'refresh') => {
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
      if (!versionId) {
        throw new Error('Draft version was not returned after CREATE_SNAPSHOT_DRAFT.');
      }
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
      return mode;
    },
    onSuccess: (mode) => {
      showSuccess(mode === 'generate' ? GENERATION_COPY.successGenerate : GENERATION_COPY.successRefresh);
      invalidate();
      qc.invalidateQueries({ queryKey: ['efs_statements', companyId, workspaceId] });
      qc.invalidateQueries({ queryKey: ['efs_validation_dash', companyId, workspaceId] });
      qc.invalidateQueries({ queryKey: ['efcp_period_readiness'] });
    },
    onError: (e: Error) => showError(accountantPrepareErrorMessage(e)),
  });

  /** EFCP V6.8.0 banner — same silent chain as accountant Refresh. */
  const refreshFromAccounting = {
    isPending: prepareStatements.isPending,
    mutate: () => prepareStatements.mutate('refresh'),
  };

  const capturedAt =
    dashQuery.data?.snapshot?.currentVersion?.certified_at ||
    dashQuery.data?.snapshot?.currentVersion?.frozen_at ||
    null;

  const accountingChanges = useAccountingChangesDetected({
    companyId,
    startDate: dashQuery.data?.reportingPeriod?.start_date,
    endDate: dashQuery.data?.reportingPeriod?.end_date,
    capturedAt,
  });

  if (dashQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (dashQuery.isError || !dashQuery.data) {
    return (
      <div className="whitespace-pre-line p-6 text-sm text-destructive">
        {(dashQuery.error as Error)?.message || 'Engagement not found'}
      </div>
    );
  }

  const d = dashQuery.data;
  const version = d.snapshot?.currentVersion;
  const pipelineOn = efsFlags.snapshotPipeline();
  const generalInfo = generalInfoQuery.data;
  const deploymentReport: DeploymentReadinessReport | undefined = deploymentQuery.data;
  const v161Ready = deploymentReport?.readiness === 'PASS';
  const v161Blocked =
    deploymentQuery.isSuccess && deploymentReport?.readiness !== 'PASS';

  const documentWorkspaceEnabled = efsFlags.documentWorkspace();
  const navItems = documentWorkspaceEnabled
    ? [
        ...ACCOUNTANT_NAV.slice(0, 4),
        { value: 'document', label: 'Document' },
        ...ACCOUNTANT_NAV.slice(4),
      ]
    : ACCOUNTANT_NAV;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          to="/financial-statements-workspace"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          All engagements
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{d.workspace.name}</h1>
            <p className="text-sm text-muted-foreground">
              {d.reportingPeriod?.label || 'Annual Financial Statements'}
              {generalInfo
                ? (() => {
                    const name = corporateDisplayFromEntity(generalInfo).registeredName;
                    return name ? ` · ${name}` : '';
                  })()
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {deploymentQuery.isSuccess && (
              <Badge variant={v161Ready ? 'default' : 'destructive'}>
                V16.1 {v161Ready ? 'READY' : 'NOT READY'}
              </Badge>
            )}
            <Badge variant="outline">{workspaceStatusLabel(d.workspace.status)}</Badge>
          </div>
        </div>
      </div>

      {v161Blocked && deploymentReport && (
        <V161DeploymentDiagnostics report={deploymentReport} />
      )}

      {companyId && (
        <AccountingChangesBanner
          companyId={companyId}
          startDate={d.reportingPeriod?.start_date}
          endDate={d.reportingPeriod?.end_date}
          capturedAt={capturedAt}
          refreshing={refreshFromAccounting.isPending}
          onRefresh={() => refreshFromAccounting.mutate()}
        />
      )}

      <Tabs value={activeNav} onValueChange={setActiveNav} className="space-y-4">
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-56 lg:shrink-0">
            <nav aria-label="Engagement navigation" className="sticky top-4">
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Engagement
              </p>
              <TabsList className="flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0">
                {navItems.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="justify-start px-3 py-2 data-[state=active]:bg-muted"
                  >
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </nav>
          </aside>

          <div className="min-w-0 flex-1">
            <TabsContent value="overview" className="mt-0">
              <EngagementOverview
                dashboard={d}
                generalInfo={generalInfo}
                outstandingWorkingPapers={outstandingWorkingPapers}
                onNavigate={setActiveNav}
              />
            </TabsContent>

            <TabsContent value="information" className="mt-0">
              {v161Blocked && deploymentReport ? (
                <V161DeploymentDiagnostics report={deploymentReport} />
              ) : (
                companyId &&
                workspaceId && (
                  <EngagementInformation
                    companyId={companyId}
                    workspaceId={workspaceId}
                    generalInfo={generalInfo}
                    frameworkLabel={d.framework?.label || d.framework?.efs_frameworks?.name}
                    v161DeploymentReady={v161Ready}
                  />
                )
              )}
            </TabsContent>

            <TabsContent value="trial-balance" className="mt-0">
              {companyId && workspaceId ? (
                <TrialBalanceSourcePanel
                  companyId={companyId}
                  workspaceId={workspaceId}
                  reportingPeriodId={d.reportingPeriod?.id ?? null}
                  frameworkPackId={d.framework?.id ?? null}
                  snapshotVersionId={d.snapshot?.currentVersion?.id ?? null}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Select a company to manage Trial Balance sources.</p>
              )}
            </TabsContent>

            <TabsContent value="statements" className="mt-0">
              {companyId && workspaceId && (
                <EngagementStatements
                  companyId={companyId}
                  workspaceId={workspaceId}
                  generalInfo={generalInfo}
                  periodLabel={d.reportingPeriod?.label}
                  preparing={prepareStatements.isPending}
                  accountingChanged={accountingChanges.accountingChanged}
                  onGenerate={() => prepareStatements.mutate('generate')}
                  onRefresh={() => prepareStatements.mutate('refresh')}
                  onOpenSupportingSchedules={() => setActiveNav('supporting-schedules')}
                  onOpenReviewNotes={() => setActiveNav('notes')}
                  onOpenPublication={() => setActiveNav('publication')}
                />
              )}
            </TabsContent>

            {documentWorkspaceEnabled && (
              <TabsContent value="document" className="mt-0">
                {v161Blocked && deploymentReport ? (
                  <V161DeploymentDiagnostics report={deploymentReport} />
                ) : (
                  companyId &&
                  workspaceId && (
                    <EngagementDocumentWorkspace
                      companyId={companyId}
                      workspaceId={workspaceId}
                      dashboard={d}
                      generalInfo={generalInfo ?? null}
                    />
                  )
                )}
              </TabsContent>
            )}

            <TabsContent value="supporting-schedules" className="mt-0">
              {companyId && workspaceId && efsFlags.workingPaperPlatform() ? (
                <EngagementWorkingPapers companyId={companyId} workspaceId={workspaceId} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Supporting schedules are not enabled.
                </p>
              )}
            </TabsContent>

            <TabsContent value="notes" className="mt-0">
              {companyId && workspaceId && efsFlags.disclosurePlatform() ? (
                <EngagementNotesDisclosures
                  companyId={companyId}
                  workspaceId={workspaceId}
                  frameworkPackId={d.framework?.id ?? null}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Notes &amp; disclosures are not enabled.
                </p>
              )}
            </TabsContent>

            <TabsContent value="validation" className="mt-0">
              {companyId && workspaceId && efsFlags.validationPlatform() ? (
                <EngagementValidation
                  companyId={companyId}
                  workspaceId={workspaceId}
                  frameworkPackId={d.framework?.id ?? null}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Validation is not enabled.</p>
              )}
            </TabsContent>

            <TabsContent value="review" className="mt-0">
              {companyId && workspaceId && efsFlags.reviewWorkflow() ? (
                <EngagementReview companyId={companyId} workspaceId={workspaceId} />
              ) : (
                <p className="text-sm text-muted-foreground">Review is not enabled.</p>
              )}
            </TabsContent>

            <TabsContent value="publication" className="mt-0">
              {v161Blocked && deploymentReport ? (
                <V161DeploymentDiagnostics report={deploymentReport} />
              ) : companyId && workspaceId && efsFlags.publicationPlatform() ? (
                <EngagementPublication
                  companyId={companyId}
                  workspaceId={workspaceId}
                  dashboard={d}
                  generalInfo={generalInfo ?? null}
                  v161DeploymentReady={v161Ready}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Publication is not enabled.</p>
              )}
            </TabsContent>
          </div>
        </div>
      </Tabs>

      {showAdvanced && (
        <Accordion type="single" collapsible className="border rounded-md px-4">
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="text-sm">
              Advanced (internal tools — Reporting Snapshot pipeline)
            </AccordionTrigger>
            <AccordionContent className="space-y-6 pb-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Snapshot Status</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {d.snapshot ? (
                      <div className="space-y-1">
                        <Badge>{d.snapshot.status}</Badge>
                        {version && (
                          <div className="text-muted-foreground">
                            v{version.version_no} · {version.status}
                            {version.content_hash ? ` · ${version.content_hash.slice(0, 12)}…` : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No snapshot yet</span>
                    )}
                  </CardContent>
                </Card>
                {efsDeferredCapabilities.publication() && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Publication (internal)</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      <Badge variant="secondary">{d.publicationStatus.status}</Badge>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Setup</CardTitle>
                  <CardDescription>
                    Bind framework and manage Reporting Snapshots (internal pipeline).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                      <div className="text-sm font-medium">Bind / change framework pack</div>
                      <Select value={packId} onValueChange={setPackId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select pack" />
                        </SelectTrigger>
                        <SelectContent>
                          {(packsQuery.data || []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!packId || bindMutation.isPending}
                      onClick={() => bindMutation.mutate()}
                    >
                      Save framework
                    </Button>
                  </div>

                  {pipelineOn && (
                    <div className="flex flex-wrap gap-2 border-t pt-4">
                      <Button
                        variant="outline"
                        disabled={createDraftMutation.isPending}
                        onClick={() => createDraftMutation.mutate()}
                      >
                        <Database className="mr-2 h-4 w-4" />
                        New draft version
                      </Button>
                      <Button
                        disabled={extractMutation.isPending}
                        onClick={() => extractMutation.mutate()}
                      >
                        <Database className="mr-2 h-4 w-4" />
                        Extract &amp; seal facts
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!version || version.status !== 'draft' || certifyMutation.isPending}
                        onClick={() => certifyMutation.mutate()}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Certify
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={
                          !version || version.status !== 'certified' || freezeMutation.isPending
                        }
                        onClick={() => freezeMutation.mutate()}
                      >
                        <Snowflake className="mr-2 h-4 w-4" />
                        Freeze
                      </Button>
                    </div>
                  )}

                  <Button
                    disabled={!d.statementPreparationEnabled || generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Generate from snapshot
                  </Button>

                  {(statementsQuery.data?.statements || []).length > 0 && (
                    <div className="rounded-md border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left">
                            <th className="px-3 py-2">Statement</th>
                            <th className="px-3 py-2">Generated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statementsQuery.data!.statements.map((s) => (
                            <tr key={s.statement_type} className="border-b last:border-0">
                              <td className="px-3 py-2">{s.title}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {format(new Date(s.generated_at), 'dd MMM yyyy HH:mm')}
                                {s.provenance?.live_gl === false && (
                                  <span className="ml-2 text-xs">live_gl=false</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {companyId && workspaceId && efsFlags.workingPaperPlatform() && (
                <CloseEvidencePanel companyId={companyId} workspaceId={workspaceId} />
              )}
              {companyId && workspaceId && efsFlags.disclosurePlatform() && (
                <DisclosurePanel
                  companyId={companyId}
                  workspaceId={workspaceId}
                  frameworkPackId={d.framework?.id ?? null}
                />
              )}
              {companyId && workspaceId && efsFlags.validationPlatform() && (
                <ValidationPanel
                  companyId={companyId}
                  workspaceId={workspaceId}
                  frameworkPackId={d.framework?.id ?? null}
                />
              )}
              {companyId && workspaceId && efsFlags.reviewWorkflow() && (
                <ReviewWorkflowPanel companyId={companyId} workspaceId={workspaceId} />
              )}
              {companyId && workspaceId && efsFlags.publicationPlatform() && (
                <PublicationPanel companyId={companyId} workspaceId={workspaceId} />
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
