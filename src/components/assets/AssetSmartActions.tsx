import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightLeft,
  Ban,
  ClipboardCheck,
  FileUp,
  Gauge,
  Printer,
  QrCode,
  TrendingDown,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { showError, showSuccess } from '../../utils/toast';

type AssetLike = {
  id: string;
  asset_code: string;
  description: string;
  status: string;
  verification_status?: string | null;
  location?: string | null;
  department?: string | null;
  custodian_name?: string | null;
  qr_code?: string | null;
  barcode?: string | null;
  asset_tag?: string | null;
};

type Props = {
  asset: AssetLike;
  onDispose?: () => void;
  onNavigateTab?: (tab: string) => void;
  workspaceQueryKey?: unknown[];
};

const AssetSmartActions = ({ asset, onDispose, onNavigateTab, workspaceQueryKey }: Props) => {
  const { activeCompany, role } = useAuth();
  const isAdmin = role === 'owner' || role === 'admin';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [transferOpen, setTransferOpen] = useState(false);
  const [revalueOpen, setRevalueOpen] = useState(false);
  const [impairOpen, setImpairOpen] = useState(false);
  const [transfer, setTransfer] = useState({
    location: asset.location || '',
    department: asset.department || '',
    custodian_name: asset.custodian_name || '',
    reason: '',
  });
  const [revalue, setRevalue] = useState({ amount: '', reason: '', revaluation_date: new Date().toISOString().slice(0, 10) });
  const [impair, setImpair] = useState({ amount: '', reason: '' });

  const invalidate = () => {
    if (workspaceQueryKey) queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
    queryClient.invalidateQueries({ queryKey: ['fixed_assets', activeCompany?.id] });
  };

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'PATCH_METADATA',
          company_id: activeCompany.id,
          assetId: asset.id,
          reason: transfer.reason.trim() || 'Transfer / custody update',
          patch: {
            location: transfer.location.trim() || null,
            department: transfer.department.trim() || null,
            custodian_name: transfer.custodian_name.trim() || null,
            lifecycle_stage: 'transferred',
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Transfer recorded. (No journals posted.)');
      setTransferOpen(false);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const revalueMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      if (!isAdmin) throw new Error('Admin required');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'RECORD_REVALUATION',
          company_id: activeCompany.id,
          assetId: asset.id,
          amount: Number(revalue.amount) || 0,
          reason: revalue.reason.trim() || undefined,
          revaluation_date: revalue.revaluation_date || undefined,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Revaluation memo recorded. (No journals posted.)');
      setRevalueOpen(false);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const impairMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      if (!isAdmin) throw new Error('Admin required');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'RECORD_IMPAIRMENT',
          company_id: activeCompany.id,
          assetId: asset.id,
          amount: Number(impair.amount) || 0,
          reason: impair.reason.trim() || undefined,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Impairment indicator recorded. (No journals posted.)');
      setImpairOpen(false);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const qrMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'GENERATE_QR_LABEL',
          company_id: activeCompany.id,
          assetId: asset.id,
        },
      });
      if (error) throw error;
      return data as AssetLike;
    },
    onSuccess: () => {
      showSuccess('QR / barcode / tag ensured.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const printLabel = () => {
    const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=520');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Asset Label · ${asset.asset_code}</title>
      <style>
        body{font-family:Segoe UI,system-ui,sans-serif;padding:24px;text-align:center}
        h1{font-size:18px;margin:0 0 4px} .code{font-family:ui-monospace,monospace;font-size:22px;margin:12px 0}
        .meta{font-size:12px;color:#475569;margin:4px 0}
      </style></head><body>
      <h1>${asset.description}</h1>
      <div class="code">${asset.asset_code}</div>
      <p class="meta">Tag: ${asset.asset_tag || asset.asset_code}</p>
      <p class="meta">QR: ${asset.qr_code || `QR-${asset.asset_code}`}</p>
      <p class="meta">Barcode: ${asset.barcode || `BC-${asset.asset_code}`}</p>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    w.document.close();
  };

  const disposed = asset.status === 'disposed';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!disposed && (
          <Button type="button" size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
            Transfer
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => navigate('/assets/verification')}
        >
          <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
          Verify
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onNavigateTab?.('maintenance') ?? navigate('/assets/maintenance')}
        >
          <Wrench className="mr-1.5 h-3.5 w-3.5" />
          Maintain
        </Button>
        {isAdmin && !disposed && (
          <Button type="button" size="sm" variant="outline" onClick={() => setRevalueOpen(true)}>
            <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
            Revalue
          </Button>
        )}
        {isAdmin && !disposed && (
          <Button type="button" size="sm" variant="outline" onClick={() => setImpairOpen(true)}>
            <TrendingDown className="mr-1.5 h-3.5 w-3.5" />
            Impair
          </Button>
        )}
        {!disposed && onDispose && (
          <Button type="button" size="sm" variant="outline" onClick={onDispose}>
            <Ban className="mr-1.5 h-3.5 w-3.5" />
            Dispose
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onNavigateTab?.('documents')}
        >
          <FileUp className="mr-1.5 h-3.5 w-3.5" />
          Documents
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => qrMutation.mutate()}
          disabled={qrMutation.isPending}
        >
          <QrCode className="mr-1.5 h-3.5 w-3.5" />
          Generate QR
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={printLabel}>
          <Printer className="mr-1.5 h-3.5 w-3.5" />
          Print label
        </Button>
      </div>

      <Alert className="mt-2 border-muted bg-muted/30">
        <Gauge className="h-4 w-4" />
        <AlertDescription className="text-xs text-muted-foreground">
          Parent asset depreciation is handled by the system cron (<code>run-depreciation</code>).
          Component depreciation is memo-only from the Components tab — no journals.
        </AlertDescription>
      </Alert>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer asset</DialogTitle>
            <DialogDescription>Update location, department, or custodian. No journals posted.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={transfer.location}
                onChange={(e) => setTransfer((p) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Input
                value={transfer.department}
                onChange={(e) => setTransfer((p) => ({ ...p, department: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Custodian</Label>
              <Input
                value={transfer.custodian_name}
                onChange={(e) => setTransfer((p) => ({ ...p, custodian_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={transfer.reason}
                onChange={(e) => setTransfer((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending}>
              Save transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revalueOpen} onOpenChange={setRevalueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record revaluation (memo)</DialogTitle>
            <DialogDescription>Indicator only — does not post journals.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                value={revalue.amount}
                onChange={(e) => setRevalue((p) => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={revalue.revaluation_date}
                onChange={(e) => setRevalue((p) => ({ ...p, revaluation_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={revalue.reason}
                onChange={(e) => setRevalue((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevalueOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => revalueMutation.mutate()} disabled={revalueMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={impairOpen} onOpenChange={setImpairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record impairment (indicator)</DialogTitle>
            <DialogDescription>Adds to impairment amount — does not post journals.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                value={impair.amount}
                onChange={(e) => setImpair((p) => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={impair.reason}
                onChange={(e) => setImpair((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImpairOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => impairMutation.mutate()} disabled={impairMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssetSmartActions;
