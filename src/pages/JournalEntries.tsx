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
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import JournalEntryForm from '../components/JournalEntryForm';
import JournalEntryDetail from '../components/JournalEntryDetail';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';

type JournalEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  journal_entry_items: {
    type: 'debit' | 'credit';
    amount: number;
  }[];
};

const JournalEntries = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const fetchJournalEntries = async () => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        journal_entry_items (
          type,
          amount
        )
      `)
      .order('entry_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  };

  const { data: entries, isLoading } = useQuery<JournalEntry[]>({
    queryKey: ['journal_entries'],
    queryFn: fetchJournalEntries,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_entries').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Journal entry deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting entry: ${error.message}`);
    },
  });

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  const calculateTotal = (items: JournalEntry['journal_entry_items']) => {
    return items
      .filter(item => item.type === 'debit')
      .reduce((sum, item) => sum + item.amount, 0);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Journal Entries</CardTitle>
          <Button onClick={() => setIsFormOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Journal Entry
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading entries...</TableCell>
                </TableRow>
              ) : entries && entries.length > 0 ? (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell className="text-right">${calculateTotal(entry.journal_entry_items).toFixed(2)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedEntryId(entry.id)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem disabled>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(entry.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">No journal entries found. Create one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <JournalEntryForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
      <JournalEntryDetail 
        entryId={selectedEntryId} 
        isOpen={!!selectedEntryId} 
        setIsOpen={() => setSelectedEntryId(null)} 
      />
    </>
  );
};

export default JournalEntries;