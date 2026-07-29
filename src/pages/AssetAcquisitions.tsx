import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CheckCircle2,
  ChevronRight,
  PlusCircle,
  ShoppingCart,
  FileText,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/EmptyState';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import AssetForm from '../components/AssetForm';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  accountsQuery,
  assetCategoriesQuery,
  vendorsQuery,
} from '../lib/queries';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../integrations/supabase/client';
import { showError, showSuccess } from '../utils/toast';
import type { AcquisitionStatus } from '../lib/assets/lifecycleTypes';

type AcquisitionRow = {
  id: string;
  status: AcquisitionStatus;
  description: string;
  asset_code?: string | null;
  purchase_cost: number;
  purchase_date?: string | null;
  invoice_number?: string | null;
  purchase_order_ref?: string | null;
  supplier_id?: string | null;
  category_id?: string | null;
  location?: string | null;
  department?: string | null;
  custodian_name?: string | null;
  serial_number?: string | null;
  asset_account_id?: string | null;
  payment_account_id?: string | null;
  depreciation_method?: string | null;
  useful_life_years?: number | null;
  residual_value?: number | null;
  accumulated_depreciation_account_id?: string | null;
  depreciation_expense_account_id?: string | null;
  capitalisation_approved?: boolean;
  capitalisation_date?: string | null;
  generated_asset_id?: string | null;
  notes?: string | null;
  vendors?: { name: string } | null;
  asset_categories?: { name: string } | null;
};

const PIPELINE: { key: AcquisitionStatus | 'ready'; label: string }[] = [
  { key: 'purchased', label: 'Purchase' },
  { key: 'received', label: 'Receive' },
  { key: 'pending_capitalisation', label: 'Capitalise' },
  { key: 'capitalised', label: 'Generate Asset' },
  { key: 'ready', label: 'Journal' },
  { key: 'ready', label: 'Ready' },
];

const emptyDraft = {
  description: '',
  asset_code: '',
  purchase_cost: '0',
  purchase_date: new Date().toISOString().slice(0, 10),
  supplier_id: '',
  invoice_number: '',
  purchase_order_ref: '',
  category_id: '',
  location: '',
  department: '',
  custodian_name: '',
  serial_number: '',
  asset_account_id: '',
  payment_account_id: '',
  depreciation_method: 'straight-line',
  useful_life_years: '5',
  residual_value: '0',
  accumulated_depreciation_account_id: '',
  depreciation_expense_account_id: '',
  notes: '',
};

const statusVariant = (
  s: string
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' => {
  switch (s) {
    case 'capitalised':
      return 'success';
    case 'cancelled':
      return 'destructive';
    case 'pending_capitalisation':
      return 'warning';
    case 'draft':
      return 'secondary';
    default:
      return 'outline';
  }
};

const pipelineIndex = (status: AcquisitionStatus): number => {
  switch (status) {
    case 'draft':
      return -1;
    case 'purchased':
      return 0;
    case 'received':
      return 1;
    case 'pending_capitalisation':
      return 2;
    case 'capitalised':
      return 5;
    default:
      return -1;
  }
};

const nextAdvance: Partial<Record<AcquisitionStatus, AcquisitionStatus>> = {
  draft: 'purchased',
  purchased: 'received',
  received: 'pending_capitalisation',
};

const AssetAcquisitions = () => {
  useDocumentTitle('Acquisition Workbench');
  const navigate = useNavigate();
  const { activeCompany, role } = useAuth();
  const isAdmin = role === 'owner' || role === 'admin';
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AcquisitionRow | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [approveCap, setApproveCap] = useState(false);
  const [preview, setPreview] = useState<{
    valid: boolean;
    missing: string[];
    assetPreview?: Record<string, unknown>;
    journalPreview?: {
      description: string;
      entry_date: string;
      lines: { type: string; account_id: string; amount: number }[];
    };
  } | null>(null);

  const listKey = ['asset_acquisitions', activeCompany?.id];

  const { data: acquisitions, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'LIST_ACQUISITIONS', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return (data as AcquisitionRow[]) || [];
    },
    enabled: !!activeCompany,
  });

  const { data: vendors } = useQuery({
    ...vendorsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });
  const { data: categories } = useQuery({
    ...assetCategoriesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });
  const { data: accounts } = useQuery({
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const assetAccounts = ((accounts as { id: string; name: string; type: string }[]) || []).filter(
    (a) => a.type === 'Asset'
  );
  const expenseAccounts = ((accounts as { id: string; name: string; type: string }[]) || []).filter(
    (a) => a.type === 'Expense'
  );
  const paymentAccounts = ((accounts as { id: string; name: string; type: string }[]) || []).filter(
    (a) => a.type === 'Asset' || a.type === 'Liability'
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey });

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setApproveCap(false);
    setPreview(null);
    setEditorOpen(true);
  };

  const openEdit = (row: AcquisitionRow) => {
    setEditing(row);
    setDraft({
      description: row.description || '',
      asset_code: row.asset_code || '',
      purchase_cost: String(row.purchase_cost ?? 0),
      purchase_date: row.purchase_date || new Date().toISOString().slice(0, 10),
      supplier_id: row.supplier_id || '',
      invoice_number: row.invoice_number || '',
      purchase_order_ref: row.purchase_order_ref || '',
      category_id: row.category_id || '',
      location: row.location || '',
      department: row.department || '',
      custodian_name: row.custodian_name || '',
      serial_number: row.serial_number || '',
      asset_account_id: row.asset_account_id || '',
      payment_account_id: row.payment_account_id || '',
      depreciation_method: row.depreciation_method || 'straight-line',
      useful_life_years: String(row.useful_life_years ?? 5),
      residual_value: String(row.residual_value ?? 0),
      accumulated_depreciation_account_id: row.accumulated_depreciation_account_id || '',
      depreciation_expense_account_id: row.depreciation_expense_account_id || '',
      notes: row.notes || '',
    });
    setApproveCap(!!row.capitalisation_approved);
    setPreview(null);
    setEditorOpen(true);
  };

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      if (!isAdmin) throw new Error('Admin required');
      if (!draft.description.trim()) throw new Error('Description is required');
      const acquisition: Record<string, unknown> = {
        description: draft.description.trim(),
        asset_code: draft.asset_code.trim() || null,
        purchase_cost: Number(draft.purchase_cost) || 0,
        purchase_date: draft.purchase_date || null,
        supplier_id: draft.supplier_id || null,
        invoice_number: draft.invoice_number.trim() || null,
        purchase_order_ref: draft.purchase_order_ref.trim() || null,
        category_id: draft.category_id || null,
        location: draft.location.trim() || null,
        department: draft.department.trim() || null,
        custodian_name: draft.custodian_name.trim() || null,
        serial_number: draft.serial_number.trim() || null,
        asset_account_id: draft.asset_account_id || null,
        payment_account_id: draft.payment_account_id || null,
        depreciation_method: draft.depreciation_method || null,
        useful_life_years: Number(draft.useful_life_years) || null,
        residual_value: Number(draft.residual_value) || 0,
        accumulated_depreciation_account_id: draft.accumulated_depreciation_account_id || null,
        depreciation_expense_account_id: draft.depreciation_expense_account_id || null,
        notes: draft.notes.trim() || null,
        status: editing?.status || 'draft',
      };
      if (editing?.id) acquisition.id = editing.id;
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'UPSERT_ACQUISITION',
          company_id: activeCompany.id,
          acquisition,
        },
      });
      if (error) throw error;
      return data as AcquisitionRow;
    },
    onSuccess: (row) => {
      showSuccess(editing ? 'Acquisition updated.' : 'Draft acquisition created.');
      setEditing(row);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const advanceMutation = useMutation({
    mutationFn: async (args: {
      acquisitionId: string;
      nextStatus: AcquisitionStatus;
      capitalisation_approved?: boolean;
    }) => {
      if (!activeCompany) throw new Error('No company');
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'ADVANCE_ACQUISITION',
          company_id: activeCompany.id,
          acquisitionId: args.acquisitionId,
          nextStatus: args.nextStatus,
          capitalisation_approved: args.capitalisation_approved,
        },
      });
      if (error) throw error;
      return data as AcquisitionRow;
    },
    onSuccess: (row) => {
      showSuccess(`Status → ${row.status}`);
      setEditing(row);
      setApproveCap(!!row.capitalisation_approved);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const previewMutation = useMutation({
    mutationFn: async (acquisitionId: string) => {
      if (!activeCompany) throw new Error('No company');
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'PREVIEW_ACQUISITION_CAPITALISATION',
          company_id: activeCompany.id,
          acquisitionId,
        },
      });
      if (error) throw error;
      return data as typeof preview;
    },
    onSuccess: (data) => {
      setPreview(data);
      if (data?.valid) showSuccess('Capitalisation preview ready.');
      else showError(`Missing: ${(data?.missing || []).join(', ') || 'fields'}`);
    },
    onError: (e: Error) => showError(e.message),
  });

  const capitaliseMutation = useMutation({
    mutationFn: async (acquisitionId: string) => {
      if (!activeCompany) throw new Error('No company');
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'CAPITALISE_ACQUISITION',
          company_id: activeCompany.id,
          acquisitionId,
        },
      });
      if (error) throw error;
      return data as { asset_id: string; already?: boolean };
    },
    onSuccess: (data) => {
      showSuccess(data.already ? 'Already capitalised.' : 'Asset capitalised and journal posted.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['fixed_assets', activeCompany?.id] });
      setEditorOpen(false);
      if (data.asset_id) navigate(`/fixed-assets/${data.asset_id}`);
    },
    onError: (e: Error) => showError(e.message),
  });

  const rows = acquisitions || [];
  const kpis = useMemo(() => {
    const draftCount = rows.filter((r) => r.status === 'draft').length;
    const pipeline = rows.filter((r) =>
      ['purchased', 'received', 'pending_capitalisation'].includes(r.status)
    ).length;
    const capitalised = rows.filter((r) => r.status === 'capitalised').length;
    const cost = rows
      .filter((r) => r.status !== 'cancelled')
      .reduce((s, r) => s + Number(r.purchase_cost || 0), 0);
    return { draftCount, pipeline, capitalised, cost };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Acquisition Workbench</h1>
          <p className="text-sm text-muted-foreground">
            Purchase → Receive → Capitalise → Generate Asset → Journal → Ready
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsFormOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Quick create asset
          </Button>
          {isAdmin && (
            <Button onClick={openCreate}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              New acquisition
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Drafts', value: String(kpis.draftCount) },
          { label: 'In pipeline', value: String(kpis.pipeline) },
          { label: 'Capitalised', value: String(kpis.capitalised) },
          { label: 'Pipeline cost', value: formatCurrency(kpis.cost) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acquisitions</CardTitle>
          <CardDescription>Status pipeline and capitalisation workbench.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created / purchase</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice / PO</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length > 0 ? (
                rows.map((row) => {
                  const idx = pipelineIndex(row.status);
                  return (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => openEdit(row)}>
                      <TableCell className="text-sm">
                        {row.purchase_date
                          ? format(new Date(row.purchase_date), 'PPP')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.description}</div>
                        {row.asset_code && (
                          <div className="font-mono text-xs text-muted-foreground">{row.asset_code}</div>
                        )}
                        {row.generated_asset_id && (
                          <Link
                            to={`/fixed-assets/${row.generated_asset_id}`}
                            className="text-xs text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open asset workspace
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>{row.vendors?.name || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {[row.invoice_number, row.purchase_order_ref].filter(Boolean).join(' · ') ||
                          '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(row.purchase_cost)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)} className="capitalize">
                          {row.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          {PIPELINE.map((step, i) => (
                            <span key={`${step.label}-${i}`} className="flex items-center">
                              <span
                                className={
                                  idx >= i || (row.status === 'capitalised' && i >= 3)
                                    ? 'text-primary font-semibold'
                                    : ''
                                }
                              >
                                {step.label}
                              </span>
                              {i < PIPELINE.length - 1 && (
                                <ChevronRight className="h-3 w-3 mx-0.5 opacity-40" />
                              )}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={ShoppingCart}
                      title="No acquisitions yet"
                      description="Create a draft acquisition or use Quick create asset for the legacy path."
                      action={
                        isAdmin ? (
                          <Button onClick={openCreate}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New acquisition
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit acquisition' : 'New acquisition draft'}</DialogTitle>
            <DialogDescription>
              Advance through purchase → receive → capitalisation approval → capitalise.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2 py-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Input
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1">
              <Label>Asset code</Label>
              <Input
                value={draft.asset_code}
                onChange={(e) => setDraft((p) => ({ ...p, asset_code: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1">
              <Label>Purchase cost</Label>
              <Input
                type="number"
                value={draft.purchase_cost}
                onChange={(e) => setDraft((p) => ({ ...p, purchase_cost: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1">
              <Label>Purchase date</Label>
              <Input
                type="date"
                value={draft.purchase_date}
                onChange={(e) => setDraft((p) => ({ ...p, purchase_date: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1">
              <Label>Supplier</Label>
              <Select
                value={draft.supplier_id || undefined}
                onValueChange={(v) => setDraft((p) => ({ ...p, supplier_id: v }))}
                disabled={editing?.status === 'capitalised'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vendor" />
                </SelectTrigger>
                <SelectContent>
                  {((vendors as { id: string; name: string }[]) || []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Invoice #</Label>
              <Input
                value={draft.invoice_number}
                onChange={(e) => setDraft((p) => ({ ...p, invoice_number: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1">
              <Label>PO ref</Label>
              <Input
                value={draft.purchase_order_ref}
                onChange={(e) => setDraft((p) => ({ ...p, purchase_order_ref: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={draft.category_id || undefined}
                onValueChange={(v) => setDraft((p) => ({ ...p, category_id: v }))}
                disabled={editing?.status === 'capitalised'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {((categories as { id: string; name: string }[]) || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Asset account</Label>
              <Select
                value={draft.asset_account_id || undefined}
                onValueChange={(v) => setDraft((p) => ({ ...p, asset_account_id: v }))}
                disabled={editing?.status === 'capitalised'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="GL asset" />
                </SelectTrigger>
                <SelectContent>
                  {assetAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment account</Label>
              <Select
                value={draft.payment_account_id || undefined}
                onValueChange={(v) => setDraft((p) => ({ ...p, payment_account_id: v }))}
                disabled={editing?.status === 'capitalised'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bank / AP" />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Accum. depr account</Label>
              <Select
                value={draft.accumulated_depreciation_account_id || undefined}
                onValueChange={(v) =>
                  setDraft((p) => ({ ...p, accumulated_depreciation_account_id: v }))
                }
                disabled={editing?.status === 'capitalised'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {assetAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Depr expense account</Label>
              <Select
                value={draft.depreciation_expense_account_id || undefined}
                onValueChange={(v) =>
                  setDraft((p) => ({ ...p, depreciation_expense_account_id: v }))
                }
                disabled={editing?.status === 'capitalised'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Useful life (years)</Label>
              <Input
                type="number"
                value={draft.useful_life_years}
                onChange={(e) => setDraft((p) => ({ ...p, useful_life_years: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1">
              <Label>Residual</Label>
              <Input
                type="number"
                value={draft.residual_value}
                onChange={(e) => setDraft((p) => ({ ...p, residual_value: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                disabled={editing?.status === 'capitalised'}
              />
            </div>
          </div>

          {editing && editing.status !== 'capitalised' && editing.status !== 'cancelled' && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium">Advance status</p>
              <div className="flex flex-wrap gap-2">
                {nextAdvance[editing.status] && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isAdmin || advanceMutation.isPending}
                    onClick={() =>
                      advanceMutation.mutate({
                        acquisitionId: editing.id,
                        nextStatus: nextAdvance[editing.status]!,
                      })
                    }
                  >
                    Advance to {nextAdvance[editing.status]!.replace(/_/g, ' ')}
                  </Button>
                )}
                {editing.status === 'received' || editing.status === 'pending_capitalisation' ? (
                  <div className="flex items-center gap-2 w-full">
                    <Checkbox
                      id="cap-approve"
                      checked={approveCap}
                      onCheckedChange={(v) => setApproveCap(!!v)}
                    />
                    <Label htmlFor="cap-approve" className="text-sm font-normal">
                      Capitalisation approved (required before capitalise)
                    </Label>
                  </div>
                ) : null}
                {editing.status === 'received' && (
                  <Button
                    size="sm"
                    disabled={!isAdmin || !approveCap || advanceMutation.isPending}
                    onClick={() =>
                      advanceMutation.mutate({
                        acquisitionId: editing.id,
                        nextStatus: 'pending_capitalisation',
                        capitalisation_approved: true,
                      })
                    }
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Approve &amp; move to pending capitalisation
                  </Button>
                )}
                {(editing.status === 'pending_capitalisation' ||
                  editing.capitalisation_approved) && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={previewMutation.isPending}
                      onClick={() => previewMutation.mutate(editing.id)}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Preview capitalisation
                    </Button>
                    <Button
                      size="sm"
                      disabled={!isAdmin || capitaliseMutation.isPending}
                      onClick={() => capitaliseMutation.mutate(editing.id)}
                    >
                      Capitalise → create asset + journal
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {preview && (
            <Alert className="mt-2">
              <AlertTitle className="text-sm">
                Preview {preview.valid ? 'valid' : 'incomplete'}
              </AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                {!preview.valid && (
                  <p>Missing: {(preview.missing || []).join(', ')}</p>
                )}
                {preview.assetPreview && (
                  <pre className="overflow-auto rounded bg-muted p-2 max-h-32">
                    {JSON.stringify(preview.assetPreview, null, 2)}
                  </pre>
                )}
                {preview.journalPreview && (
                  <div>
                    <p className="font-medium mb-1">{preview.journalPreview.description}</p>
                    <ul className="list-disc pl-4">
                      {preview.journalPreview.lines.map((l, i) => (
                        <li key={i}>
                          {l.type} {formatCurrency(l.amount)} · acct {l.account_id}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {editing?.generated_asset_id && (
            <Button asChild variant="outline" className="w-fit">
              <Link to={`/fixed-assets/${editing.generated_asset_id}`}>Open generated asset</Link>
            </Button>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Close
            </Button>
            {editing?.status !== 'capitalised' && isAdmin && (
              <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
                Save draft
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
    </div>
  );
};

export default AssetAcquisitions;
