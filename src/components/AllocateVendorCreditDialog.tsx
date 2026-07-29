import { useState } from 'react';
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
import { accountsQuery } from '../lib/queries';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { format } from 'date-fns';
import { findAccountsByRole } from '../lib/accounting/accountRoles';

interface AllocateVendorCreditDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  vendorCredit: {
    id: string;
    credit_number: string;
    vendor_id: string;
    vendors: { name: string };
  };
}

const AllocateVendorCreditDialog = ({ isOpen, setIsOpen, vendorCredit }: AllocateVendorCreditDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [allocationAmount, setAllocationAmount] = useState<Record<string, string>>({});
  const [selectedApAccountId, setSelectedApAccountId] = useState<string>('');

  const { data: openBills, isLoading } = useQuery({
    queryKey: ['open_bills_for_allocation', vendorCredit.vendor_id, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      // Use bills query to get bills with 'open' status
      const { data, error } = await supabase.functions.invoke('bills', {
        body: {
          method: 'GET',
          company_id: activeCompany.id,
          filters: {
            vendor_id: vendorCredit.vendor_id,
            status: 'open',
          },
        },
      });
      if (error) throw error;
      
      // Calculate remaining amount locally
      // For now, we use the bill total as the "open" amount since we are filtering by status=open
      // In a more advanced version, we'd fetch payments and subtract.
      return data.map((bill: any) => {
          // Calculate bill total from items
          const creditItems = bill.journal_entry_items?.filter((i: any) => i.type === 'credit') || [];
          const total = creditItems.reduce((sum: number, i: any) => sum + i.amount, 0);
          return {
             id: bill.id,
             bill_number: bill.bill_number,
             date: bill.entry_date,
             total,
          };
      });
    },
    enabled: isOpen && !!activeCompany,
  });

  const { data: accounts } = useQuery<Account[]>({ 
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany
  });
  
  const apAccounts = findAccountsByRole(accounts?.filter((a) => a.type === 'Liability'), 'trade_payable');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No active company');
      if (!selectedApAccountId) throw new Error('Select AP Account');

      const allocations = Object.entries(allocationAmount)
        .filter(([_, amount]) => parseFloat(amount) > 0)
        .map(([billId, amount]) => ({
            billId,
            amount: parseFloat(amount)
        }));

      for (const allocation of allocations) {
          const { error } = await supabase.functions.invoke('vendor-credits', {
            body: {
              method: 'ALLOCATE',
              company_id: activeCompany.id,
              vendorCreditId: vendorCredit.id,
              billId: allocation.billId,
              amount: allocation.amount,
              apAccountId: selectedApAccountId
            },
          });
          if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor_credits'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      showSuccess('Vendor Credit allocated successfully.');
      setIsOpen(false);
      setAllocationAmount({});
    },
    onError: (e: any) => showError(e.message),
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Allocate Credit {vendorCredit.credit_number}</DialogTitle>
          <DialogDescription>Apply this credit to open bills for {vendorCredit.vendors.name}.</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
            <div>
                <label className="text-sm font-medium mb-1 block">A/P Account</label>
                <Select onValueChange={setSelectedApAccountId} value={selectedApAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                    <SelectContent>{apAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>

            <div className="border rounded-md max-h-[300px] overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Bill #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="w-[120px]">Allocate</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                        ) : openBills && openBills.length > 0 ? (
                            openBills.map((bill: any) => (
                                <TableRow key={bill.id}>
                                    <TableCell>{bill.bill_number || '-'}</TableCell>
                                    <TableCell>{format(new Date(bill.date), 'PP')}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(bill.total)}</TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number" 
                                            step="0.01" 
                                            placeholder="0.00"
                                            value={allocationAmount[bill.id] || ''}
                                            onChange={(e) => setAllocationAmount(prev => ({ ...prev, [bill.id]: e.target.value }))}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No open bills found.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !selectedApAccountId}>
            {mutation.isPending ? 'Allocating...' : 'Save Allocation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AllocateVendorCreditDialog;