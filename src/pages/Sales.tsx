import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import SaleForm from '../components/SaleForm';
import JournalEntryDetail from '../components/JournalEntryDetail';
import JournalEntryForm from '../components/JournalEntryForm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { showError, showSuccess } from '../utils/toast';
import { formatCurrency } from '../lib/utils';

type SaleEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  customers: { name: string }[] | null;
  total: number;
};

const Sales = () => {
  const [isSaleFormOpen, setIsSaleFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [selectedEntryIdForDetail, setSelectedEntryIdForDetail] = useState<string | null>(null);
  const [selectedEntryIdForEdit, setSelectedEntryIdForEdit] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_entries').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      showSuccess('Sale deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting sale: ${error.message}`);
    },
  });

  const handleEdit = (id: string) => {
    setSelectedEntryIdForEdit(id);
    setIsEditFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this sale? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Sales</CardTitle>
              <CardDescription>A record of all sales made to customers.</CardDescription>
            </div>
            <Button onClick={() => setIsSaleFormOpen(true)}>
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
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">Loading sales...</TableCell>
                </TableRow>
              ) : sales && sales.length > 0 ? (
                sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>{new Date(sale.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{sale.customers?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell>{sale.description}</TableCell>
                    <TableCell className="text-right">{formatCurrency(sale.total)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedEntryIdForDetail(sale.id)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(sale.id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(sale.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No sales recorded yet. Add one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SaleForm
        isOpen={isSaleFormOpen}
        setIsOpen={setIsSaleFormOpen}
      />
      <JournalEntryForm
        isOpen={isEditFormOpen}
        setIsOpen={setIsEditFormOpen}
        entryId={selectedEntryIdForEdit}
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