import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';

type PPESummaryItem = {
  category_name: string;
  cost: number;
  accumulated_depreciation: number;
  net_book_value: number;
};

const PPENote = () => {
  const { data: summary, isLoading } = useQuery<PPESummaryItem[]>({
    queryKey: ['ppe_note_summary'],
    queryFn: async () => {
      const { data: assets, error } = await supabase
        .from('fixed_assets')
        .select('purchase_cost, accumulated_depreciation, asset_categories ( name )')
        .eq('status', 'active');
      
      if (error) throw error;

      const grouped = assets.reduce((acc, asset) => {
        const categoryName = (asset.asset_categories as any)?.name || 'Uncategorized';
        if (!acc[categoryName]) {
          acc[categoryName] = { cost: 0, accumulated_depreciation: 0 };
        }
        acc[categoryName].cost += asset.purchase_cost;
        acc[categoryName].accumulated_depreciation += asset.accumulated_depreciation;
        return acc;
      }, {} as Record<string, { cost: number; accumulated_depreciation: number }>);

      return Object.entries(grouped).map(([category_name, values]) => ({
        category_name,
        ...values,
        net_book_value: values.cost - values.accumulated_depreciation,
      }));
    },
  });

  const totals = summary?.reduce((acc, item) => ({
    cost: acc.cost + item.cost,
    accumulated_depreciation: acc.accumulated_depreciation + item.accumulated_depreciation,
    net_book_value: acc.net_book_value + item.net_book_value,
  }), { cost: 0, accumulated_depreciation: 0, net_book_value: 0 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Note: Property, Plant & Equipment</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Accumulated Depreciation</TableHead>
                <TableHead className="text-right">Net Book Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary?.map(item => (
                <TableRow key={item.category_name}>
                  <TableCell>{item.category_name}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.cost)}</TableCell>
                  <TableCell className="text-right font-mono">({formatCurrency(item.accumulated_depreciation)})</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.net_book_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-bold text-lg">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totals?.cost || 0)}</TableCell>
                <TableCell className="text-right font-mono">({formatCurrency(totals?.accumulated_depreciation || 0)})</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totals?.net_book_value || 0)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default PPENote;