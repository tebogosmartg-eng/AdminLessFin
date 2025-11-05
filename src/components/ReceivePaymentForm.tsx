import { useEffect } from 'react';
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
import { Alert, AlertDescription } from './ui/alert';
import { Textarea } from './ui/textarea';

const paymentSchema = z.object({
  payment_date: z.string().min(1, "Date is required."),
  deposit_account_id: z.string().min(1, "Deposit account is required."),
  accounts_receivable_id: z.string().min(1, "Accounts Receivable account is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  description: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface ReceivePaymentFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  customerId: string;
  customerName: string;
  amountDue: number;
}

const ReceivePaymentForm = ({ isOpen, setIsOpen, customerId, customerName, amountDue }: ReceivePaymentFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: new Date().toISOString().split('T')[0],
      deposit_account_id: '',
      accounts_receivable_id: '',
      amount: amountDue,
      description: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        payment_date: new Date().toISOString().split('T')[0],
        deposit_account_id: '',
        accounts_receivable_id: '',
        amount: amountDue,
        description: `Payment from ${customerName}`,
      });
    }
  }, [isOpen, amountDue, customerName, form]);

  const { data: assetAccounts } = useQuery<Account[]>({
    queryKey: ['asset_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Asset');
      if (error) throw error;
      return data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: user.id,
          entry_date: values.payment_date,
          description: values.description,
          customer_id: customerId,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const journalItems = [
        // Debit Cash/Asset Account
        {
          journal_entry_id: entry.id,
          account_id: values.deposit_account_id,
          type: 'debit',
          amount: values.amount,
        },
        // Credit Accounts Receivable
        {
          journal_entry_id: entry.id,
          account_id: values.accounts_receivable_id,
          type: 'credit',
          amount: values.amount,
        },
      ];

      const { error: itemsError } = await supabase.from('journal_entry_items').insert(journalItems);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer_ar_balances'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Payment received successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: PaymentFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive Payment from {customerName}</DialogTitle>
          <DialogDescription>Amount Due: ${amountDue.toFixed(2)}</DialogDescription>
        </DialogHeader>
        {!assetAccounts?.some(acc => acc.name.toLowerCase().includes('accounts receivable')) && (
            <Alert variant="destructive">
                <AlertDescription>
                Warning: You don't have an "Accounts Receivable" account. Please create one in your Chart of Accounts (Type: Asset).
                </AlertDescription>
            </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="payment_date" render={({ field }) => (
                <FormItem><FormLabel>Payment Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="deposit_account_id" render={({ field }) => (
              <FormItem><FormLabel>Deposit To Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a cash/bank account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.filter(a => !a.name.toLowerCase().includes('receivable')).map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (
              <FormItem><FormLabel>Accounts Receivable Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an A/R account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.filter(a => a.name.toLowerCase().includes('receivable')).map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Memo (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Payment for invoice #123" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Receive Payment'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ReceivePaymentForm;