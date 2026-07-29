import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { bankAccountsQuery } from '../lib/queries';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showSuccess, showPlatformError } from '../utils/toast';

const transferSchema = z.object({
  from_bank_account_id: z.string().min(1, 'Choose the source account.'),
  to_bank_account_id: z.string().min(1, 'Choose the destination account.'),
  transfer_date: z.string().min(1, 'Date is required.'),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  description: z.string().optional(),
}).refine((v) => v.from_bank_account_id !== v.to_bank_account_id, {
  message: 'Source and destination must be different accounts.',
  path: ['to_bank_account_id'],
});
type TransferFormValues = z.infer<typeof transferSchema>;

type BankTransferFormProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  defaultFromBankAccountId?: string;
};

const BankTransferForm = ({ isOpen, setIsOpen, defaultFromBankAccountId }: BankTransferFormProps) => {
  const { activeCompany, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bankAccounts } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany && isOpen });
  const activeAccounts = (bankAccounts ?? []).filter((a) => a.status === 'active');

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_bank_account_id: defaultFromBankAccountId ?? '', to_bank_account_id: '',
      transfer_date: new Date().toISOString().split('T')[0], amount: 0, description: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        from_bank_account_id: defaultFromBankAccountId ?? '', to_bank_account_id: '',
        transfer_date: new Date().toISOString().split('T')[0], amount: 0, description: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultFromBankAccountId]);

  const mutation = useMutation({
    mutationFn: async (values: TransferFormValues) => {
      if (!activeCompany || !user) throw new Error('No active company');
      // Client-generated idempotency key means a network retry replays safely
      // instead of risking a second transfer.
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke('banking', {
        body: {
          method: 'RECORD_TRANSFER', company_id: activeCompany.id,
          transferData: {
            from_bank_account_id: values.from_bank_account_id,
            to_bank_account_id: values.to_bank_account_id,
            transfer_date: values.transfer_date,
            amount: values.amount,
            description: values.description || null,
            idempotency_key: idempotencyKey,
          },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_transactions', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank_transfers_view', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      showSuccess('Transfer posted.');
      setIsOpen(false);
    },
    onError: (error: unknown) => showPlatformError(error, { onRetry: () => form.handleSubmit(onSubmit)() }),
  });

  const onSubmit = (values: TransferFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer Between Accounts</DialogTitle>
          <DialogDescription>One balanced journal, posted atomically — no manual entry required.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="from_bank_account_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>From</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Source account" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeAccounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="to_bank_account_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>To</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Destination account" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeAccounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="transfer_date" render={({ field }) => (
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
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Transferring…' : 'Transfer'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BankTransferForm;
