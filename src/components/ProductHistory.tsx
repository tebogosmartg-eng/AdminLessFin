import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { format } from 'date-fns';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

interface ProductHistoryProps {
  productId: string;
}

type InventoryTransaction = {
  id: string;
  transaction_date: string;
  transaction_type: string;
  quantity_change: number;
  reference_number: string | null;
  description: string | null;
};

const ProductHistory = ({ productId }: ProductHistoryProps) => {
  const { activeCompany } = useAuth();

  const { data: history, isLoading } = useQuery<InventoryTransaction[]>({
    queryKey: ['product_history', productId, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('products', {
        body: {
          method: 'GET_HISTORY',
          company_id: activeCompany.id,
          productId,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany && !!productId,
  });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'invoice': return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Sale</Badge>;
      case 'bill': return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Purchase</Badge>;
      case 'adjustment': return <Badge variant="secondary">Adjustment</Badge>;
      case 'return': return <Badge variant="destructive">Return</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history && history.length > 0 ? (
            history.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>{format(new Date(tx.transaction_date), 'PPP')}</TableCell>
                <TableCell>{getTypeBadge(tx.transaction_type)}</TableCell>
                <TableCell className="font-mono text-xs">{tx.reference_number || '-'}</TableCell>
                <TableCell>{tx.description}</TableCell>
                <TableCell className={cn("text-right font-bold", tx.quantity_change > 0 ? "text-green-600" : "text-red-600")}>
                  {tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                No history found for this item.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ProductHistory;