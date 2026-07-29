import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Layers } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { assetCategoriesQuery } from '../../lib/queries';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Alert, AlertDescription } from '../ui/alert';
import { showError, showSuccess } from '../../utils/toast';
import type { BulkOperationType } from '../../lib/assets/lifecycleTypes';

type Props = {
  assetIds: string[];
  onComplete?: () => void;
};

const OPS: { value: BulkOperationType; label: string }[] = [
  { value: 'transfer', label: 'Bulk Transfer' },
  { value: 'verification', label: 'Verification' },
  { value: 'category_update', label: 'Category Update' },
  { value: 'custodian_update', label: 'Custodian Update' },
  { value: 'location_update', label: 'Location Update' },
  { value: 'maintenance_schedule', label: 'Maintenance Scheduling' },
  { value: 'label_generation', label: 'Label Generation' },
  { value: 'disposal_preview', label: 'Disposal Preview' },
];

type PreviewResult = {
  operation_type: string;
  assets: { id: string; asset_code: string; description: string; status: string }[];
  validation_errors: { asset_id: string; message: string }[];
  valid: boolean;
  payload: Record<string, unknown>;
};

type ConfirmResult = {
  audit?: { id: string; status: string; created_at?: string; result_summary?: unknown };
  result?: { updated: number; skipped: number; details?: unknown[] };
  validation_errors?: { asset_id: string; message: string }[];
};

const AssetBulkOperationsPanel = ({ assetIds, onComplete }: Props) => {
  const { activeCompany, role } = useAuth();
  const isAdmin = role === 'owner' || role === 'admin';
  const queryClient = useQueryClient();
  const [op, setOp] = useState<BulkOperationType>('transfer');
  const [payload, setPayload] = useState({
    location: '',
    department: '',
    custodian_name: '',
    category_id: '',
    reason: '',
    notes: '',
    next_verification_due: '',
    title: 'Scheduled service',
    frequency_months: '12',
    next_service_date: '',
  });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);

  const { data: categories } = useQuery({
    ...assetCategoriesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const buildPayload = (): Record<string, unknown> => {
    switch (op) {
      case 'transfer':
        return {
          location: payload.location || undefined,
          department: payload.department || undefined,
          custodian_name: payload.custodian_name || undefined,
          reason: payload.reason || undefined,
        };
      case 'location_update':
        return { location: payload.location || undefined, department: payload.department || undefined };
      case 'custodian_update':
        return { custodian_name: payload.custodian_name || undefined };
      case 'category_update':
        return { category_id: payload.category_id || undefined };
      case 'verification':
        return {
          notes: payload.notes || undefined,
          next_verification_due: payload.next_verification_due || undefined,
        };
      case 'maintenance_schedule':
        return {
          title: payload.title || 'Scheduled service',
          frequency_months: Number(payload.frequency_months) || 12,
          next_service_date: payload.next_service_date || null,
          notes: payload.notes || undefined,
        };
      case 'label_generation':
      case 'disposal_preview':
        return {};
      default:
        return {};
    }
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'BULK_PREVIEW',
          company_id: activeCompany.id,
          assetIds,
          operation_type: op,
          payload: buildPayload(),
        },
      });
      if (error) throw error;
      return data as PreviewResult;
    },
    onSuccess: (data) => {
      setPreview(data);
      setConfirmResult(null);
      showSuccess(data.valid ? 'Preview ready.' : 'Preview has validation issues.');
    },
    onError: (e: Error) => showError(e.message),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      if (!isAdmin) throw new Error('Admin required for bulk confirm');
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'BULK_CONFIRM',
          company_id: activeCompany.id,
          assetIds,
          operation_type: op,
          payload: buildPayload(),
        },
      });
      if (error) throw error;
      return data as ConfirmResult;
    },
    onSuccess: (data) => {
      setConfirmResult(data);
      queryClient.invalidateQueries({ queryKey: ['fixed_assets', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['asset_register'] });
      queryClient.invalidateQueries({ queryKey: ['asset_register_facets'] });
      queryClient.invalidateQueries({ queryKey: ['asset_bulk_ops', activeCompany?.id] });
      showSuccess(
        `Bulk ${op}: ${data.result?.updated ?? 0} updated, ${data.result?.skipped ?? 0} skipped.`
      );
      onComplete?.();
    },
    onError: (e: Error) => showError(e.message),
  });

  const { data: auditLog } = useQuery({
    queryKey: ['asset_bulk_ops', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'LIST_BULK_OPERATIONS', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return (data as { id: string; operation_type: string; status: string; created_at: string; performed_by_name?: string }[]) || [];
    },
    enabled: !!activeCompany,
  });

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Bulk operations · {assetIds.length} asset(s)
        </CardTitle>
        <CardDescription>
          Preview then confirm. Disposal preview does not dispose — use per-asset dispose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isAdmin && (
          <Alert>
            <AlertDescription className="text-sm">
              You can preview bulk operations. Confirm requires owner/admin.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Operation</Label>
            <Select
              value={op}
              onValueChange={(v) => {
                setOp(v as BulkOperationType);
                setPreview(null);
                setConfirmResult(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(op === 'transfer' || op === 'location_update') && (
            <>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input
                  value={payload.location}
                  onChange={(e) => setPayload((p) => ({ ...p, location: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Department</Label>
                <Input
                  value={payload.department}
                  onChange={(e) => setPayload((p) => ({ ...p, department: e.target.value }))}
                />
              </div>
            </>
          )}

          {(op === 'transfer' || op === 'custodian_update') && (
            <div className="space-y-1">
              <Label>Custodian</Label>
              <Input
                value={payload.custodian_name}
                onChange={(e) => setPayload((p) => ({ ...p, custodian_name: e.target.value }))}
              />
            </div>
          )}

          {op === 'category_update' && (
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={payload.category_id}
                onValueChange={(v) => setPayload((p) => ({ ...p, category_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
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
          )}

          {op === 'verification' && (
            <>
              <div className="space-y-1">
                <Label>Next verification due</Label>
                <Input
                  type="date"
                  value={payload.next_verification_due}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, next_verification_due: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={payload.notes}
                  onChange={(e) => setPayload((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </>
          )}

          {op === 'maintenance_schedule' && (
            <>
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={payload.title}
                  onChange={(e) => setPayload((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Frequency (months)</Label>
                <Input
                  type="number"
                  value={payload.frequency_months}
                  onChange={(e) => setPayload((p) => ({ ...p, frequency_months: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Next service date</Label>
                <Input
                  type="date"
                  value={payload.next_service_date}
                  onChange={(e) => setPayload((p) => ({ ...p, next_service_date: e.target.value }))}
                />
              </div>
            </>
          )}

          {op === 'transfer' && (
            <div className="space-y-1 sm:col-span-2">
              <Label>Reason</Label>
              <Input
                value={payload.reason}
                onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || assetIds.length === 0}
          >
            Preview
          </Button>
          <Button
            type="button"
            onClick={() => confirmMutation.mutate()}
            disabled={!isAdmin || confirmMutation.isPending || assetIds.length === 0}
          >
            Confirm
          </Button>
        </div>

        {preview && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Preview</span>
              <Badge variant={preview.valid ? 'success' : 'destructive'}>
                {preview.valid ? 'valid' : 'issues'}
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm">{a.asset_code}</TableCell>
                    <TableCell>{a.description}</TableCell>
                    <TableCell className="capitalize">{a.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.validation_errors.length > 0 && (
              <ul className="text-xs text-destructive list-disc pl-4">
                {preview.validation_errors.map((e, i) => (
                  <li key={`${e.asset_id}-${i}`}>
                    {e.asset_id}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {confirmResult && (
          <Alert>
            <AlertDescription className="text-sm space-y-1">
              <div>
                Confirmed · updated {confirmResult.result?.updated ?? 0} · skipped{' '}
                {confirmResult.result?.skipped ?? 0}
              </div>
              {confirmResult.audit?.id && (
                <div className="text-xs text-muted-foreground font-mono">
                  Audit {confirmResult.audit.id} · {confirmResult.audit.status}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {(auditLog?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent bulk audit</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLog!.slice(0, 8).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">
                      {row.created_at ? format(new Date(row.created_at), 'PPp') : '—'}
                    </TableCell>
                    <TableCell className="capitalize text-sm">
                      {(row.operation_type || '').replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{row.performed_by_name || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AssetBulkOperationsPanel;
