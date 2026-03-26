import { useEffect, useState } from 'react';
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
import { formatCurrency } from '../lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

const paymentSchema = z.object({
  payment_date: z.string().min(1, "Date is required."),
  payment_account_id: z.string().min(1, "Payment account is required."),
  accounts_payable_id: z.string().min(1, "Accounts Payable account is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  description: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface BillPaymentFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  vendorId: string;
  vendorName: string;
  amountDue: number;
  billId?: string; // Optional: if present, marks specific bill as paid
}

const BillPaymentForm = ({ isOpen, setIsOpen, vendorId, vendorName, amountDue, billId }: BillPaymentFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: new Date().toISOString().split('T')[0],
      payment_account_id: '',
      accounts_payable_id: '',
      amount: amountDue,
      description: '',
    },
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
        body: {
          method: 'GET',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const assetAccounts = accounts?.filter(acc => acc.type === 'Asset');
  const apAccounts = accounts?.filter(acc => acc.type === 'Liability');

  useEffect(() => {
    if (isOpen) {
      form.reset({
        payment_date: new Date().toISOString().split('T')[0],
        payment_account_id: form.getValues('payment_account_id'),
        accounts_payable_id: form.getValues('accounts_payable_id'),
        amount: amountDue,
        description: `Payment to ${vendorName}`,
      });
    }
  }, [isOpen, amountDue, vendorName, form]);

  // Smart Defaults: Auto-select bank and AP accounts
  useEffect(() => {
    if (isOpen && accounts) {
      const bankAcc = assetAccounts?.find(a => a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('checking') || a.name.toLowerCase().includes('cash')) 
        || assetAccounts?.[0];
      const apAcc = apAccounts?.find(a => a.name.toLowerCase().includes('payable'));
      
      if (bankAcc && !form.getValues('payment_account_id')) {
          form.setValue('payment_account_id', bankAcc.id);
      }
      if (apAcc && !form.getValues('accounts_payable_id')) {
          form.setValue('accounts_payable_id', apAcc.id);
      }
    }
  }, [isOpen, accounts, assetAccounts, apAccounts, form]);

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('payments', {
        body: {
          method: 'RECORD_VENDOR_PAYMENT',
          company_id: activeCompany.id,
          vendorId: vendorId,
          billId: billId, // Pass this to the edge function
          paymentData: values,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor_ap_balances'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bills', activeCompany?.id] });
      showSuccess('Payment recorded successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: PaymentFormValues) => mutation.mutate(values);

  const apAccountsList = apAccounts?.filter(a => a.name.toLowerCase().includes('payable'));

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment to {vendorName}</DialogTitle>
          <DialogDescription>Amount Due: {formatCurrency(amountDue)}</DialogDescription>
        </DialogHeader>
        {!apAccountsList?.length && (
            <Alert variant="destructive">
                <AlertDescription>
                Warning: You don't have an "Accounts Payable" account. Please create one in your Chart of Accounts (Type: Liability).
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
            <FormField control={form.control} name="payment_account_id" render={({ field }) => (
              <FormItem><FormLabel>Pay From Bank Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a bank account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            
            <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Memo (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Payment for invoice #123" {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <div className="pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="text-muted-foreground px-0">
                  {showAdvanced ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                  {showAdvanced ? 'Hide Advanced Accounting' : 'Show Advanced Accounting'}
                </Button>
                {showAdvanced && (
                  <div className="mt-4 bg-muted/30 p-4 rounded-md">
                     <FormField control={form.control} name="accounts_payable_id" render={({ field }) => (
                      <FormItem><FormLabel>Debit Accounts Payable Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an A/P account" /></SelectTrigger></FormControl><SelectContent>{apAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                     )} />
                  </div>
                )}
            </div>

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

export default BillPaymentForm;