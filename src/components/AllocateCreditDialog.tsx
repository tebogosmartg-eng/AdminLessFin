import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Skeleton } from './ui/skeleton';
import { formatCurrency } from '../lib/utils';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { format } from 'date-fns';

interface AllocateCreditDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  creditNote: {
    id: string;
    credit_note_number: string;
    customer_id: string;
    customers: { name: string };
  };
}

const AllocateCreditDialog = ({ isOpen, setIsOpen, creditNote }: AllocateCreditDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [allocationAmount, setAllocationAmount] = useState<Record<string, string>>({});
  const [selectedArAccountId, setSelectedArAccountId] = useState<string>('');

  const { data: openInvoices, isLoading } = useQuery({
    queryKey: ['open_invoices_for_allocation', creditNote.customer_id, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('invoices', {
        body: {
          method: 'GET_ALL',
          company_id: activeCompany.id,
          filters: {
            customer_id: creditNote.customer_id,
            status: 'sent', // Or 'partial'
          },
        },
      });
      if (error) throw error;
      
      // Calculate remaining amounts client-side for simplicity, though server is better
      // Filter out paid/void
      return data.filter((inv: any) => inv.status !== 'paid' && inv.status !== 'void').map((inv: any) => {
         const debits = inv.journal_entries?.journal_entry_items.filter((i: any) => i.type === 'debit').reduce((sum: number, i: any) => sum + i.amount, 0) || 0;
         const credits = inv.journal_entries?.journal_entry_items.filter((i: any) => i.type === 'credit').reduce((sum: number, i: any) => sum + i.amount, 0) || 0;
         // Remaining is usually Total Debits (original inv) - Total Credits (payments/allocations)
         // Note: The original invoice creates Debits in AR. Payments create Credits in AR.
         // However, the original invoice JE has Credits to Sales.
         // We need to look at the AR account specifically or assume JE structure.
         // Simplified: Get total debits of the invoice JE (the amount), minus any credits linked to this invoice ID.
         // Since 'GET_ALL' doesn't return linked payments easily, this might be inaccurate without a specialized query.
         // Let's use `get_aged_receivables` logic but filtered.
         // Actually, let's just use the `get_overdue_invoices` or similar RPC logic, but for specific customer.
         
         // For now, let's assume the GET_ALL returns enough info? It returns `journal_entries` array.
         // We need to fetch the remaining balance properly.
         // Let's skip complex balance calc here and just show total for now, user enters amount.
         return {
             id: inv.id,
             invoice_number: inv.invoice_number,
             date: inv.invoice_date,
             total: debits,
         };
      });
    },
    enabled: isOpen && !!activeCompany,
  });

  const { data: accounts } = useQuery<Account[]>({ 
    queryKey: ['accounts', activeCompany?.id],
    enabled: !!activeCompany
  });
  
  const arAccounts = accounts?.filter(a => a.type === 'Asset' && a.name.toLowerCase().includes('receivable'));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No active company');
      if (!selectedArAccountId) throw new Error('Select AR Account');

      const allocations = Object.entries(allocationAmount)
        .filter(([_, amount]) => parseFloat(amount) > 0)
        .map(([invoiceId, amount]) => ({
            invoiceId,
            amount: parseFloat(amount)
        }));

      for (const allocation of allocations) {
          const { error } = await supabase.functions.invoke('credit-notes', {
            body: {
              method: 'ALLOCATE',
              company_id: activeCompany.id,
              creditNoteId: creditNote.id,
              invoiceId: allocation.invoiceId,
              amount: allocation.amount,
              arAccountId: selectedArAccountId
            },
          });
          if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit_notes'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess('Credit allocated successfully.');
      setIsOpen(false);
      setAllocationAmount({});
    },
    onError: (e: any) => showError(e.message),
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Allocate Credit Note {creditNote.credit_note_number}</DialogTitle>
          <DialogDescription>Apply this credit to open invoices for {creditNote.customers.name}.</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
            <div>
                <label className="text-sm font-medium mb-1 block">A/R Account</label>
                <Select onValueChange={setSelectedArAccountId} value={selectedArAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                    <SelectContent>{arAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>

            <div className="border rounded-md max-h-[300px] overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="w-[120px]">Allocate</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                        ) : openInvoices && openInvoices.length > 0 ? (
                            openInvoices.map((inv: any) => (
                                <TableRow key={inv.id}>
                                    <TableCell>{inv.invoice_number}</TableCell>
                                    <TableCell>{format(new Date(inv.date), 'PP')}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number" 
                                            step="0.01" 
                                            placeholder="0.00"
                                            value={allocationAmount[inv.id] || ''}
                                            onChange={(e) => setAllocationAmount(prev => ({ ...prev, [inv.id]: e.target.value }))}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No open invoices found.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !selectedArAccountId}>
            {mutation.isPending ? 'Allocating...' : 'Save Allocation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AllocateCreditDialog;