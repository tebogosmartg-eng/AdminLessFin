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
import {
  findAccountByRole,
  findCashEquivalentAccounts,
  resolveControlAccounts,
} from '../lib/accounting/accountRoles';

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
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const { data: assetAccounts } = useQuery<Account[]>({
    queryKey: ['asset_accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Asset').eq('company_id', activeCompany.id);
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, balance: 0 })) as Account[];
    },
    enabled: !!activeCompany,
  });

  // Reset form when opened with new props
  useEffect(() => {
    if (isOpen) {
      form.reset({
        payment_date: new Date().toISOString().split('T')[0],
        deposit_account_id: form.getValues('deposit_account_id'), // Preserve if already set
        accounts_receivable_id: form.getValues('accounts_receivable_id'), // Preserve if already set
        amount: amountDue,
        description: `Payment from ${customerName}`,
      });
    }
  }, [isOpen, amountDue, customerName, form]);

  // Smart Defaults: resolve deposit + AR via account_role / cash-equivalent subcategory
  useEffect(() => {
    if (isOpen && assetAccounts) {
      const controls = resolveControlAccounts(assetAccounts);
      const cashAccounts = findCashEquivalentAccounts(assetAccounts);
      const bankAcc = cashAccounts[0] || assetAccounts.find((a) => a.account_role !== 'trade_receivable');

      if (controls.ar && !form.getValues('accounts_receivable_id')) {
          form.setValue('accounts_receivable_id', controls.ar.id);
      }
      if (bankAcc && !form.getValues('deposit_account_id')) {
          form.setValue('deposit_account_id', bankAcc.id);
      }
    }
  }, [isOpen, assetAccounts, form]);

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('payments', {
        body: {
          method: 'RECORD_CUSTOMER_PAYMENT',
          company_id: activeCompany.id,
          customerId: customerId,
          paymentData: values,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer_ar_balances'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      showSuccess('Payment received successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: PaymentFormValues) => mutation.mutate(values);

  const arAccountsList = assetAccounts?.filter((a) => a.account_role === 'trade_receivable' || findAccountByRole([a], 'trade_receivable'));
  const bankAccountsList = assetAccounts?.filter((a) => !arAccountsList?.some((ar) => ar.id === a.id));

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive Payment from {customerName}</DialogTitle>
          <DialogDescription>Amount Due: {formatCurrency(amountDue)}</DialogDescription>
        </DialogHeader>
        {!arAccountsList?.length && (
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
              <FormItem><FormLabel>Deposit To Bank Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a bank account" /></SelectTrigger></FormControl><SelectContent>{bankAccountsList?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
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
                     <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (
                        <FormItem><FormLabel>Credit Accounts Receivable</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an A/R account" /></SelectTrigger></FormControl><SelectContent>{arAccountsList?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                     )} />
                  </div>
                )}
            </div>

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