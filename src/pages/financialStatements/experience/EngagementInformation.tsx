/**
 * V16.1 — Enterprise Corporate Information Workspace (navigation hub).
 *
 * Displays hydrated corporate information and routes to authoritative master data modules.
 * This workspace never owns data — it composes and navigates.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  MapPin,
  Receipt,
  Shield,
  Users,
  Landmark,
  Briefcase,
  CalendarClock,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import type { EfsWorkspaceGeneralInformation } from '../../../lib/financialStatements/api';
import {
  getCompanyMasterData,
  MASTER_DATA_MODULE_LABELS,
  type MasterDataModuleId,
} from '../../../lib/financialStatements/masterData';
import { provideCorporateInformation } from '../../../lib/financialStatements/corporateInformation';
import type { DocumentModel } from '../../../lib/financialStatements/document/documentModel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { MasterDataModuleRouter } from './masterData/modules';

type HubCard = {
  id: MasterDataModuleId | 'engagement';
  title: string;
  description: string;
  icon: React.ReactNode;
  complete: boolean;
  summary: string;
  actionLabel: string;
};

function isComplete(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return !!value.trim();
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(isComplete);
  return false;
}

export default function WorkspaceInformation({
  companyId,
  workspaceId,
  generalInfo,
  frameworkLabel,
  v161DeploymentReady = true,
}: {
  companyId: string;
  workspaceId: string;
  generalInfo?: EfsWorkspaceGeneralInformation | null;
  frameworkLabel?: string;
  /** When false, master data modules must not load fabricated data. */
  v161DeploymentReady?: boolean;
}) {
  const [activeModule, setActiveModule] = useState<MasterDataModuleId | 'engagement' | null>(null);
  const navigate = useNavigate();

  // Phase G3.7 — Master Data Consolidation. Company master data is now
  // maintained in the Settings Enterprise Administration Centre. This
  // workspace is read-only navigation for those seven modules: their cards
  // deep-link to Settings rather than editing in place. Only Engagement &
  // Approval configuration — genuinely per reporting workspace, not company
  // master data — is still edited inline here.
  const openModule = (id: MasterDataModuleId | 'engagement') => {
    if (id === 'engagement') {
      setActiveModule('engagement');
      return;
    }
    navigate(`/settings?tab=master-data&module=${id}`);
  };

  const masterQuery = useQuery({
    queryKey: ['efs_company_master_data', companyId],
    queryFn: () => getCompanyMasterData(companyId),
    enabled: !!companyId && v161DeploymentReady,
    retry: false,
  });

  const corporateModel = useMemo(() => {
    if (!generalInfo) return null;
    const stub: DocumentModel = {
      companyId,
      workspaceId,
      workspaceName: '',
      frameworkPackId: null,
      frameworkKey: null,
      frameworkLabel: frameworkLabel || generalInfo.reporting_framework || 'IFRS for SMEs',
      entity: generalInfo,
      period: {
        label: generalInfo.financial_year_end || undefined,
        end_date: undefined,
      },
      statements: [],
      policySets: [],
      notes: [],
      crossReferences: [],
      signatures: [],
      trialBalanceCaptured: false,
    };
    return provideCorporateInformation(stub);
  }, [companyId, workspaceId, generalInfo, frameworkLabel]);

  if (activeModule) {
    if (!v161DeploymentReady) {
      return (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Company Master Data disabled</CardTitle>
            <CardDescription>
              Version 16.1 infrastructure is not deployed. Master data modules cannot open until
              required migrations are applied.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => setActiveModule(null)}>
              Back
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <MasterDataModuleRouter
        moduleId={activeModule}
        companyId={companyId}
        workspaceId={workspaceId}
        generalInfo={generalInfo}
        onBack={() => setActiveModule(null)}
      />
    );
  }

  if (masterQuery.isError) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Deployment Status — NOT READY</CardTitle>
          <CardDescription className="whitespace-pre-wrap font-mono text-xs">
            {(masterQuery.error as Error)?.message ||
              'Company Master Data infrastructure is not available.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const master = masterQuery.data;
  const cards: HubCard[] = [
    {
      id: 'company_profile',
      title: MASTER_DATA_MODULE_LABELS.company_profile.title,
      description: MASTER_DATA_MODULE_LABELS.company_profile.description,
      icon: <Building2 className="h-5 w-5" />,
      complete: isComplete(master?.company_profile),
      summary: corporateModel?.entityIdentity.registeredName.formatted || 'Not configured',
      actionLabel: 'Manage in Settings',
    },
    {
      id: 'addresses',
      title: MASTER_DATA_MODULE_LABELS.addresses.title,
      description: MASTER_DATA_MODULE_LABELS.addresses.description,
      icon: <MapPin className="h-5 w-5" />,
      complete: isComplete(master?.addresses),
      summary: corporateModel?.addresses[0]?.value || 'No addresses configured',
      actionLabel: 'Manage in Settings',
    },
    {
      id: 'tax_registrations',
      title: MASTER_DATA_MODULE_LABELS.tax_registrations.title,
      description: MASTER_DATA_MODULE_LABELS.tax_registrations.description,
      icon: <Receipt className="h-5 w-5" />,
      complete: isComplete(master?.tax_registrations),
      summary:
        corporateModel?.taxRegistrations.map((t) => t.label).join(', ') || 'No tax registrations',
      actionLabel: 'Manage in Settings',
    },
    {
      id: 'governance',
      title: MASTER_DATA_MODULE_LABELS.governance.title,
      description: MASTER_DATA_MODULE_LABELS.governance.description,
      icon: <Shield className="h-5 w-5" />,
      complete: isComplete(master?.governance),
      summary: corporateModel?.governance.map((g) => g.name).join(', ') || 'Governance not configured',
      actionLabel: 'Manage in Settings',
    },
    {
      id: 'directors',
      title: MASTER_DATA_MODULE_LABELS.directors.title,
      description: MASTER_DATA_MODULE_LABELS.directors.description,
      icon: <Users className="h-5 w-5" />,
      complete: (master?.directors?.length || 0) > 0,
      summary:
        corporateModel?.directors
          .filter((d) => d.active)
          .map((d) => d.name)
          .join(', ') || 'No directors registered',
      actionLabel: 'Manage in Settings',
    },
    {
      id: 'principal_bankers',
      title: MASTER_DATA_MODULE_LABELS.principal_bankers.title,
      description: MASTER_DATA_MODULE_LABELS.principal_bankers.description,
      icon: <Landmark className="h-5 w-5" />,
      complete: (master?.principal_bankers?.length || 0) > 0,
      summary:
        corporateModel?.principalBankers
          .filter((b) => b.active)
          .map((b) => b.bankName)
          .join(', ') || 'No principal bankers',
      actionLabel: 'Manage in Settings',
    },
    {
      id: 'officers',
      title: MASTER_DATA_MODULE_LABELS.officers.title,
      description: MASTER_DATA_MODULE_LABELS.officers.description,
      icon: <Briefcase className="h-5 w-5" />,
      complete: (master?.officers?.length || 0) > 0,
      summary: master?.officers?.map((o) => o.name).join(', ') || 'Officers not assigned',
      actionLabel: 'Manage in Settings',
    },
    {
      id: 'engagement',
      title: 'Engagement & Approval',
      description: 'Reporting period, currencies, assurance and approval workflow',
      icon: <CalendarClock className="h-5 w-5" />,
      complete: !!(generalInfo?.reporting_currency && generalInfo?.financial_year_end),
      summary: generalInfo?.financial_year_end || 'Engagement not configured',
      actionLabel: 'Open',
    },
  ];

  const validationPassed = corporateModel?.validation.passed ?? false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Corporate Information Workspace</h2>
          <p className="text-sm text-muted-foreground">
            Read-only navigation hub. Company master data is maintained once in the Settings
            Enterprise Administration Centre and flows automatically to publication — these cards
            deep-link there. Only Engagement &amp; Approval is configured per engagement here.
          </p>
        </div>
        <Badge variant={validationPassed ? 'default' : 'outline'} className={validationPassed ? '' : 'border-amber-500/50 text-amber-600'}>
          {validationPassed ? 'Publication ready' : 'Validation required'}
        </Badge>
      </div>

      {!validationPassed && corporateModel && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">Corporate information incomplete</p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {corporateModel.validation.issues
                  .filter((i) => i.blocking)
                  .slice(0, 5)
                  .map((i) => (
                    <li key={i.field}>{i.message}</li>
                  ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">{card.icon}</div>
                {!card.complete && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
                    Action required
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base">{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <p className="line-clamp-2 text-sm text-muted-foreground">{card.summary}</p>
              <Button
                variant={card.complete ? 'outline' : 'default'}
                size="sm"
                className="w-full justify-between"
                onClick={() => openModule(card.id)}
              >
                {card.actionLabel}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {corporateModel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publication Preview</CardTitle>
            <CardDescription>
              Level of assurance: {corporateModel.levelOfAssurance.formatted} · Source: Corporate
              Information Provider
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Registered name</dt>
                <dd className="font-medium">{corporateModel.entityIdentity.registeredName.formatted || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Registration number</dt>
                <dd className="font-medium">{corporateModel.entityIdentity.registrationNumber.formatted || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Directors</dt>
                <dd className="font-medium">
                  {corporateModel.directors.filter((d) => d.active).map((d) => d.name).join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Principal bankers</dt>
                <dd className="font-medium">
                  {corporateModel.principalBankers.filter((b) => b.active).map((b) => b.bankName).join(', ') || '—'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
