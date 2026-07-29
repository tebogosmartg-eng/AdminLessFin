import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  accountsQuery,
  inventoryValuationEdgeQuery,
  inventoryWarehousesQuery,
  productsQuery,
} from '../../lib/queries';
import { invokeInventory } from '../../lib/inventory/client';
import { formatCurrency } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
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
  TableFooter,
} from '../../components/ui/table';
import { Account } from '../ChartOfAccounts';
import { Product } from '../Products';
import { showError, showSuccess } from '../../utils/toast';

type ValuationRow = {
  id: string;
  name: string;
  sku?: string | null;
  quantity_on_hand: number;
  unit_cost: number;
  asset_value: number;
};

const InventoryCosting = () => {
  useDocumentTitle('Inventory Costing');
  const { activeCompany } = useAuth();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();

  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [unitCostTo, setUnitCostTo] = useState('');
  const [reason, setReason] = useState('');
  const [inventoryAccountId, setInventoryAccountId] = useState('');
  const [varianceAccountId, setVarianceAccountId] = useState('');

  const { data: valuation, isLoading } = useQuery({
    ...inventoryValuationEdgeQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: warehouses } = useQuery({ ...inventoryWarehousesQuery(companyId), enabled: !!activeCompany });
  const { data: products } = useQuery({ ...productsQuery(companyId), enabled: !!activeCompany });
  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(companyId), enabled: !!activeCompany });

  const rows = (valuation || []) as ValuationRow[];
  const totalValue = rows.reduce((s, r) => s + Number(r.asset_value || 0), 0);
  const inventoryProducts = (products as Product[] | undefined)?.filter((p) => p.type === 'inventory') || [];
  const assetAccounts = accounts?.filter((a) => a.type === 'Asset') || [];
  const expenseAccounts = accounts?.filter((a) => a.type === 'Expense') || [];

  const costAdjust = useMutation({
    mutationFn: async () => {
      await invokeInventory(companyId, {
        method: 'COST_ADJUSTMENT',
        productId,
        warehouseId: warehouseId || undefined,
        unitCostTo: Number(unitCostTo),
        reason,
        adjustment_type: 'revaluation',
        inventoryAccountId: inventoryAccountId || undefined,
        varianceAccountId: varianceAccountId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_valuation_edge', companyId] });
      queryClient.invalidateQueries({ queryKey: ['inventory_register', companyId] });
      showSuccess('Cost adjustment posted.');
      setUnitCostTo('');
      setReason('');
    },
    onError: (e: Error) => showError(e.message),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="h-8 w-8 text-primary" />
          Inventory Costing
        </h1>
        <p className="text-muted-foreground mt-1">Valuation register and cost revaluations.</p>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Cost adjustment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {inventoryProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Default" /></SelectTrigger>
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
            <Label>New unit cost</Label>
            <Input type="number" step="0.01" value={unitCostTo} onChange={(e) => setUnitCostTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Inventory account</Label>
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
            <Label>Variance account</Label>
            <Select value={varianceAccountId} onValueChange={setVarianceAccountId}>
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
          <div className="space-y-1 md:col-span-2 lg:col-span-3">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Revaluation note" />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <Button
              onClick={() => costAdjust.mutate()}
              disabled={costAdjust.isPending || !productId || !unitCostTo}
            >
              Apply cost adjustment
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Valuation (GET_VALUATION)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Asset value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No stock items to value.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.sku || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity_on_hand}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(r.unit_cost)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatCurrency(r.asset_value)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(totalValue)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryCosting;
