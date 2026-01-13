import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Download } from 'lucide-react';
import { formatCurrency, downloadCSV } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  cost: number;
  totalValue: number;
};

const InventoryValuation = () => {
  const { activeCompany } = useAuth();

  const { data: inventory, isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['inventory_valuation', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_INVENTORY_VALUATION',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const totals = inventory?.reduce((acc, item) => ({
    qty: acc.qty + item.quantity,
    value: acc.value + item.totalValue
  }), { qty: 0, value: 0 }) || { qty: 0, value: 0 };

  const handleDownload = () => {
    if (!inventory) return;
    const data = inventory.map(i => ({
      Item: i.name,
      'Quantity on Hand': i.quantity,
      'Average Cost': i.cost.toFixed(2),
      'Asset Value': i.totalValue.toFixed(2)
    }));
    data.push({ Item: 'TOTALS', 'Quantity on Hand': totals.qty, 'Average Cost': '', 'Asset Value': totals.value.toFixed(2) });
    downloadCSV(data, 'inventory-valuation.csv');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Inventory Valuation</h1>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={!inventory || inventory.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Download CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock Summary</CardTitle>
          <CardDescription>Current asset value of inventory on hand.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead className="text-center">Quantity on Hand</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Asset Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
              ) : inventory && inventory.length > 0 ? (
                inventory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.cost)}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatCurrency(item.totalValue)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No inventory items found.</TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/50 font-bold text-lg">
                <TableCell>Total</TableCell>
                <TableCell className="text-center">{totals.qty}</TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.value)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryValuation;