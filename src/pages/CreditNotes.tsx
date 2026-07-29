import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, ArrowRightLeft, ReceiptText } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { showError, showSuccess } from '../utils/toast';
import CreditNoteForm from '../components/CreditNoteForm';
import AllocateCreditDialog from '../components/AllocateCreditDialog';
import { creditNotesQuery } from '../lib/queries';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const CreditNotes = () => {
  useDocumentTitle('Credit Notes');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCN, setSelectedCN] = useState<any>(null);
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);
  
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: creditNotes, isLoading } = useQuery({
    ...creditNotesQuery(activeCompany!.id),
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

  const handleAllocate = (cn: any) => {
      setSelectedCN(cn);
      setIsAllocateOpen(true);
  };

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
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
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
                          <DropdownMenuItem onClick={() => handleAllocate(cn)}>
                              <ArrowRightLeft className="mr-2 h-4 w-4" /> Allocate to Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(cn.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={ReceiptText}
                      title="No credit notes yet"
                      description="Issue a credit note when you need to refund or adjust a customer invoice."
                      action={
                        <Button onClick={() => setIsFormOpen(true)}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          New Credit Note
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CreditNoteForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
      {selectedCN && (
          <AllocateCreditDialog
            isOpen={isAllocateOpen}
            setIsOpen={setIsAllocateOpen}
            creditNote={selectedCN}
          />
      )}
    </>
  );
};

export default CreditNotes;
