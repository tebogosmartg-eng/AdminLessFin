import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Layers, PlusCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { inventoryTransfersQuery, inventoryWarehousesQuery, productsQuery } from '../../lib/queries';
import { invokeInventory } from '../../lib/inventory/client';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent } from '../../components/ui/card';
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
import { Product } from '../Products';
import { showError, showSuccess } from '../../utils/toast';

const InventoryTransfers = () => {
  useDocumentTitle('Inventory Transfers');
  const { activeCompany } = useAuth();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  const { data: transfers, isLoading } = useQuery({
    ...inventoryTransfersQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: warehouses } = useQuery({ ...inventoryWarehousesQuery(companyId), enabled: !!activeCompany });
  const { data: products } = useQuery({ ...productsQuery(companyId), enabled: !!activeCompany });
  const inventoryProducts = (products as Product[] | undefined)?.filter((p) => p.type === 'inventory') || [];

  const createTransfer = useMutation({
    mutationFn: async () => {
      await invokeInventory(companyId, {
        method: 'TRANSFER',
        productId,
        qty,
        fromWarehouseId,
        toWarehouseId,
        date,
        notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_transfers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['inventory_register', companyId] });
      showSuccess('Transfer completed.');
      setOpen(false);
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
            <Layers className="h-8 w-8 text-primary" />
            Inventory Transfers
          </h1>
          <p className="text-muted-foreground mt-1">Move stock between warehouses.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New transfer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transfers || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No transfers recorded.
                  </TableCell>
                </TableRow>
              ) : (
                (transfers || []).map((t) => (
                  <TableRow key={String(t.id)}>
                    <TableCell className="font-mono">{String(t.transfer_number)}</TableCell>
                    <TableCell>{String(t.transfer_date)}</TableCell>
                    <TableCell>{(t.products as { name?: string })?.name || '—'}</TableCell>
                    <TableCell>{(t.from_wh as { code?: string })?.code || '—'}</TableCell>
                    <TableCell>{(t.to_wh as { code?: string })?.code || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{String(t.qty)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{String(t.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {inventoryProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From warehouse</Label>
                <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="From" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses || []).map((w) => (
                      <SelectItem key={String(w.id)} value={String(w.id)}>
                        {String(w.code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>To warehouse</Label>
                <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="To" /></SelectTrigger>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input type="number" min={0.0001} step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTransfer.mutate()}
              disabled={
                createTransfer.isPending ||
                !productId ||
                !fromWarehouseId ||
                !toWarehouseId ||
                fromWarehouseId === toWarehouseId
              }
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryTransfers;
