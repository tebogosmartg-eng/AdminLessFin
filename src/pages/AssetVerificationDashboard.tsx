import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ClipboardCheck, Smartphone } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showError, showSuccess } from '../utils/toast';

type VerificationRow = {
  id: string;
  asset_code: string;
  description: string;
  location?: string | null;
  department?: string | null;
  verification_status?: string | null;
  last_verified_at?: string | null;
  next_verification_due?: string | null;
  verified_by_name?: string | null;
  qr_code?: string | null;
  barcode?: string | null;
  asset_tag?: string | null;
  status?: string;
  asset_categories?: { name: string } | null;
};

function statusVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (status) {
    case 'verified':
      return 'success';
    case 'overdue':
    case 'disputed':
      return 'destructive';
    case 'in_progress':
      return 'warning';
    default:
      return 'secondary';
  }
}

const AssetVerificationDashboard = () => {
  useDocumentTitle('Asset Verification');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeCompany, session } = useAuth();
  const [selected, setSelected] = useState<VerificationRow | null>(null);
  const [form, setForm] = useState({
    status: 'verified',
    verification_method: 'manual',
    location_confirmed: '',
    next_verification_due: '',
    notes: '',
    verifier_name: '',
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['asset_verification_dashboard', activeCompany?.id],
    queryFn: async (): Promise<VerificationRow[]> => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'LIST_VERIFICATION_DASHBOARD',
          company_id: activeCompany.id,
        },
      });
      if (error) throw error;
      return (data as VerificationRow[]) || [];
    },
    enabled: !!activeCompany,
  });

  const kpis = useMemo(() => {
    const list = rows ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let verified = 0;
    let unverified = 0;
    let overdue = 0;
    for (const r of list) {
      const st = r.verification_status || 'unverified';
      if (st === 'verified') verified += 1;
      else unverified += 1;
      if (
        st === 'overdue' ||
        (r.next_verification_due && new Date(r.next_verification_due) < today)
      ) {
        overdue += 1;
      }
    }
    return { verified, unverified, overdue, total: list.length };
  }, [rows]);

  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !selected) throw new Error('Select an asset');
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'RECORD_VERIFICATION',
          company_id: activeCompany.id,
          assetId: selected.id,
          verification: {
            status: form.status,
            verification_method: form.verification_method,
            location_confirmed: form.location_confirmed.trim() || selected.location || null,
            next_verification_due: form.next_verification_due || null,
            notes: form.notes.trim() || null,
            verifier_name:
              form.verifier_name.trim() || session?.user?.email || 'Verifier',
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Verification recorded. (No journals posted.)');
      queryClient.invalidateQueries({
        queryKey: ['asset_verification_dashboard', activeCompany?.id],
      });
      queryClient.invalidateQueries({ queryKey: ['fixed_assets', activeCompany?.id] });
      setSelected(null);
    },
    onError: (e: Error) => showError(e.message),
  });

  const openPanel = (row: VerificationRow) => {
    setSelected(row);
    setForm({
      status: 'verified',
      verification_method: 'manual',
      location_confirmed: row.location || '',
      next_verification_due: '',
      notes: '',
      verifier_name: session?.user?.email || '',
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asset Verification</h1>
        <p className="text-sm text-muted-foreground">
          Physical verification dashboard — architecture ready for mobile QR / barcode capture.
        </p>
      </div>

      <Alert className="border-muted bg-muted/30">
        <Smartphone className="h-4 w-4" />
        <AlertTitle className="text-sm">Mobile-ready architecture</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          QR, barcode, and asset tag fields are populated for a future mobile verifier. Desktop
          recording is available now; no mobile client in this release.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Verified</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-emerald-700">{kpis.verified}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Unverified / other</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.unverified}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Overdue</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-red-700">{kpis.overdue}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className={`grid gap-4 ${selected ? 'lg:grid-cols-[1fr_340px]' : ''}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification register</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading…' : `${kpis.total} active assets`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>QR</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Asset Tag</TableHead>
                  <TableHead>Last Verified</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verifier</TableHead>
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
                ) : (rows ?? []).length > 0 ? (
                  (rows ?? []).map((row) => (
                    <TableRow
                      key={row.id}
                      className={`cursor-pointer ${selected?.id === row.id ? 'bg-muted/50' : ''}`}
                      onClick={() => openPanel(row)}
                      onDoubleClick={() => navigate(`/fixed-assets/${row.id}`)}
                    >
                      <TableCell>
                        <div className="font-mono text-sm">{row.asset_code}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {row.description}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.qr_code || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.barcode || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.asset_tag || '—'}</TableCell>
                      <TableCell>
                        {row.last_verified_at
                          ? format(new Date(row.last_verified_at), 'PP')
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        {row.next_verification_due
                          ? format(new Date(row.next_verification_due), 'PP')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.verification_status)}>
                          {row.verification_status || 'unverified'}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.verified_by_name || '—'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EmptyState
                        icon={ClipboardCheck}
                        title="Nothing to verify"
                        description="Active fixed assets will appear here for physical verification."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {selected && (
          <Card className="h-fit sticky top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Record verification</CardTitle>
              <CardDescription className="font-mono">{selected.asset_code}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">{selected.description}</p>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                    <SelectItem value="missing">Missing</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select
                  value={form.verification_method}
                  onValueChange={(v) => setForm((f) => ({ ...f, verification_method: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="qr">QR</SelectItem>
                    <SelectItem value="barcode">Barcode</SelectItem>
                    <SelectItem value="asset_tag">Asset tag</SelectItem>
                    <SelectItem value="physical">Physical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location confirmed</Label>
                <Input
                  value={form.location_confirmed}
                  onChange={(e) => setForm((f) => ({ ...f, location_confirmed: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Next due</Label>
                <Input
                  type="date"
                  value={form.next_verification_due}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, next_verification_due: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Verifier</Label>
                <Input
                  value={form.verifier_name}
                  onChange={(e) => setForm((f) => ({ ...f, verifier_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button disabled={recordMutation.isPending} onClick={() => recordMutation.mutate()}>
                  {recordMutation.isPending ? 'Saving…' : 'Record verification'}
                </Button>
                <Button variant="outline" onClick={() => navigate(`/fixed-assets/${selected.id}`)}>
                  Open asset workspace
                </Button>
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AssetVerificationDashboard;
