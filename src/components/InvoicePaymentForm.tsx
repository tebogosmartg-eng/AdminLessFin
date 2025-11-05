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

const paymentSchema = z.object({
  payment_date: z.string().min(1, "Date is required."),
  deposit_account_id: z.string().min(1, "Deposit account is required."),
  ar_account_id: z.string().min(1, "Accounts Receivable account is required."),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface InvoicePaymentFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invoice: { id: string; totalAmount: number; customerName: string };
}

const InvoicePaymentForm = ({ isOpen, setIsOpen, invoice }: InvoicePaymentFormProps) => {
  const queryClient = useQueryClient();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      deposit_account_id: '',
      ar_account_id: '',
    },
  });

  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts'] });
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const arAccounts = assetAccounts?.filter(a => a.name.toLowerCase().includes('receivable'));
  const cashAccounts = assetAccounts?.filter(a => !a.name.toLowerCase().includes('receivable'));

  useEffect(() => {
    if (isOpen && arAccounts && arAccounts.length > 0) {
      form.setValue('ar_account_id', arAccounts[0].id);
    }
  }, [isOpen, arAccounts, form]);

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      const { error } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: invoice.id,
        p_payment_date: values.payment_date,
        p_asset_account_id: values.deposit_account_id,
        p_ar_account_id: values.ar_account_id,
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
    onError: (error: any) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: PaymentFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Payment for Invoice</DialogTitle>
          <DialogDescription>
            Recording payment of {formatCurrency(invoice.totalAmount)} from {invoice.customerName}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="payment_date" render={({ field }) => (
              <FormItem><FormLabel>Payment Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
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