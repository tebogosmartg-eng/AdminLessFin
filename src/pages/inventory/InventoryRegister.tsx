import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { inventoryRegisterQuery, inventoryWarehousesQuery } from '../../lib/queries';
import { formatCurrency } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
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
} from '../../components/ui/table';
import { valuationAmount } from '../../lib/inventory/costing';

type SavedView = {
  id: string;
  name: string;
  search: string;
  warehouseId: string;
  stockFilter: string;
};

type RegisterProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  type: string;
  item_class?: string | null;
  cost_method?: string | null;
  quantity_on_hand?: number;
  reorder_level?: number | null;
  stock_status?: string | null;
  category_name?: string | null;
  cost?: number | null;
  vendors?: { name: string } | null;
};

type BalanceRow = {
  id: string;
  product_id: string;
  warehouse_id: string;
  qty_on_hand: number;
  qty_reserved: number;
  avg_unit_cost: number;
  inv_warehouses?: { code: string; name: string } | null;
  inv_locations?: { code: string; name: string } | null;
};

function viewsKey(companyId: string) {
  return `inv.v170.views.${companyId}`;
}

function loadViews(companyId: string): SavedView[] {
  try {
    const raw = localStorage.getItem(viewsKey(companyId));
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

function saveViews(companyId: string, views: SavedView[]) {
  localStorage.setItem(viewsKey(companyId), JSON.stringify(views));
}

const InventoryRegister = () => {
  useDocumentTitle('Inventory Register');
  const { activeCompany } = useAuth();
  const companyId = activeCompany!.id;

  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadViews(companyId));
  const [viewName, setViewName] = useState('');

  const { data, isLoading } = useQuery({
    ...inventoryRegisterQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: warehouses } = useQuery({
    ...inventoryWarehousesQuery(companyId),
    enabled: !!activeCompany,
  });

  const products = (data?.products || []) as RegisterProduct[];
  const balances = (data?.balances || []) as BalanceRow[];

  const balanceByProduct = useMemo(() => {
    const map = new Map<string, BalanceRow[]>();
    for (const b of balances) {
      const list = map.get(b.product_id) || [];
      list.push(b);
      map.set(b.product_id, list);
    }
    return map;
  }, [balances]);

  const rows = useMemo(() => {
    return products
      .filter((p) => p.type === 'inventory' && p.item_class !== 'service')
      .map((p) => {
        const bl = balanceByProduct.get(p.id) || [];
        const filtered =
          warehouseId === 'all' ? bl : bl.filter((b) => b.warehouse_id === warehouseId);
        const qty = filtered.reduce((s, b) => s + Number(b.qty_on_hand), 0);
        const reserved = filtered.reduce((s, b) => s + Number(b.qty_reserved), 0);
        const value = filtered.reduce(
          (s, b) => s + valuationAmount(b.qty_on_hand, b.avg_unit_cost),
          0
        );
        const unitCost = qty > 0 ? value / qty : Number(p.cost) || 0;
        const reorder = Number(p.reorder_level) || 0;
        const low = reorder > 0 && qty <= reorder;
        return { product: p, qty, reserved, value, unitCost, low, balances: filtered };
      });
  }, [products, balanceByProduct, warehouseId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stockFilter === 'low' && !r.low) return false;
      if (stockFilter === 'out' && r.qty > 0) return false;
      if (stockFilter === 'in' && r.qty <= 0) return false;
      if (!q) return true;
      const p = r.product;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.category_name || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, stockFilter]);

  const selected = filtered.find((r) => r.product.id === selectedId) || filtered[0] || null;

  const applyView = useCallback((view: SavedView) => {
    setSearch(view.search);
    setWarehouseId(view.warehouseId);
    setStockFilter(view.stockFilter);
  }, []);

  const persistView = () => {
    if (!viewName.trim()) return;
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: viewName.trim(),
      search,
      warehouseId,
      stockFilter,
    };
    const next = [...savedViews, view];
    setSavedViews(next);
    saveViews(companyId, next);
    setViewName('');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-8 w-8 text-primary" />
          Inventory Register
        </h1>
        <p className="text-muted-foreground mt-1">Enterprise on-hand balances by SKU and warehouse.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters &amp; saved views</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <Input placeholder="SKU, name, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All warehouses</SelectItem>
                  {(warehouses || []).map((w) => (
                    <SelectItem key={String(w.id)} value={String(w.id)}>
                      {String(w.code)} — {String(w.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stock status</Label>
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="low">Low stock</SelectItem>
                  <SelectItem value="out">Out of stock</SelectItem>
                  <SelectItem value="in">In stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save view</Label>
              <div className="flex gap-2">
                <Input placeholder="View name" value={viewName} onChange={(e) => setViewName(e.target.value)} />
                <Button type="button" variant="secondary" onClick={persistView}>
                  Save
                </Button>
              </div>
            </div>
          </div>
          {savedViews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {savedViews.map((v) => (
                <Button key={v.id} size="sm" variant="outline" onClick={() => applyView(v)}>
                  {v.name}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No matching inventory items.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow
                      key={r.product.id}
                      className={`cursor-pointer ${selected?.product.id === r.product.id ? 'bg-muted/60' : ''}`}
                      onClick={() => setSelectedId(r.product.id)}
                    >
                      <TableCell className="font-medium">
                        {r.product.name}
                        {r.low && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            Low
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.product.sku || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.reserved}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(r.value)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base">Item detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!selected ? (
              <p className="text-muted-foreground">Select a row to view balances.</p>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-lg">{selected.product.name}</p>
                  <p className="text-muted-foreground">{selected.product.category_name || 'Uncategorised'}</p>
                </div>
                <dl className="grid grid-cols-2 gap-2">
                  <dt className="text-muted-foreground">SKU</dt>
                  <dd>{selected.product.sku || '—'}</dd>
                  <dt className="text-muted-foreground">Cost method</dt>
                  <dd>{selected.product.cost_method || 'weighted_average'}</dd>
                  <dt className="text-muted-foreground">Unit cost</dt>
                  <dd className="font-mono">{formatCurrency(selected.unitCost)}</dd>
                  <dt className="text-muted-foreground">Supplier</dt>
                  <dd>{selected.product.vendors?.name || '—'}</dd>
                  <dt className="text-muted-foreground">Reorder</dt>
                  <dd>{selected.product.reorder_level ?? '—'}</dd>
                </dl>
                <div>
                  <p className="font-medium mb-2">Balances by location</p>
                  {selected.balances.length === 0 ? (
                    <p className="text-muted-foreground">No warehouse balances.</p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.balances.map((b) => (
                        <li key={b.id} className="flex justify-between border rounded-md px-3 py-2">
                          <span>
                            {b.inv_warehouses?.code || 'WH'}
                            {b.inv_locations?.code ? ` / ${b.inv_locations.code}` : ''}
                          </span>
                          <span className="tabular-nums">
                            {b.qty_on_hand} @ {formatCurrency(b.avg_unit_cost)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InventoryRegister;
