import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, Terminal, Play } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';
import RecurringEntryForm from '../components/RecurringEntryForm';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { useAuth } from '../contexts/AuthContext';
import { recurringEntriesQuery } from '../lib/queries';

type RecurringEntry = {
  id: string;
  description: string;
  frequency: string;
  next_run_date: string;
};

const RecurringEntries = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const { data: entries, isLoading } = useQuery<RecurringEntry[]>({
    ...recurringEntriesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('recurring-entries', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          entryId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_entries', activeCompany?.id] });
      showSuccess('Recurring entry deleted.');
    },
    onError: (error) => {
      showError(`Error deleting entry: ${error.message}`);
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
        if (!activeCompany) throw new Error("No active company");
        const { data, error } = await supabase.functions.invoke('recurring-entries', {
            body: { method: 'PROCESS_DUE', company_id: activeCompany.id }
        });
        if(error) throw error;
        return data;
    },
    onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['recurring_entries'] });
        queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
        showSuccess(`Processed ${data.processed} entries.`);
    },
    onError: (e: any) => showError(e.message)
  });

  const handleAddNew = () => {
    setSelectedEntryId(undefined);
    setIsFormOpen(true);
  };

  const handleEdit = (id: string) => {
    setSelectedEntryId(id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this recurring entry template?')) {
      deleteMutation.mutate(id);
    }
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <>
      <Alert className="mb-4">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Automate Your Bookkeeping!</AlertTitle>
        <AlertDescription>
          Recurring entries are processed automatically daily. You can also force a run now to process any entries due today or earlier.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recurring Transactions</CardTitle>
              <CardDescription>Manage templates for automated journal entries.</CardDescription>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending}>
                    <Play className="mr-2 h-4 w-4" /> Run Due Now
                </Button>
                <Button onClick={handleAddNew}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Template
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next Run Date</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center">Loading templates...</TableCell></TableRow>
              ) : entries && entries.length > 0 ? (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.description}</TableCell>
                    <TableCell>{capitalize(entry.frequency)}</TableCell>
                    <TableCell>{format(new Date(entry.next_run_date), 'PPP')}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(entry.id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(entry.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={4} className="text-center">No recurring entries found. Create one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <RecurringEntryForm 
        isOpen={isFormOpen} 
        setIsOpen={setIsFormOpen} 
        entryId={selectedEntryId}
      />
    </>
  );
};

export default RecurringEntries;