import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ClipboardCheck, PlusCircle } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  accountsQuery,
  inventoryCycleCountsQuery,
  inventoryWarehousesQuery,
  productsQuery,
} from '../../lib/queries';
import { invokeInventory } from '../../lib/inventory/client';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Account } from '../ChartOfAccounts';
import { Product } from '../Products';
import { showError, showSuccess } from '../../utils/toast';

type CountLine = {
  id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number | null;
};

const InventoryCounts = () => {
  useDocumentTitle('Cycle Counts');
  const { activeCompany } = useAuth();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [countDate, setCountDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeCountId, setActiveCountId] = useState<string | null>(null);
  const [inventoryAccountId, setInventoryAccountId] = useState('');
  const [adjustmentAccountId, setAdjustmentAccountId] = useState('');

  const { data: counts, isLoading } = useQuery({
    ...inventoryCycleCountsQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: warehouses } = useQuery({ ...inventoryWarehousesQuery(companyId), enabled: !!activeCompany });
  const { data: products } = useQuery({ ...productsQuery(companyId), enabled: !!activeCompany });
  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(companyId), enabled: !!activeCompany });
  const productMap = new Map((products as Product[] | undefined)?.map((p) => [p.id, p.name]) || []);

  const { data: lines, refetch: refetchLines } = useQuery({
    queryKey: ['inventory_cycle_count_lines', companyId, activeCountId],
    queryFn: async () => {
      if (!activeCountId) return [];
      const { data, error } = await supabase
        .from('inv_cycle_count_lines')
        .select('*')
        .eq('company_id', companyId)
        .eq('count_id', activeCountId);
      if (error) throw error;
      return (data || []) as CountLine[];
    },
    enabled: !!activeCountId && !!activeCompany,
  });

  const createCount = useMutation({
    mutationFn: async () => {
      return invokeInventory<{ id: string }>(companyId, {
        method: 'CREATE_CYCLE_COUNT',
        warehouseId,
        count_date: countDate,
        count_type: 'cycle',
      });
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_cycle_counts', companyId] });
      setActiveCountId(count.id);
      setCreateOpen(false);
      showSuccess('Cycle count created.');
    },
    onError: (e: Error) => showError(e.message),
  });

  const updateLine = useMutation({
    mutationFn: async ({ lineId, counted_qty }: { lineId: string; counted_qty: number }) => {
      await invokeInventory(companyId, {
        method: 'UPDATE_CYCLE_COUNT_LINE',
        lineId,
        counted_qty,
      });
    },
    onSuccess: () => {
      refetchLines();
    },
    onError: (e: Error) => showError(e.message),
  });

  const postCount = useMutation({
    mutationFn: async () => {
      if (!activeCountId) throw new Error('No count selected');
      await invokeInventory(companyId, {
        method: 'POST_CYCLE_COUNT',
        countId: activeCountId,
        inventoryAccountId: inventoryAccountId || undefined,
        adjustmentAccountId: adjustmentAccountId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_cycle_counts', companyId] });
      queryClient.invalidateQueries({ queryKey: ['inventory_register', companyId] });
      showSuccess('Cycle count posted.');
      setActiveCountId(null);
    },
    onError: (e: Error) => showError(e.message),
  });

  const assetAccounts = accounts?.filter((a) => a.type === 'Asset') || [];
  const expenseAccounts = accounts?.filter((a) => a.type === 'Expense') || [];

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-8 w-8 text-primary" />
            Cycle &amp; Physical Counts
          </h1>
          <p className="text-muted-foreground mt-1">Reconcile system quantities with the floor.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New count
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base">Count sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(counts || []).map((c) => (
                  <TableRow
                    key={String(c.id)}
                    className={`cursor-pointer ${activeCountId === String(c.id) ? 'bg-muted/60' : ''}`}
                    onClick={() => setActiveCountId(String(c.id))}
                  >
                    <TableCell className="font-mono">{String(c.count_number)}</TableCell>
                    <TableCell>{String(c.count_date)}</TableCell>
                    <TableCell>{(c.inv_warehouses as { code?: string })?.code || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'posted' ? 'default' : 'secondary'}>{String(c.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Count lines</CardTitle>
            {activeCountId && (
              <Button size="sm" onClick={() => postCount.mutate()} disabled={postCount.isPending}>
                Post count
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeCountId ? (
              <p className="text-muted-foreground text-sm">Select a count to enter quantities.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Inventory account</Label>
                    <Select value={inventoryAccountId} onValueChange={setInventoryAccountId}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
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
                    <Label className="text-xs">Variance account</Label>
                    <Select value={adjustmentAccountId} onValueChange={setAdjustmentAccountId}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        {expenseAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">System</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lines || []).map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{productMap.get(line.product_id) || line.product_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.system_qty}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="h-8 w-24 ml-auto text-right"
                            type="number"
                            step="any"
                            defaultValue={line.counted_qty ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v === '') return;
                              updateLine.mutate({ lineId: line.id, counted_qty: Number(v) });
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New cycle count</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {(warehouses || []).map((w) => (
                    <SelectItem key={String(w.id)} value={String(w.id)}>
                      {String(w.code)} — {String(w.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Count date</Label>
              <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createCount.mutate()} disabled={!warehouseId || createCount.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryCounts;
