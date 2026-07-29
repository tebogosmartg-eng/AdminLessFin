import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { inventoryMovementsQuery } from '../../lib/queries';
import { formatCurrency } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent } from '../../components/ui/card';
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

type Movement = {
  id: string;
  transaction_date: string;
  transaction_type: string;
  quantity_change: number;
  unit_cost: number;
  total_cost: number;
  description: string | null;
  products?: { name: string; sku?: string | null } | null;
  inv_warehouses?: { code: string; name: string } | null;
};

const InventoryMovements = () => {
  useDocumentTitle('Inventory Movements');
  const { activeCompany } = useAuth();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data, isLoading } = useQuery({
    ...inventoryMovementsQuery(activeCompany!.id, 300),
    enabled: !!activeCompany,
  });

  const movements = (data || []) as Movement[];

  const types = useMemo(() => {
    const set = new Set(movements.map((m) => m.transaction_type));
    return Array.from(set).sort();
  }, [movements]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (typeFilter !== 'all' && m.transaction_type !== typeFilter) return false;
      if (!q) return true;
      const name = m.products?.name?.toLowerCase() || '';
      const sku = m.products?.sku?.toLowerCase() || '';
      return name.includes(q) || sku.includes(q) || (m.description || '').toLowerCase().includes(q);
    });
  }, [movements, search, typeFilter]);

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ArrowLeftRight className="h-8 w-8 text-primary" />
          Inventory Movements
        </h1>
        <p className="text-muted-foreground mt-1">Receipts, issues, transfers, and adjustments.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product or description" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No movements found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{format(new Date(m.transaction_date), 'yyyy-MM-dd')}</TableCell>
                    <TableCell>
                      <div className="font-medium">{m.products?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.transaction_type}</Badge>
                    </TableCell>
                    <TableCell>{m.inv_warehouses?.code || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.quantity_change}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(m.total_cost || 0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryMovements;
