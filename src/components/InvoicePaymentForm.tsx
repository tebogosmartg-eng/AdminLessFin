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
import {
  findAccountByRole,
  findCashEquivalentAccounts,
  resolveControlAccounts,
} from '../lib/accounting/accountRoles';

const paymentSchema = z.object({
  payment_date: z.string().min(1, "Date is required."),
  deposit_account_id: z.string().min(1, "Deposit account is required."),
  ar_account_id: z.string().min(1, "Accounts Receivable account is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface InvoicePaymentFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invoice: { id: string; totalAmount: number; customerName: string };
}

const InvoicePaymentForm = ({ isOpen, setIsOpen, invoice }: InvoicePaymentFormProps) => {
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      deposit_account_id: '',
      ar_account_id: '',
      amount: invoice.totalAmount,
    },
  });

  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const arAccounts = assetAccounts?.filter((a) => !!findAccountByRole([a], 'trade_receivable'));
  const cashAccounts = findCashEquivalentAccounts(assetAccounts).length
    ? findCashEquivalentAccounts(assetAccounts)
    : assetAccounts?.filter((a) => !findAccountByRole([a], 'trade_receivable'));

  useEffect(() => {
    if (isOpen) {
      form.setValue('amount', invoice.totalAmount);
      const controls = resolveControlAccounts(accounts);
      if (controls.ar) {
        form.setValue('ar_account_id', controls.ar.id);
      }
    }
  }, [isOpen, invoice, accounts, form]);

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('payments', {
        body: {
          method: 'RECORD_INVOICE_PAYMENT',
          company_id: activeCompany.id,
          invoice_id: invoice.id,
          payment_date: values.payment_date,
          asset_account_id: values.deposit_account_id,
          ar_account_id: values.ar_account_id,
          amount: values.amount,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_detail', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Payment recorded successfully.');
      setIsOpen(false);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to record payment';
      showError(`Error: ${message}`);
    },
  });

  const onSubmit = (values: PaymentFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Payment</DialogTitle>
          <DialogDescription>
            Invoice Total: {formatCurrency(invoice.totalAmount)}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="payment_date" render={({ field }) => (
                <FormItem><FormLabel>Payment Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>Amount Received</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="deposit_account_id" render={({ field }) => (
              <FormItem><FormLabel>Deposit To</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a cash/bank account" /></SelectTrigger></FormControl><SelectContent>{cashAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="ar_account_id" render={({ field }) => (
              <FormItem><FormLabel>Credit Accounts Receivable</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an A/R account" /></SelectTrigger></FormControl><SelectContent>{arAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
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

export default InvoicePaymentForm;