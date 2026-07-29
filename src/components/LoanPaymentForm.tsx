import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { accountsQuery } from '../lib/queries';
import { useAuth } from '../contexts/AuthContext';

const paymentSchema = z.object({
  payment_date: z.string().min(1, "Date is required."),
  bank_account_id: z.string().min(1, "Bank account is required."),
  interest_expense_account_id: z.string().min(1, "Interest expense account is required."),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface LoanPaymentFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  scheduleItem: {
    id: string;
    payment_date: string;
    payment_amount: number;
    principal: number;
    interest: number;
  };
}

const LoanPaymentForm = ({ isOpen, setIsOpen, scheduleItem }: LoanPaymentFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      bank_account_id: '',
      interest_expense_account_id: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        payment_date: scheduleItem.payment_date,
        bank_account_id: '',
        interest_expense_account_id: '',
      });
    }
  }, [isOpen, scheduleItem, form]);

  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const expenseAccounts = accounts?.filter(a => a.type === 'Expense');

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('loans', {
        body: {
          method: 'RECORD_PAYMENT',
          company_id: activeCompany.id,
          schedule_item_id: scheduleItem.id,
          payment_date: values.payment_date,
          bank_account_id: values.bank_account_id,
          interest_expense_account_id: values.interest_expense_account_id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_detail_and_schedule'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Loan payment recorded successfully.');
      setIsOpen(false);
    },
    onError: (error: any) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: PaymentFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Loan Payment</DialogTitle>
          <DialogDescription>
            Total Payment: {formatCurrency(scheduleItem.payment_amount)} (Principal: {formatCurrency(scheduleItem.principal)}, Interest: {formatCurrency(scheduleItem.interest)})
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="payment_date" render={({ field }) => (
              <FormItem><FormLabel>Payment Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="bank_account_id" render={({ field }) => (
              <FormItem><FormLabel>Pay From (Bank/Cash)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an asset account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="interest_expense_account_id" render={({ field }) => (
              <FormItem><FormLabel>Interest Expense Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an expense account" /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Record Payment'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default LoanPaymentForm;