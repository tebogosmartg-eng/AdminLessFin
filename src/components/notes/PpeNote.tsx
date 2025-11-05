import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { formatCurrency } from '../../lib/utils';

type Asset = {
  id: string;
  purchase_cost: number;
  accumulated_depreciation: number;
  asset_categories: { name: string } | null;
};

const PpeNote = () => {
  const { data: assets, isLoading } = useQuery<Asset[]>({
    queryKey: ['fixed_assets_for_note'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_assets')
        .select('id, purchase_cost, accumulated_depreciation, asset_categories(name)')
        .eq('status', 'active'); // Only include active assets in the note
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const ppeData = assets?.reduce((acc: Record<string, { cost: number; accumulatedDepreciation: number; netBookValue: number }>, asset) => {
    const category = asset.asset_categories?.name || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = { cost: 0, accumulatedDepreciation: 0, netBookValue: 0 };
    }
    acc[category].cost += asset.purchase_cost;
    acc[category].accumulatedDepreciation += asset.accumulated_depreciation;
    acc[category].netBookValue += asset.purchase_cost - asset.accumulated_depreciation;
    return acc;
  }, {});

  const totals = Object.values(ppeData || {}).reduce((acc, category) => {
    acc.cost += category.cost;
    acc.accumulatedDepreciation += category.accumulatedDepreciation;
    acc.netBookValue += category.netBookValue;
    return acc;
  }, { cost: 0, accumulatedDepreciation: 0, netBookValue: 0 });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Note: Property, Plant, and Equipment</h3>
      <p className="text-sm text-muted-foreground mb-4">
        This note provides a summary of the company's tangible fixed assets.
      </p>
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
          {ppeData && Object.entries(ppeData).map(([category, values]) => (
            <TableRow key={category}>
              <TableCell>{category}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(values.cost)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(values.accumulatedDepreciation)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(values.netBookValue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="text-base font-bold">
            <TableCell>Total</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(totals.cost)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(totals.accumulatedDepreciation)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(totals.netBookValue)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

export default PpeNote;