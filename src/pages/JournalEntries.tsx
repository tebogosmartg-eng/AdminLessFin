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
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { PlusCircle } from 'lucide-react';
import JournalEntryForm from '../components/JournalEntryForm';
import JournalEntryDetail from '../components/JournalEntryDetail';

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">Loading entries...</TableCell>
                </TableRow>
              ) : entries && entries.length > 0 ? (
                entries.map((entry) => (
                  <TableRow 
                    key={entry.id} 
                    onClick={() => setSelectedEntryId(entry.id)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <TableCell>{new Date(entry.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell className="text-right">${calculateTotal(entry.journal_entry_items).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">No journal entries found. Create one to get started.</TableCell>
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