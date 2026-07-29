/**
 * V16.1 — Enterprise master data maintenance modules.
 * Each module is the single source of truth for its domain.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import {
  getCompanyMasterData,
  upsertCompanyMasterDataModule,
  type CompanyMasterData,
  type DirectorMasterEntry,
  type MasterDataModuleId,
  type PrincipalBankerMasterEntry,
} from '../../../../lib/financialStatements/masterData';
import {
  invokeFinancialStatements,
  type EfsWorkspaceGeneralInformation,
} from '../../../../lib/financialStatements/api';
import { showError, showSuccess } from '../../../../utils/toast';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { MasterDataModuleShell } from './MasterDataModuleShell';
import { useEnterpriseCalendar } from '../../../../hooks/useEnterpriseCalendar';

function Field({
  label,
  value,
  onChange,
  multiline,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <Textarea value={value} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function useMasterData(companyId: string, workspaceId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['efs_company_master_data', companyId],
    queryFn: () => getCompanyMasterData(companyId),
    enabled: !!companyId,
  });

  const saveModule = useMutation({
    mutationFn: ({ moduleId, payload }: { moduleId: MasterDataModuleId; payload: unknown }) =>
      upsertCompanyMasterDataModule(companyId, moduleId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['efs_company_master_data', companyId] });
      qc.invalidateQueries({ queryKey: ['efs_engagement_gi', companyId, workspaceId] });
      showSuccess('Master data saved');
    },
    onError: (e: Error) => showError(e.message),
  });

  return { query, saveModule };
}

export function CompanyProfileModule({
  companyId,
  workspaceId,
  onBack,
  backLabel,
}: {
  companyId: string;
  workspaceId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { query, saveModule } = useMasterData(companyId, workspaceId);
  const [draft, setDraft] = useState(query.data?.company_profile || {});

  useEffect(() => {
    if (query.data) setDraft(query.data.company_profile || {});
  }, [query.data]);

  return (
    <MasterDataModuleShell
      moduleId="company_profile"
      onBack={onBack}
      backLabel={backLabel}
      onSave={() => saveModule.mutate({ moduleId: 'company_profile', payload: draft })}
      saving={saveModule.isPending}
    >
      <Field label="Registered Name" value={draft.registered_name || ''} onChange={(v) => setDraft((p) => ({ ...p, registered_name: v }))} />
      <Field label="Trading Name" value={draft.trading_name || ''} onChange={(v) => setDraft((p) => ({ ...p, trading_name: v }))} />
      <Field label="Registration Number" value={draft.registration_number || ''} onChange={(v) => setDraft((p) => ({ ...p, registration_number: v }))} />
      <Field label="Nature of Business" value={draft.nature_of_business || ''} onChange={(v) => setDraft((p) => ({ ...p, nature_of_business: v }))} multiline />
      <Field label="Country of Incorporation" value={draft.country_of_incorporation || ''} onChange={(v) => setDraft((p) => ({ ...p, country_of_incorporation: v }))} />
      <Field label="Entity Type" value={draft.entity_type || ''} onChange={(v) => setDraft((p) => ({ ...p, entity_type: v }))} />
    </MasterDataModuleShell>
  );
}

export function AddressRepositoryModule({
  companyId,
  workspaceId,
  onBack,
  backLabel,
}: {
  companyId: string;
  workspaceId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { query, saveModule } = useMasterData(companyId, workspaceId);
  const [draft, setDraft] = useState(query.data?.addresses || {});

  useEffect(() => {
    if (query.data) setDraft(query.data.addresses || {});
  }, [query.data]);

  return (
    <MasterDataModuleShell moduleId="addresses" onBack={onBack} backLabel={backLabel} onSave={() => saveModule.mutate({ moduleId: 'addresses', payload: draft })} saving={saveModule.isPending}>
      <Field label="Registered Office" value={draft.registered_office || ''} onChange={(v) => setDraft((p) => ({ ...p, registered_office: v }))} multiline />
      <Field label="Business Address" value={draft.business_address || ''} onChange={(v) => setDraft((p) => ({ ...p, business_address: v }))} multiline />
      <Field label="Postal Address" value={draft.postal_address || ''} onChange={(v) => setDraft((p) => ({ ...p, postal_address: v }))} multiline />
      <Field label="Physical Address" value={draft.physical_address || ''} onChange={(v) => setDraft((p) => ({ ...p, physical_address: v }))} multiline />
      <Field label="Website" value={draft.website || ''} onChange={(v) => setDraft((p) => ({ ...p, website: v }))} />
      <Field label="Email" value={draft.email || ''} onChange={(v) => setDraft((p) => ({ ...p, email: v }))} />
      <Field label="Telephone" value={draft.telephone || ''} onChange={(v) => setDraft((p) => ({ ...p, telephone: v }))} />
    </MasterDataModuleShell>
  );
}

export function TaxConfigurationModule({
  companyId,
  workspaceId,
  onBack,
  backLabel,
}: {
  companyId: string;
  workspaceId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { query, saveModule } = useMasterData(companyId, workspaceId);
  const [draft, setDraft] = useState(query.data?.tax_registrations || {});

  useEffect(() => {
    if (query.data) setDraft(query.data.tax_registrations || {});
  }, [query.data]);

  return (
    <MasterDataModuleShell moduleId="tax_registrations" onBack={onBack} backLabel={backLabel} onSave={() => saveModule.mutate({ moduleId: 'tax_registrations', payload: draft })} saving={saveModule.isPending}>
      <Field label="VAT Number" value={draft.vat_number || ''} onChange={(v) => setDraft((p) => ({ ...p, vat_number: v }))} />
      <Field label="Income Tax Number" value={draft.income_tax_number || ''} onChange={(v) => setDraft((p) => ({ ...p, income_tax_number: v }))} />
      <Field label="PAYE Number" value={draft.paye_number || ''} onChange={(v) => setDraft((p) => ({ ...p, paye_number: v }))} />
      <Field label="SDL Number" value={draft.sdl_number || ''} onChange={(v) => setDraft((p) => ({ ...p, sdl_number: v }))} />
      <Field label="UIF Number" value={draft.uif_number || ''} onChange={(v) => setDraft((p) => ({ ...p, uif_number: v }))} />
    </MasterDataModuleShell>
  );
}

export function GovernanceModule({
  companyId,
  workspaceId,
  onBack,
  backLabel,
}: {
  companyId: string;
  workspaceId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { query, saveModule } = useMasterData(companyId, workspaceId);
  const [draft, setDraft] = useState(query.data?.governance || {});

  useEffect(() => {
    if (query.data) setDraft(query.data.governance || {});
  }, [query.data]);

  return (
    <MasterDataModuleShell moduleId="governance" onBack={onBack} backLabel={backLabel} onSave={() => saveModule.mutate({ moduleId: 'governance', payload: draft })} saving={saveModule.isPending}>
      <Field label="Company Secretary" value={draft.company_secretary || ''} onChange={(v) => setDraft((p) => ({ ...p, company_secretary: v }))} />
      <Field label="Auditor" value={draft.auditor || ''} onChange={(v) => setDraft((p) => ({ ...p, auditor: v }))} />
      <Field label="Independent Reviewer" value={draft.independent_reviewer || ''} onChange={(v) => setDraft((p) => ({ ...p, independent_reviewer: v }))} />
      <Field label="Accounting Officer" value={draft.accounting_officer || ''} onChange={(v) => setDraft((p) => ({ ...p, accounting_officer: v }))} />
    </MasterDataModuleShell>
  );
}

export function DirectorRegisterModule({
  companyId,
  workspaceId,
  onBack,
  backLabel,
}: {
  companyId: string;
  workspaceId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { query, saveModule } = useMasterData(companyId, workspaceId);
  const [directors, setDirectors] = useState<DirectorMasterEntry[]>([]);

  useEffect(() => {
    if (query.data) setDirectors(query.data.directors || []);
  }, [query.data]);

  const addDirector = () =>
    setDirectors((prev) => [...prev, { name: '', role: '', appointment_date: '' }]);

  return (
    <MasterDataModuleShell moduleId="directors" onBack={onBack} backLabel={backLabel} onSave={() => saveModule.mutate({ moduleId: 'directors', payload: directors })} saving={saveModule.isPending}>
      {directors.map((d, i) => (
        <div key={i} className="space-y-2 rounded-md border p-3">
          <Field label="Name" value={d.name} onChange={(v) => setDirectors((prev) => prev.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
          <Field label="Role" value={d.role || ''} onChange={(v) => setDirectors((prev) => prev.map((x, j) => (j === i ? { ...x, role: v } : x)))} />
          <Field label="Appointment Date" value={d.appointment_date || ''} onChange={(v) => setDirectors((prev) => prev.map((x, j) => (j === i ? { ...x, appointment_date: v } : x)))} type="date" />
          <Field label="Resignation Date" value={d.resignation_date || ''} onChange={(v) => setDirectors((prev) => prev.map((x, j) => (j === i ? { ...x, resignation_date: v } : x)))} type="date" />
          <Button variant="ghost" size="sm" onClick={() => setDirectors((prev) => prev.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addDirector}>
        Add Director
      </Button>
    </MasterDataModuleShell>
  );
}

export function PrincipalBankersModule({
  companyId,
  workspaceId,
  onBack,
  backLabel,
}: {
  companyId: string;
  workspaceId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { query, saveModule } = useMasterData(companyId, workspaceId);
  const [bankers, setBankers] = useState<PrincipalBankerMasterEntry[]>([]);

  useEffect(() => {
    if (query.data) setBankers(query.data.principal_bankers || []);
  }, [query.data]);

  const addBanker = () =>
    setBankers((prev) => [...prev, { name: '', branch: '', branch_code: '', active: true }]);

  return (
    <MasterDataModuleShell moduleId="principal_bankers" onBack={onBack} backLabel={backLabel} onSave={() => saveModule.mutate({ moduleId: 'principal_bankers', payload: bankers })} saving={saveModule.isPending}>
      {bankers.map((b, i) => (
        <div key={i} className="space-y-2 rounded-md border p-3">
          <Field label="Bank Name" value={b.name} onChange={(v) => setBankers((prev) => prev.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
          <Field label="Branch" value={b.branch || ''} onChange={(v) => setBankers((prev) => prev.map((x, j) => (j === i ? { ...x, branch: v } : x)))} />
          <Field label="Branch Code" value={b.branch_code || ''} onChange={(v) => setBankers((prev) => prev.map((x, j) => (j === i ? { ...x, branch_code: v } : x)))} />
          <Field label="Account Type" value={b.account_type || ''} onChange={(v) => setBankers((prev) => prev.map((x, j) => (j === i ? { ...x, account_type: v } : x)))} />
          <Field label="SWIFT" value={b.swift || ''} onChange={(v) => setBankers((prev) => prev.map((x, j) => (j === i ? { ...x, swift: v } : x)))} />
          <Button variant="ghost" size="sm" onClick={() => setBankers((prev) => prev.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addBanker}>
        Add Principal Banker
      </Button>
    </MasterDataModuleShell>
  );
}

export function OfficerRegisterModule({
  companyId,
  workspaceId,
  onBack,
  backLabel,
}: {
  companyId: string;
  workspaceId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { query, saveModule } = useMasterData(companyId, workspaceId);
  const [officers, setOfficers] = useState<CompanyMasterData['officers']>([]);

  useEffect(() => {
    if (query.data) setOfficers(query.data.officers || []);
  }, [query.data]);

  const setOfficer = (role: CompanyMasterData['officers'][0]['role'], name: string) => {
    setOfficers((prev) => {
      const rest = prev.filter((o) => o.role !== role);
      return name.trim() ? [...rest, { role, name }] : rest;
    });
  };

  const byRole = (role: CompanyMasterData['officers'][0]['role']) =>
    officers.find((o) => o.role === role)?.name || '';

  return (
    <MasterDataModuleShell moduleId="officers" onBack={onBack} backLabel={backLabel} onSave={() => saveModule.mutate({ moduleId: 'officers', payload: officers })} saving={saveModule.isPending}>
      <Field label="Preparer" value={byRole('preparer')} onChange={(v) => setOfficer('preparer', v)} />
      <Field label="Reviewer" value={byRole('reviewer')} onChange={(v) => setOfficer('reviewer', v)} />
      <Field label="Partner" value={byRole('partner')} onChange={(v) => setOfficer('partner', v)} />
      <Field label="Authorised Representative" value={byRole('authorised_representative')} onChange={(v) => setOfficer('authorised_representative', v)} />
    </MasterDataModuleShell>
  );
}

export function WorkspaceConfigurationModule({
  companyId,
  workspaceId,
  generalInfo,
  onBack,
}: {
  companyId: string;
  workspaceId: string;
  generalInfo?: EfsWorkspaceGeneralInformation | null;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EfsWorkspaceGeneralInformation>(generalInfo || {});
  const { years, activeYear, endDate: calendarEnd } = useEnterpriseCalendar(companyId);

  useEffect(() => {
    setDraft(generalInfo || {});
  }, [generalInfo]);

  // Bind reporting year-end to Enterprise Financial Calendar when unset.
  useEffect(() => {
    if (!draft.financial_year_end && calendarEnd) {
      setDraft((prev) => ({ ...prev, financial_year_end: calendarEnd }));
    }
  }, [calendarEnd, draft.financial_year_end]);

  const save = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'UPSERT_WORKSPACE_GENERAL_INFORMATION', {
        workspace_id: workspaceId,
        general_information: draft,
      }),
    onSuccess: () => {
      showSuccess('Engagement configuration saved');
      qc.invalidateQueries({ queryKey: ['efs_engagement_gi', companyId, workspaceId] });
      onBack();
    },
    onError: (e: Error) => showError(e.message),
  });

  const setField = (key: keyof EfsWorkspaceGeneralInformation, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Information Workspace
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Engagement &amp; Approval</CardTitle>
          <CardDescription>
            Reporting period is selected from the Enterprise Financial Calendar. Currencies and
            assurance remain engagement-scoped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Financial Year End (from Financial Calendar)</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={draft.financial_year_end || ''}
              onChange={(e) => setField('financial_year_end', e.target.value)}
            >
              <option value="">Select year…</option>
              {years.map((y) => (
                <option key={y.id} value={y.endDate}>
                  {y.yearCode} — ends {y.endDate}
                  {y.id === activeYear?.id ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Field label="Comparative Period" value={draft.comparative_period || ''} onChange={(v) => setField('comparative_period', v)} />
          <Field label="Reporting Currency" value={draft.reporting_currency || ''} onChange={(v) => setField('reporting_currency', v)} />
          <Field label="Functional Currency" value={draft.functional_currency || ''} onChange={(v) => setField('functional_currency', v)} />
          <Field label="Engagement Type (audit | independent_review | compilation | unaudited)" value={draft.engagement_type || ''} onChange={(v) => setField('engagement_type', v)} />
          <Field label="Approval Date" value={draft.approval_date || ''} onChange={(v) => setField('approval_date', v)} type="date" />
          <Field label="Authorisation Date" value={draft.authorisation_date || ''} onChange={(v) => setField('authorisation_date', v)} type="date" />
          <Field label="Issue Date" value={draft.issue_date || ''} onChange={(v) => setField('issue_date', v)} type="date" />
        </CardContent>
      </Card>
    </div>
  );
}

export function MasterDataModuleRouter({
  moduleId,
  companyId,
  workspaceId,
  generalInfo,
  onBack,
  backLabel,
}: {
  moduleId: MasterDataModuleId | 'engagement';
  companyId: string;
  workspaceId: string;
  generalInfo?: EfsWorkspaceGeneralInformation | null;
  onBack: () => void;
  backLabel?: string;
}) {
  if (moduleId === 'engagement') {
    return (
      <WorkspaceConfigurationModule
        companyId={companyId}
        workspaceId={workspaceId}
        generalInfo={generalInfo}
        onBack={onBack}
      />
    );
  }
  switch (moduleId) {
    case 'company_profile':
      return <CompanyProfileModule companyId={companyId} workspaceId={workspaceId} onBack={onBack} backLabel={backLabel} />;
    case 'addresses':
      return <AddressRepositoryModule companyId={companyId} workspaceId={workspaceId} onBack={onBack} backLabel={backLabel} />;
    case 'tax_registrations':
      return <TaxConfigurationModule companyId={companyId} workspaceId={workspaceId} onBack={onBack} backLabel={backLabel} />;
    case 'governance':
      return <GovernanceModule companyId={companyId} workspaceId={workspaceId} onBack={onBack} backLabel={backLabel} />;
    case 'directors':
      return <DirectorRegisterModule companyId={companyId} workspaceId={workspaceId} onBack={onBack} backLabel={backLabel} />;
    case 'officers':
      return <OfficerRegisterModule companyId={companyId} workspaceId={workspaceId} onBack={onBack} backLabel={backLabel} />;
    case 'principal_bankers':
      return <PrincipalBankersModule companyId={companyId} workspaceId={workspaceId} onBack={onBack} backLabel={backLabel} />;
    default:
      return null;
  }
}
