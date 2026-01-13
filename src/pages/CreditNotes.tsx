import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { showError, showSuccess } from '../utils/toast';
import CreditNoteForm from '../components/CreditNoteForm';

const CreditNotes = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: creditNotes, isLoading } = useQuery({
    queryKey: ['credit_notes', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'GET_ALL', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'DELETE', company_id: activeCompany!.id, id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit_notes'] });
      showSuccess('Credit Note deleted.');
    },
    onError: (e: any) => showError(e.message),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Credit Notes</CardTitle>
              <CardDescription>Manage customer refunds and returns.</CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Credit Note
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
              ) : creditNotes && creditNotes.length > 0 ? (
                creditNotes.map((cn: any) => (
                  <TableRow key={cn.id}>
                    <TableCell className="font-medium">{cn.credit_note_number}</TableCell>
                    <TableCell>{cn.customers?.name}</TableCell>
                    <TableCell>{format(new Date(cn.credit_note_date), 'PPP')}</TableCell>
                    <TableCell>{cn.reason}</TableCell>
                    <TableCell><Badge variant="outline">{cn.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(cn.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6} className="text-center">No credit notes found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CreditNoteForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
    </>
  );
};

export default CreditNotes;