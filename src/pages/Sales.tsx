import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle } from 'lucide-react';
import SaleForm from '../components/SaleForm';
import JournalEntryDetail from '../components/JournalEntryDetail';

type SaleEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  customers: { name: string }[] | null;
  total: number;
};

const Sales = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEntryIdForDetail, setSelectedEntryIdForDetail] = useState<string | null>(null);

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        customers ( name ),
        journal_entry_items ( type, amount )
      `)
      .not('customer_id', 'is', null)
      .order('entry_date', { ascending: false });

    if (error) throw new Error(error.message);
    if (!data) return [];

    return data.map(entry => ({
      ...entry,
      total: entry.journal_entry_items
        .filter(item => item.type === 'debit')
        .reduce((sum, item) => sum + item.amount, 0),
    }));
  };

  const { data: sales, isLoading } = useQuery<SaleEntry[]>({
    queryKey: ['sales'],
    queryFn: fetchSales,
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Sales</CardTitle>
              <CardDescription>A record of all sales made to customers.</CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Record New Sale
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading sales...</TableCell>
                </TableRow>
              ) : sales && sales.length > 0 ? (
                sales.map((sale) => (
                  <TableRow key={sale.id} className="cursor-pointer" onClick={() => setSelectedEntryIdForDetail(sale.id)}>
                    <TableCell>{new Date(sale.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{sale.customers?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell>{sale.description}</TableCell>
                    <TableCell className="text-right">${sale.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">No sales recorded yet. Add one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SaleForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
      />
      <JournalEntryDetail 
        entryId={selectedEntryIdForDetail} 
        isOpen={!!selectedEntryIdForDetail} 
        setIsOpen={() => setSelectedEntryIdForDetail(null)} 
      />
    </>
  );
};

export default Sales;