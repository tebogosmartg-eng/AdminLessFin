import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Truck, PlusCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  accountsQuery,
  inventoryGoodsReceiptsQuery,
  inventoryWarehousesQuery,
  productsQuery,
  vendorsQuery,
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

type GrnLine = { product_id: string; qty_received: number; unit_cost: number };

const InventoryReceipts = () => {
  useDocumentTitle('Goods Receipts');
  const { activeCompany } = useAuth();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [postOpen, setPostOpen] = useState<string | null>(null);
  const [inventoryAccountId, setInventoryAccountId] = useState('');
  const [grniAccountId, setGrniAccountId] = useState('');

  const [receiptDate, setReceiptDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [vendorId, setVendorId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<GrnLine[]>([{ product_id: '', qty_received: 1, unit_cost: 0 }]);

  const { data: receipts, isLoading } = useQuery({
    ...inventoryGoodsReceiptsQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: warehouses } = useQuery({ ...inventoryWarehousesQuery(companyId), enabled: !!activeCompany });
  const { data: vendors } = useQuery({ ...vendorsQuery(companyId), enabled: !!activeCompany });
  const { data: products } = useQuery({ ...productsQuery(companyId), enabled: !!activeCompany });
  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(companyId), enabled: !!activeCompany });

  const assetAccounts = accounts?.filter((a) => a.type === 'Asset') || [];
  const liabilityAccounts = accounts?.filter((a) => a.type === 'Liability' || a.type === 'Expense') || [];
  const inventoryProducts = (products as Product[] | undefined)?.filter((p) => p.type === 'inventory') || [];

  const saveDraft = useMutation({
    mutationFn: async () => {
      const wh = warehouseId || (warehouses?.[0] ? String(warehouses[0].id) : '');
      await invokeInventory(companyId, {
        method: 'UPSERT_GOODS_RECEIPT',
        receipt: {
          receipt_date: receiptDate,
          vendor_id: vendorId || null,
          warehouse_id: wh,
          status: 'draft',
        },
        lines: lines
          .filter((l) => l.product_id)
          .map((l) => ({
            product_id: l.product_id,
            qty_received: l.qty_received,
            unit_cost: l.unit_cost,
          })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_goods_receipts', companyId] });
      showSuccess('Goods receipt draft saved.');
      setCreateOpen(false);
      setLines([{ product_id: '', qty_received: 1, unit_cost: 0 }]);
    },
    onError: (e: Error) => showError(e.message),
  });

  const postReceipt = useMutation({
    mutationFn: async (receiptId: string) => {
      await invokeInventory(companyId, {
        method: 'POST_GOODS_RECEIPT',
        receiptId,
        inventoryAccountId: inventoryAccountId || undefined,
        grniAccountId: grniAccountId || undefined,
        offsetAccountId: grniAccountId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_goods_receipts', companyId] });
      queryClient.invalidateQueries({ queryKey: ['inventory_register', companyId] });
      showSuccess('Goods receipt posted to inventory.');
      setPostOpen(null);
    },
    onError: (e: Error) => showError(e.message),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-8 w-8 text-primary" />
            Goods Receipts (GRN)
          </h1>
          <p className="text-muted-foreground mt-1">Draft receipts and post to stock &amp; GL.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New draft
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(receipts || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No goods receipts yet.
                  </TableCell>
                </TableRow>
              ) : (
                (receipts || []).map((r) => (
                  <TableRow key={String(r.id)}>
                    <TableCell className="font-mono">{String(r.receipt_number)}</TableCell>
                    <TableCell>{String(r.receipt_date)}</TableCell>
                    <TableCell>{(r.vendors as { name?: string })?.name || '—'}</TableCell>
                    <TableCell>
                      {(r.inv_warehouses as { code?: string })?.code || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'received' ? 'default' : 'secondary'}>{String(r.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status !== 'received' && (
                        <Button size="sm" onClick={() => setPostOpen(String(r.id))}>
                          Post
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create goods receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Receipt date</Label>
                <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Warehouse</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses || []).map((w) => (
                      <SelectItem key={String(w.id)} value={String(w.id)}>
                        {String(w.code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {(vendors as { id: string; name: string }[] | undefined)?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lines</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <Select
                      value={line.product_id}
                      onValueChange={(v) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], product_id: v };
                        setLines(next);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                      <SelectContent>
                        {inventoryProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={line.qty_received}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], qty_received: Number(e.target.value) };
                        setLines(next);
                      }}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Cost"
                      value={line.unit_cost}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], unit_cost: Number(e.target.value) };
                        setLines(next);
                      }}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines([...lines, { product_id: '', qty_received: 1, unit_cost: 0 }])}
              >
                Add line
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!postOpen} onOpenChange={(o) => !o && setPostOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post goods receipt</DialogTitle>
          </DialogHeader>
          <Card className="border-0 shadow-none">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                Select GL accounts for inventory capitalization and GRNI / offset.
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-3">
              <div className="space-y-1">
                <Label>Inventory asset account</Label>
                <Select value={inventoryAccountId} onValueChange={setInventoryAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
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
                <Label>GRNI / offset account</Label>
                <Select value={grniAccountId} onValueChange={setGrniAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {liabilityAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostOpen(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => postOpen && postReceipt.mutate(postOpen)}
              disabled={postReceipt.isPending || !inventoryAccountId || !grniAccountId}
            >
              Post receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryReceipts;
