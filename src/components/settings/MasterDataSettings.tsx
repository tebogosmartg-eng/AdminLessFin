/**
 * Enterprise Master Data — Settings hub (Phase G3.7 — Master Data Consolidation).
 *
 * Settings is now the single Enterprise Administration Centre where company
 * master data is MAINTAINED. This component hosts the seven company-level
 * master-data editors — the SAME editor components the Financial Statements
 * Information Workspace used to render inline (MasterDataModuleRouter in
 * src/pages/financialStatements/experience/masterData/modules.tsx). They are
 * reused verbatim, not reimplemented, so there is no duplicate editor: the
 * one editor set simply now lives under Settings, and the FS workspace deep-
 * links here instead of editing in place.
 *
 * Ownership note: all seven modules read/write company-scoped
 * efs_company_master_data via the governance-routed getCompanyMasterData /
 * upsertCompanyMasterDataModule (see Phase G3.3). The `workspaceId` the FS
 * editors accept is used by them ONLY for a cosmetic post-save cache
 * invalidation of an engagement query; here there is no engagement context,
 * so a stable empty sentinel is passed — the authoritative
 * ['efs_company_master_data', companyId] invalidation still fires correctly.
 *
 * The eighth FS module — Engagement & Approval configuration — is NOT hosted
 * here: it is genuinely per-reporting-workspace (a company may run several
 * engagements), so it remains in the Financial Statements workspace, which is
 * its correct single owner. It is not company master data and has no duplicate.
 */
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCompanyMasterData,
  MASTER_DATA_MODULE_LABELS,
  type MasterDataModuleId,
} from '../../lib/financialStatements/masterData';
import { MasterDataModuleRouter } from '../../pages/financialStatements/experience/masterData/modules';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import {
  Building2,
  MapPin,
  Receipt,
  Shield,
  Users,
  Landmark,
  Briefcase,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

// The seven company-level master-data modules, in the same order the FS
// Information Workspace presented them.
const MODULE_ORDER: MasterDataModuleId[] = [
  'company_profile',
  'addresses',
  'tax_registrations',
  'governance',
  'directors',
  'principal_bankers',
  'officers',
];

const MODULE_ICONS: Record<MasterDataModuleId, React.ReactNode> = {
  company_profile: <Building2 className="h-5 w-5" />,
  addresses: <MapPin className="h-5 w-5" />,
  tax_registrations: <Receipt className="h-5 w-5" />,
  governance: <Shield className="h-5 w-5" />,
  directors: <Users className="h-5 w-5" />,
  principal_bankers: <Landmark className="h-5 w-5" />,
  officers: <Briefcase className="h-5 w-5" />,
};

function isConfigured(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return !!value.trim();
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(isConfigured);
  return false;
}

const MasterDataSettings = () => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  // URL is the authoritative navigation contract.
  // /settings?tab=master-data&module=directors → opens Director Register.
  // Refresh restores the module; Browser Back pops to the prior module/hub.
  const moduleParam = searchParams.get('module');
  const activeModule: MasterDataModuleId | null =
    moduleParam && (MODULE_ORDER as string[]).includes(moduleParam)
      ? (moduleParam as MasterDataModuleId)
      : null;

  const masterQuery = useQuery({
    // Shares the exact cache key the editors use, so opening a module reuses
    // this fetch rather than issuing a second one.
    queryKey: ['efs_company_master_data', companyId],
    queryFn: () => getCompanyMasterData(companyId!),
    enabled: !!companyId,
    retry: false,
  });

  const openModule = (id: MasterDataModuleId) => {
    // Push a history entry so Browser Back restores the previous module/hub.
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'master-data');
    next.set('module', id);
    setSearchParams(next);
  };

  const closeModule = () => {
    // Clear module while preserving tab=master-data (hub).
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'master-data');
    next.delete('module');
    setSearchParams(next);
  };

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No active company</CardTitle>
          <CardDescription>Select a company to manage its master data.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (activeModule) {
    // Reuse the exact FS editor. workspaceId='' — company-scoped save; the
    // engagement-cache invalidation inside the editor becomes a harmless no-op.
    return (
      <MasterDataModuleRouter
        moduleId={activeModule}
        companyId={companyId}
        workspaceId=""
        onBack={closeModule}
        backLabel="Back to Master Data"
      />
    );
  }

  if (masterQuery.isError) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Master data unavailable</CardTitle>
          <CardDescription className="whitespace-pre-wrap font-mono text-xs">
            {(masterQuery.error as Error)?.message ||
              'Company Master Data infrastructure is not available.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const master = masterQuery.data;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Company Master Data</h2>
        <p className="text-sm text-muted-foreground">
          The single source of truth for corporate identity, governance, directors, officers,
          bankers, addresses and tax registrations. Maintained here once — consumed everywhere
          (Financial Statements, reports, disclosures and exports).
        </p>
      </div>

      {masterQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MODULE_ORDER.map((id) => (
            <Skeleton key={id} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MODULE_ORDER.map((id) => {
            const labels = MASTER_DATA_MODULE_LABELS[id];
            const configured = isConfigured(master?.[id]);
            return (
              <Card key={id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-primary">{MODULE_ICONS[id]}</div>
                    {!configured && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
                        Not configured
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base">{labels.title}</CardTitle>
                  <CardDescription>{labels.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    variant={configured ? 'outline' : 'default'}
                    size="sm"
                    className="w-full justify-between"
                    onClick={() => openModule(id)}
                  >
                    {configured ? 'Manage' : 'Configure'}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-muted bg-muted/30">
        <CardContent className="flex items-start gap-3 pt-4">
          <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Engagement &amp; Approval configuration (reporting period, currencies, assurance level)
            is maintained per reporting engagement inside the Financial Statements workspace, not
            here — a company may run several engagements, so it is not company-level master data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MasterDataSettings;
