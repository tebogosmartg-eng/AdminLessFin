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
import BillForm from '../components/BillForm';
import JournalEntryDetail from '../components/JournalEntryDetail';
import JournalEntryForm from '../components/JournalEntryForm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { showError, showSuccess } from '../utils/toast';

type BillEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  vendors: { name: string }[] | null;
  total: number;
};

const Bills = () => {
  const [isBillFormOpen, setIsBillFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [selectedEntryIdForDetail, setSelectedEntryIdForDetail] = useState<string | null>(null);
  const [selectedEntryIdForEdit, setSelectedEntryIdForEdit] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

  const fetchBills = async () => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        vendors ( name ),
        journal_entry_items ( type, amount )
      `)
      .not('vendor_id', 'is', null)
      .order('entry_date', { ascending: false });

    if (error) throw new Error(error.message);
    if (!data) return [];

    return data.map(entry => ({
      ...entry,
      total: entry.journal_entry_items
        .filter(item => item.type === 'credit')
        .reduce((sum, item) => sum + item.amount, 0),
    }));
  };

  const { data: bills, isLoading } = useQuery<BillEntry[]>({
    queryKey: ['bills'],
    queryFn: fetchBills,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_entries').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      showSuccess('Bill deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting bill: ${error.message}`);
    },
  });

  const handleEdit = (id: string) => {
    setSelectedEntryIdForEdit(id);
    setIsEditFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this bill? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Bills</CardTitle>
              <CardDescription>A record of all bills received from vendors.</CardDescription>
            </div>
            <Button onClick={() => setIsBillFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Record New Bill
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">Loading bills...</TableCell>
                </TableRow>
              ) : bills && bills.length > 0 ? (
                bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell>{new Date(bill.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{bill.vendors?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell>{bill.description}</TableCell>
                    <TableCell className="text-right">${bill.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedEntryIdForDetail(bill.id)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(bill.id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(bill.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No bills recorded yet. Add one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <BillForm
        isOpen={isBillFormOpen}
        setIsOpen={setIsBillFormOpen}
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

export default Bills;