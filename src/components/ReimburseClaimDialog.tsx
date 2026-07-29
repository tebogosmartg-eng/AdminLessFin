import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { formatEmployeeAiContext } from '../lib/employeeIdentity';
import { accountsQuery } from '../lib/queries';

const reimburseSchema = z.object({
  payment_date: z.string().min(1, "Date is required."),
  payment_account_id: z.string().min(1, "Payment account is required."),
  liability_account_id: z.string().min(1, "Liability account is required."),
});

type FormValues = z.infer<typeof reimburseSchema>;

interface Props {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  claim: {
    id: string;
    claim_number: string;
    total_amount: number;
    employees?: { employee_number: string; first_name: string; last_name: string; department?: string | null };
  };
}

const ReimburseClaimDialog = ({ isOpen, setIsOpen, claim }: Props) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(reimburseSchema),
    defaultValues: {
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_account_id: '',
      liability_account_id: '',
    },
  });

  const { data: accounts } = useQuery<Account[]>({ 
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany
  });

  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('expense-claims', {
        body: {
          method: 'REIMBURSE',
          company_id: activeCompany.id,
          claimId: claim.id,
          paymentAccountId: values.payment_account_id,
          liabilityAccountId: values.liability_account_id,
          paymentDate: values.payment_date,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_claims'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Reimbursement recorded successfully.');
      setIsOpen(false);
    },
    onError: (error: any) => showError(error.message),
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reimburse Claim {claim.claim_number}</DialogTitle>
          <DialogDescription>
            Record payment of {formatCurrency(claim.total_amount)} to {claim.employees ? formatEmployeeAiContext(claim.employees) : 'employee'}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="payment_date" render={({ field }) => (
              <FormItem><FormLabel>Payment Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="liability_account_id" render={({ field }) => (
              <FormItem><FormLabel>Debit Liability Account (e.g. Employee Payables)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select liability account" /></SelectTrigger></FormControl><SelectContent>{liabilityAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="payment_account_id" render={({ field }) => (
              <FormItem><FormLabel>Credit Payment Account (e.g. Bank)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select bank/cash account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Processing...' : 'Record Payment'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ReimburseClaimDialog;