import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { accountsQuery, bankAccountsQuery } from '../lib/queries';
import { Account } from '../pages/ChartOfAccounts';
import { BANK_TRANSACTION_TYPES, BANK_TRANSACTION_LABELS, INCREASE_TYPES, BankAccountType } from '../lib/banking/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showSuccess, showPlatformError } from '../utils/toast';

const transactionSchema = z.object({
  bank_account_id: z.string().min(1, 'Choose an account.'),
  transaction_type: z.enum(BANK_TRANSACTION_TYPES),
  direction: z.enum(['increase', 'decrease']),
  transaction_date: z.string().min(1, 'Date is required.'),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  contra_account_id: z.string().min(1, 'Choose the other side of the entry.'),
  description: z.string().optional(),
  reference: z.string().optional(),
});
type TransactionFormValues = z.infer<typeof transactionSchema>;

type BankTransactionFormProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  defaultBankAccountId?: string;
  restrictToAccountType?: BankAccountType;
  restrictToTypes?: readonly string[];
  title?: string;
};

const BankTransactionForm = ({ isOpen, setIsOpen, defaultBankAccountId, restrictToAccountType, restrictToTypes, title }: BankTransactionFormProps) => {
  const { activeCompany, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bankAccounts } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany && isOpen });
  const { data: glAccounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany && isOpen });

  const selectableBankAccounts = useMemo(
    () => (bankAccounts ?? []).filter((a) => a.status === 'active' && (!restrictToAccountType || a.account_type === restrictToAccountType)),
    [bankAccounts, restrictToAccountType]
  );
  const selectableTypes = restrictToTypes ?? BANK_TRANSACTION_TYPES;

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      bank_account_id: defaultBankAccountId ?? '', transaction_type: selectableTypes[0] as TransactionFormValues['transaction_type'],
      direction: 'increase', transaction_date: new Date().toISOString().split('T')[0], amount: 0,
      contra_account_id: '', description: '', reference: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        bank_account_id: defaultBankAccountId ?? '', transaction_type: selectableTypes[0] as TransactionFormValues['transaction_type'],
        direction: 'increase', transaction_date: new Date().toISOString().split('T')[0], amount: 0,
        contra_account_id: '', description: '', reference: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultBankAccountId]);

  const transactionType = form.watch('transaction_type');
  useEffect(() => {
    form.setValue('direction', INCREASE_TYPES.has(transactionType) ? 'increase' : 'decrease');
  }, [transactionType, form]);

  const mutation = useMutation({
    mutationFn: async (values: TransactionFormValues) => {
      if (!activeCompany || !user) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('banking', {
        body: {
          method: 'RECORD_TRANSACTION', company_id: activeCompany.id,
          transactionData: {
            bank_account_id: values.bank_account_id,
            transaction_type: values.transaction_type,
            direction: values.direction,
            transaction_date: values.transaction_date,
            amount: values.amount,
            contra_account_id: values.contra_account_id,
            description: values.description || null,
            reference: values.reference || null,
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_transactions', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      showSuccess('Transaction posted.');
      setIsOpen(false);
    },
    onError: (error: unknown) => showPlatformError(error, { onRetry: () => form.handleSubmit(onSubmit)() }),
  });

  const onSubmit = (values: TransactionFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? 'Record Bank Transaction'}</DialogTitle>
          <DialogDescription>Posts atomically through the Enterprise Posting Engine.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="bank_account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Account</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {selectableBankAccounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="transaction_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {selectableTypes.map((t) => (<SelectItem key={t} value={t}>{BANK_TRANSACTION_LABELS[t]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="direction" render={({ field }) => (
                <FormItem>
                  <FormLabel>Direction</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="increase">Increases balance</SelectItem>
                      <SelectItem value="decrease">Decreases balance</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="transaction_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="contra_account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Contra Account</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Other side of the entry" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {(glAccounts ?? []).map((a) => (<SelectItem key={a.id} value={a.id}>{a.account_number} — {a.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reference" render={({ field }) => (
              <FormItem>
                <FormLabel>Reference (optional)</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Posting…' : 'Post Transaction'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BankTransactionForm;
