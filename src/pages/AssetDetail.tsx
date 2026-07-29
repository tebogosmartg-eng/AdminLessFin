import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, differenceInCalendarDays } from 'date-fns';
import { ArrowLeft, Ban, Building2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import { EmptyState } from '../components/EmptyState';
import { EmployeeIdentity } from '../components/hr/EmployeeIdentity';
import AssetDisposalForm from '../components/AssetDisposalForm';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { evaluateAssetIntelligence } from '../lib/assets/assetIntelligence';
import { calculateAssetHealth } from '../lib/assets/assetHealth';
import { AssetDocumentType } from '../lib/assets/eamTypes';
import { showError, showSuccess } from '../utils/toast';
import AssetSmartActions from '../components/assets/AssetSmartActions';
import AssetTimeline from '../components/assets/AssetTimeline';
import AssetComponentsPanel from '../components/assets/AssetComponentsPanel';
import AssetRelationshipsPanel from '../components/assets/AssetRelationshipsPanel';

type WorkspacePayload = {
  asset: any;
  documents: any[];
  verifications: any[];
  schedules: any[];
  maintenance: any[];
  auditTrail: any[];
  timeline?: any[];
  components?: any[];
  relationships?: { children: any[]; parents: any[] };
};

const DOC_TYPES: AssetDocumentType[] = [
  'image',
  'invoice',
  'warranty',
  'insurance',
  'manual',
  'inspection_report',
  'certificate',
  'attachment',
];

const DetailItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="font-semibold">{value || 'N/A'}</p>
  </div>
);

const AssetDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isDisposalFormOpen, setIsDisposalFormOpen] = useState(false);
  const [tab, setTab] = useState('overview');

  const [docForm, setDocForm] = useState({
    document_type: 'attachment' as AssetDocumentType,
    file_name: '',
    file_url: '',
    notes: '',
  });
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    frequency_months: '12',
    next_service_date: '',
    notes: '',
  });
  const [recordForm, setRecordForm] = useState({
    record_type: 'service',
    service_date: new Date().toISOString().slice(0, 10),
    description: '',
    cost: '0',
    downtime_hours: '0',
    vendor_name: '',
    performed_by: '',
    notes: '',
  });

  const workspaceKey = ['asset_workspace', activeCompany?.id, id];

  const { data: workspace, isLoading } = useQuery({
    queryKey: workspaceKey,
    queryFn: async (): Promise<WorkspacePayload | null> => {
      if (!activeCompany || !id) return null;
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'GET_WORKSPACE', company_id: activeCompany.id, assetId: id },
      });
      if (!error && data?.asset) {
        const payload = data as WorkspacePayload;
        return {
          ...payload,
          timeline: payload.timeline || [],
          components: payload.components || [],
          relationships: payload.relationships || { children: [], parents: [] },
        };
      }
      // Fallback for older deployments / missing related tables
      const { data: one, error: oneErr } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'GET_ONE', company_id: activeCompany.id, assetId: id },
      });
      if (oneErr) throw oneErr || error;
      return {
        asset: one,
        documents: [],
        verifications: [],
        schedules: [],
        maintenance: [],
        auditTrail: [],
        timeline: [],
        components: [],
        relationships: { children: [], parents: [] },
      };
    },
    enabled: !!id && !!activeCompany,
  });

  const asset = workspace?.asset;
  useDocumentTitle(asset ? `${asset.asset_code} · Asset` : 'Asset Workspace');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: workspaceKey });
    queryClient.invalidateQueries({ queryKey: ['fixed_assets', activeCompany?.id] });
  };

  const addDocumentMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !id) throw new Error('Missing context');
      if (!docForm.file_name.trim()) throw new Error('File name is required');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'ADD_DOCUMENT',
          company_id: activeCompany.id,
          assetId: id,
          document: {
            document_type: docForm.document_type,
            file_name: docForm.file_name.trim(),
            file_url: docForm.file_url.trim() || null,
            notes: docForm.notes.trim() || null,
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Document added.');
      setDocForm({ document_type: 'attachment', file_name: '', file_url: '', notes: '' });
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      if (!activeCompany) throw new Error('No company');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'DELETE_DOCUMENT',
          company_id: activeCompany.id,
          documentId,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Document deleted.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const upsertScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !id) throw new Error('Missing context');
      if (!scheduleForm.title.trim()) throw new Error('Schedule title is required');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'UPSERT_MAINTENANCE_SCHEDULE',
          company_id: activeCompany.id,
          assetId: id,
          schedule: {
            title: scheduleForm.title.trim(),
            frequency_months: Number(scheduleForm.frequency_months) || 12,
            next_service_date: scheduleForm.next_service_date || null,
            notes: scheduleForm.notes.trim() || null,
            status: 'active',
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Maintenance schedule saved. (No journals posted.)');
      setScheduleForm({ title: '', frequency_months: '12', next_service_date: '', notes: '' });
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const addRecordMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !id) throw new Error('Missing context');
      if (!recordForm.description.trim()) throw new Error('Description is required');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'ADD_MAINTENANCE_RECORD',
          company_id: activeCompany.id,
          assetId: id,
          record: {
            record_type: recordForm.record_type,
            service_date: recordForm.service_date,
            description: recordForm.description.trim(),
            cost: Number(recordForm.cost) || 0,
            downtime_hours: Number(recordForm.downtime_hours) || 0,
            vendor_name: recordForm.vendor_name.trim() || null,
            performed_by: recordForm.performed_by.trim() || null,
            notes: recordForm.notes.trim() || null,
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Maintenance record added. (No journals posted.)');
      setRecordForm({
        record_type: 'service',
        service_date: new Date().toISOString().slice(0, 10),
        description: '',
        cost: '0',
        downtime_hours: '0',
        vendor_name: '',
        performed_by: '',
        notes: '',
      });
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const insights = useMemo(() => {
    if (!asset) return [];
    const purchase = new Date(asset.purchase_date);
    const ageYears =
      Number.isFinite(purchase.getTime())
        ? differenceInCalendarDays(new Date(), purchase) / 365.25
        : 0;
    const maintYtd = (workspace?.maintenance || [])
      .filter((m) => {
        if (!m.service_date) return false;
        return new Date(m.service_date).getFullYear() === new Date().getFullYear();
      })
      .reduce(
        (acc, m) => ({
          cost: acc.cost + Number(m.cost || 0),
          downtime: acc.downtime + Number(m.downtime_hours || 0),
        }),
        { cost: 0, downtime: 0 }
      );
    const lastService = workspace?.maintenance?.[0]?.service_date ?? null;
    return evaluateAssetIntelligence({
      assetId: asset.id,
      purchaseCost: Number(asset.purchase_cost || 0),
      netBookValue: Number(asset.net_book_value ?? asset.purchase_cost - asset.accumulated_depreciation),
      usefulLifeYears: asset.useful_life_years ?? null,
      ageYears,
      verificationStatus: asset.verification_status,
      nextVerificationDue: asset.next_verification_due,
      impairmentAmount: Number(asset.impairment_amount || 0),
      maintenanceCostYtd: maintYtd.cost,
      downtimeHoursYtd: maintYtd.downtime,
      lastServiceDate: lastService,
    });
  }, [asset, workspace?.maintenance]);

  const historyTimeline = useMemo(() => {
    const items: { at: string; kind: string; title: string; detail?: string }[] = [];
    (workspace?.verifications || []).forEach((v) => {
      items.push({
        at: v.verified_at,
        kind: 'Verification',
        title: `${v.status} · ${v.verification_method || 'manual'}`,
        detail: [v.verifier_name, v.notes].filter(Boolean).join(' — '),
      });
    });
    (workspace?.maintenance || []).forEach((m) => {
      items.push({
        at: m.service_date,
        kind: 'Maintenance',
        title: `${m.record_type}: ${m.description}`,
        detail: `Cost ${formatCurrency(Number(m.cost || 0))} · Downtime ${m.downtime_hours || 0}h`,
      });
    });
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [workspace?.verifications, workspace?.maintenance]);

  const photos = (workspace?.documents || []).filter((d) => d.document_type === 'image');
  const timelineEvents = workspace?.timeline || [];
  const components = workspace?.components || [];
  const relationships = workspace?.relationships || { children: [], parents: [] };

  const healthScore = useMemo(() => {
    if (!asset) return null;
    const cutoff = Date.now() - 365.25 * 24 * 3600 * 1000;
    const maint12 = (workspace?.maintenance || []).filter((m) => {
      if (!m.service_date) return false;
      return new Date(m.service_date).getTime() >= cutoff;
    });
    return calculateAssetHealth({
      assetId: asset.id,
      purchaseDate: asset.purchase_date,
      usefulLifeYears: asset.useful_life_years ?? null,
      purchaseCost: Number(asset.purchase_cost || 0),
      netBookValue: Number(
        asset.net_book_value ??
          Number(asset.purchase_cost || 0) - Number(asset.accumulated_depreciation || 0)
      ),
      impairmentAmount: Number(asset.impairment_amount || 0),
      verificationStatus: asset.verification_status,
      nextVerificationDue: asset.next_verification_due,
      maintenanceEventsLast12m: maint12.length,
      repairCostLast12m: maint12.reduce((s, m) => s + Number(m.cost || 0), 0),
      downtimeHoursLast12m: maint12.reduce((s, m) => s + Number(m.downtime_hours || 0), 0),
      status: asset.status,
    });
  }, [asset, workspace?.maintenance]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!asset) {
    return (
      <EmptyState
        icon={Building2}
        title="Asset not found"
        description="This asset may have been removed or you do not have access."
        action={
          <Button asChild variant="outline">
            <Link to="/fixed-assets">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to register
            </Link>
          </Button>
        }
      />
    );
  }

  const netBookValue =
    Number(asset.net_book_value ?? Number(asset.purchase_cost || 0) - Number(asset.accumulated_depreciation || 0));

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
              <Link to="/fixed-assets">
                <ArrowLeft className="mr-2 h-4 w-4" /> Asset Register
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {asset.description}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">{asset.asset_code}</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Badge variant="outline" className="capitalize text-sm">
                {asset.status}
              </Badge>
              <Badge variant="secondary" className="capitalize text-sm">
                {asset.verification_status || 'unverified'}
              </Badge>
              {asset.status !== 'disposed' && (
                <Button variant="destructive" onClick={() => setIsDisposalFormOpen(true)}>
                  <Ban className="mr-2 h-4 w-4" /> Dispose
                </Button>
              )}
            </div>
            <AssetSmartActions
              asset={asset}
              workspaceQueryKey={workspaceKey}
              onDispose={() => setIsDisposalFormOpen(true)}
              onNavigateTab={setTab}
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="depreciation">Depreciation</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="relationships">Relationships</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Acquisition cost</CardDescription>
                  <CardTitle className="text-xl font-mono">{formatCurrency(asset.purchase_cost)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Net book value</CardDescription>
                  <CardTitle className="text-xl font-mono">{formatCurrency(netBookValue)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Health score</CardDescription>
                  <CardTitle className="text-xl tabular-nums">
                    {healthScore ? `${healthScore.healthPercent}%` : '—'}
                  </CardTitle>
                  {healthScore && (
                    <CardDescription className="capitalize">{healthScore.riskRating} risk</CardDescription>
                  )}
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Location</CardDescription>
                  <CardTitle className="text-lg">{asset.location || '—'}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Category</CardDescription>
                  <CardTitle className="text-lg">{asset.asset_categories?.name || '—'}</CardTitle>
                </CardHeader>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Executive summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 text-sm">
                <DetailItem
                  label="Custodian"
                  value={
                    asset.custodian_name ||
                    (asset.employees ? (
                      <EmployeeIdentity employee={asset.employees} layout="stacked" showDepartment />
                    ) : (
                      'N/A'
                    ))
                  }
                />
                <DetailItem label="Department" value={asset.department || asset.employees?.department} />
                <DetailItem label="Serial / Tag" value={[asset.serial_number, asset.asset_tag].filter(Boolean).join(' · ')} />
                <DetailItem label="QR / Barcode" value={[asset.qr_code, asset.barcode].filter(Boolean).join(' · ')} />
                <DetailItem
                  label="Purchase date"
                  value={asset.purchase_date ? format(new Date(asset.purchase_date), 'PPP') : '—'}
                />
                <DetailItem label="Vendor" value={asset.vendors?.name} />
                <DetailItem
                  label="Last verified"
                  value={
                    asset.last_verified_at
                      ? format(new Date(asset.last_verified_at), 'PPP')
                      : 'Never'
                  }
                />
                <DetailItem
                  label="Next verification due"
                  value={
                    asset.next_verification_due
                      ? format(new Date(asset.next_verification_due), 'PPP')
                      : '—'
                  }
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Asset intelligence</CardTitle>
                <CardDescription>Heuristic insights — architecture ready for model-backed scoring.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No intelligence signals for this asset.</p>
                ) : (
                  insights.map((insight) => (
                    <Alert key={`${insight.kind}-${insight.title}`}>
                      <AlertDescription>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge
                            variant={
                              insight.severity === 'critical'
                                ? 'destructive'
                                : insight.severity === 'warning'
                                  ? 'warning'
                                  : 'secondary'
                            }
                          >
                            {insight.severity}
                          </Badge>
                          <span className="font-medium">{insight.title}</span>
                        </div>
                        <p className="text-sm">{insight.summary}</p>
                        {insight.recommendedAction && (
                          <p className="text-xs text-muted-foreground mt-1">{insight.recommendedAction}</p>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Financials</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <DetailItem label="Purchase cost" value={formatCurrency(asset.purchase_cost)} />
                  <DetailItem
                    label="Accumulated depreciation"
                    value={formatCurrency(asset.accumulated_depreciation)}
                  />
                  <DetailItem label="Net book value" value={formatCurrency(netBookValue)} />
                  <DetailItem label="Residual value" value={formatCurrency(asset.residual_value)} />
                  <DetailItem
                    label="Impairment"
                    value={formatCurrency(Number(asset.impairment_amount || 0))}
                  />
                  <DetailItem
                    label="Depreciation YTD"
                    value={formatCurrency(Number(asset.depreciation_ytd || 0))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>GL accounts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <DetailItem label="Asset account" value={asset.asset_account?.name} />
                  <DetailItem
                    label="Accumulated depreciation"
                    value={asset.accum_depr_account?.name}
                  />
                  <DetailItem
                    label="Depreciation expense"
                    value={asset.depr_expense_account?.name}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="depreciation">
            <Card>
              <CardHeader>
                <CardTitle>Depreciation profile</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 text-sm">
                <DetailItem label="Method" value={asset.depreciation_method} />
                <DetailItem
                  label="Useful life"
                  value={asset.useful_life_years != null ? `${asset.useful_life_years} years` : '—'}
                />
                <DetailItem label="Residual value" value={formatCurrency(asset.residual_value)} />
                <DetailItem
                  label="Last depreciation"
                  value={
                    asset.last_depreciation_date
                      ? format(new Date(asset.last_depreciation_date), 'PPP')
                      : 'Never'
                  }
                />
                <DetailItem
                  label="Depreciation YTD"
                  value={formatCurrency(Number(asset.depreciation_ytd || 0))}
                />
                <DetailItem
                  label="Accumulated depreciation"
                  value={formatCurrency(asset.accumulated_depreciation)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4">
            <Alert>
              <AlertDescription className="text-sm">
                Maintenance is operational only — schedules and records do <strong>not</strong> post
                accounting journals.
              </AlertDescription>
            </Alert>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Schedules</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 rounded-md border p-3">
                    <Label className="text-xs">Add schedule</Label>
                    <Input
                      placeholder="Title"
                      value={scheduleForm.title}
                      onChange={(e) => setScheduleForm((s) => ({ ...s, title: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Frequency (months)"
                        value={scheduleForm.frequency_months}
                        onChange={(e) =>
                          setScheduleForm((s) => ({ ...s, frequency_months: e.target.value }))
                        }
                      />
                      <Input
                        type="date"
                        value={scheduleForm.next_service_date}
                        onChange={(e) =>
                          setScheduleForm((s) => ({ ...s, next_service_date: e.target.value }))
                        }
                      />
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="Notes"
                      value={scheduleForm.notes}
                      onChange={(e) => setScheduleForm((s) => ({ ...s, notes: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={upsertScheduleMutation.isPending}
                      onClick={() => upsertScheduleMutation.mutate()}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Save schedule
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Next service</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(workspace?.schedules || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-muted-foreground text-sm">
                            No schedules yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (workspace?.schedules || []).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.title}</TableCell>
                            <TableCell>
                              {s.next_service_date
                                ? format(new Date(s.next_service_date), 'PPP')
                                : '—'}
                            </TableCell>
                            <TableCell className="capitalize">{s.status}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Records</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 rounded-md border p-3">
                    <Label className="text-xs">Add record</Label>
                    <Select
                      value={recordForm.record_type}
                      onValueChange={(v) => setRecordForm((r) => ({ ...r, record_type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="repair">Repair</SelectItem>
                        <SelectItem value="inspection">Inspection</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={recordForm.service_date}
                      onChange={(e) => setRecordForm((r) => ({ ...r, service_date: e.target.value }))}
                    />
                    <Input
                      placeholder="Description"
                      value={recordForm.description}
                      onChange={(e) => setRecordForm((r) => ({ ...r, description: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Cost"
                        value={recordForm.cost}
                        onChange={(e) => setRecordForm((r) => ({ ...r, cost: e.target.value }))}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        placeholder="Downtime hours"
                        value={recordForm.downtime_hours}
                        onChange={(e) =>
                          setRecordForm((r) => ({ ...r, downtime_hours: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Vendor"
                        value={recordForm.vendor_name}
                        onChange={(e) => setRecordForm((r) => ({ ...r, vendor_name: e.target.value }))}
                      />
                      <Input
                        placeholder="Performed by"
                        value={recordForm.performed_by}
                        onChange={(e) =>
                          setRecordForm((r) => ({ ...r, performed_by: e.target.value }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={addRecordMutation.isPending}
                      onClick={() => addRecordMutation.mutate()}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add record
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(workspace?.maintenance || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground text-sm">
                            No records yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (workspace?.maintenance || []).map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>
                              {m.service_date ? format(new Date(m.service_date), 'PP') : '—'}
                            </TableCell>
                            <TableCell className="capitalize">{m.record_type}</TableCell>
                            <TableCell>{m.description}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(Number(m.cost || 0))}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>Store references to invoices, warranties, and attachments.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4 rounded-md border p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={docForm.document_type}
                      onValueChange={(v) =>
                        setDocForm((d) => ({ ...d, document_type: v as AssetDocumentType }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">File name</Label>
                    <Input
                      value={docForm.file_name}
                      onChange={(e) => setDocForm((d) => ({ ...d, file_name: e.target.value }))}
                      placeholder="invoice-2024.pdf"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">File URL</Label>
                    <Input
                      value={docForm.file_url}
                      onChange={(e) => setDocForm((d) => ({ ...d, file_url: e.target.value }))}
                      placeholder="https://…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      value={docForm.notes}
                      onChange={(e) => setDocForm((d) => ({ ...d, notes: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-4">
                    <Button
                      size="sm"
                      disabled={addDocumentMutation.isPending}
                      onClick={() => addDocumentMutation.mutate()}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add document
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(workspace?.documents || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground text-sm">
                          No documents yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (workspace?.documents || []).map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="capitalize">{String(doc.document_type).replace(/_/g, ' ')}</TableCell>
                          <TableCell className="font-medium">{doc.file_name}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {doc.file_url ? (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline-offset-2 hover:underline"
                              >
                                Open
                              </a>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>{doc.notes || '—'}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              onClick={() => deleteDocumentMutation.mutate(doc.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos">
            <Card>
              <CardHeader>
                <CardTitle>Photos</CardTitle>
                <CardDescription>Documents with type = image.</CardDescription>
              </CardHeader>
              <CardContent>
                {photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No image documents. Add documents with type &quot;image&quot; on the Documents tab.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {photos.map((photo) => (
                      <div key={photo.id} className="rounded-md border p-3 space-y-2">
                        <p className="font-medium text-sm">{photo.file_name}</p>
                        {photo.file_url ? (
                          <a
                            href={photo.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block aspect-video bg-muted overflow-hidden rounded"
                          >
                            <img
                              src={photo.file_url}
                              alt={photo.file_name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </a>
                        ) : (
                          <div className="aspect-video bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                            No URL
                          </div>
                        )}
                        {photo.notes && <p className="text-xs text-muted-foreground">{photo.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Lifecycle timeline</CardTitle>
                <CardDescription>Events from acquisition through transfers, verification, and disposal.</CardDescription>
              </CardHeader>
              <CardContent>
                <AssetTimeline events={timelineEvents} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="components" className="space-y-4">
            <AssetComponentsPanel
              assetId={asset.id}
              components={components}
              onChanged={invalidate}
            />
          </TabsContent>

          <TabsContent value="relationships" className="space-y-4">
            <AssetRelationshipsPanel
              assetId={asset.id}
              relationships={relationships}
              onChanged={invalidate}
            />
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Audit trail</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(workspace?.auditTrail || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground text-sm">
                          No audit events for this asset.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (workspace?.auditTrail || []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            {row.created_at ? format(new Date(row.created_at), 'PPp') : '—'}
                          </TableCell>
                          <TableCell>{row.action || row.operation || '—'}</TableCell>
                          <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                            {typeof row.new_data === 'object'
                              ? JSON.stringify(row.new_data)
                              : row.details || '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
                <CardDescription>Combined verification and maintenance timeline.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {historyTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No history events yet.</p>
                ) : (
                  historyTimeline.map((item, idx) => (
                    <div key={`${item.at}-${idx}`} className="border-l-2 border-muted pl-4 py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{item.kind}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.at ? format(new Date(item.at), 'PPp') : '—'}
                        </span>
                      </div>
                      <p className="font-medium text-sm mt-1">{item.title}</p>
                      {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AssetDisposalForm
        isOpen={isDisposalFormOpen}
        setIsOpen={setIsDisposalFormOpen}
        asset={asset}
      />
    </>
  );
};

export default AssetDetail;
