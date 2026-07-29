import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { accountsQuery, bankAccountsQuery } from '../lib/queries';
import { Account } from '../pages/ChartOfAccounts';
import { BankAccount } from '../lib/banking/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from './ui/form';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showSuccess, showPlatformError } from '../utils/toast';

const bankAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required.'),
  account_type: z.enum(['bank', 'cash', 'petty_cash']),
  account_number: z.string().optional(),
  bank_name: z.string().optional(),
  branch_code: z.string().optional(),
  currency: z.string().length(3, 'Use a 3-letter currency code, e.g. ZAR.').default('ZAR'),
  chart_of_account_id: z.string().optional(),
  is_default: z.boolean().default(false),
  opening_balance: z.coerce.number().default(0),
  opening_balance_date: z.string().optional(),
  opening_balance_contra_account_id: z.string().optional(),
}).refine((v) => v.opening_balance === 0 || !!v.opening_balance_contra_account_id, {
  message: 'Select an opening balance contra account (e.g. Opening Balance Equity).',
  path: ['opening_balance_contra_account_id'],
});

type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

type BankAccountFormProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  account?: BankAccount;
};

const BankAccountForm = ({ isOpen, setIsOpen, account }: BankAccountFormProps) => {
  const { activeCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!account;

  const { data: glAccounts } = useQuery<Account[]>({
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany && isOpen,
  });
  const assetAccounts = (glAccounts ?? []).filter((a) => a.type === 'Asset');
  const contraAccounts = glAccounts ?? [];

  const form = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: {
      name: '', account_type: 'bank', account_number: '', bank_name: '', branch_code: '',
      currency: 'ZAR', chart_of_account_id: '', is_default: false, opening_balance: 0,
      opening_balance_date: new Date().toISOString().split('T')[0], opening_balance_contra_account_id: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(account ? {
        name: account.name,
        account_type: account.account_type,
        account_number: account.account_number ?? '',
        bank_name: account.bank_name ?? '',
        branch_code: account.branch_code ?? '',
        currency: account.currency,
        chart_of_account_id: account.chart_of_account_id,
        is_default: account.is_default,
        opening_balance: 0,
        opening_balance_date: new Date().toISOString().split('T')[0],
        opening_balance_contra_account_id: '',
      } : {
        name: '', account_type: 'bank', account_number: '', bank_name: '', branch_code: '',
        currency: 'ZAR', chart_of_account_id: '', is_default: false, opening_balance: 0,
        opening_balance_date: new Date().toISOString().split('T')[0], opening_balance_contra_account_id: '',
      });
    }
  }, [isOpen, account, form]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bank_accounts', activeCompany?.id] });
    queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
  };

  const createMutation = useMutation({
    mutationFn: async (values: BankAccountFormValues) => {
      if (!activeCompany || !user) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('banking', {
        body: {
          method: 'CREATE_BANK_ACCOUNT', company_id: activeCompany.id,
          bankAccountData: {
            name: values.name,
            account_type: values.account_type,
            account_number: values.account_number || null,
            bank_name: values.bank_name || null,
            branch_code: values.branch_code || null,
            currency: values.currency.toUpperCase(),
            chart_of_account_id: values.chart_of_account_id || null,
            is_default: values.is_default,
            opening_balance: values.opening_balance,
            opening_balance_date: values.opening_balance_date,
            opening_balance_contra_account_id: values.opening_balance_contra_account_id || null,
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); showSuccess('Bank account created.'); setIsOpen(false); },
    onError: (error: unknown) => showPlatformError(error, { onRetry: () => form.handleSubmit(onSubmit)() }),
  });

  // No UPDATE_BANK_ACCOUNT method exists on the (frozen this phase) banking
  // edge function — editing administrative fields (name/bank name/branch/
  // account number/currency) is a direct, RLS-scoped update limited to
  // non-financial columns only; it never touches journal/posting data.
  const editMutation = useMutation({
    mutationFn: async (values: BankAccountFormValues) => {
      if (!account) throw new Error('No account selected');
      const { error } = await supabase.from('bank_accounts').update({
        name: values.name,
        account_number: values.account_number || null,
        bank_name: values.bank_name || null,
        branch_code: values.branch_code || null,
        currency: values.currency.toUpperCase(),
      }).eq('id', account.id);
      if (error) throw error;
      if (values.is_default && !account.is_default) {
        const { error: defaultErr } = await supabase.functions.invoke('banking', {
          body: { method: 'SET_DEFAULT_BANK_ACCOUNT', company_id: activeCompany!.id, bankAccountId: account.id },
        });
        if (defaultErr) throw defaultErr;
      }
    },
    onSuccess: () => { invalidate(); showSuccess('Bank account updated.'); setIsOpen(false); },
    onError: (error: unknown) => showPlatformError(error, { onRetry: () => form.handleSubmit(onSubmit)() }),
  });

  const onSubmit = (values: BankAccountFormValues) => {
    if (isEditing) editMutation.mutate(values);
    else createMutation.mutate(values);
  };

  const pending = createMutation.isPending || editMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Bank Account' : 'New Bank Account'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this bank account’s details.' : 'Create a bank, cash, or petty cash account. A General Ledger account is created automatically unless you link an existing one.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Account Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Main Operating Account" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="account_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isEditing}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="petty_cash">Petty Cash</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="currency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl><Input placeholder="ZAR" maxLength={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bank_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Name</FormLabel>
                  <FormControl><Input placeholder="e.g. First National Bank" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="branch_code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch Code</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="account_number" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Account Number</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {!isEditing && (
                <FormField control={form.control} name="chart_of_account_id" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Link to Existing GL Account (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Auto-create a new Asset account" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {assetAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.account_number} — {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Leave blank to have a new General Ledger Asset account created automatically.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="is_default" render={({ field }) => (
                <FormItem className="col-span-2 flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Default Account</FormLabel>
                    <FormDescription>Used as the pre-selected account across Banking.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />

              {!isEditing && (
                <>
                  <FormField control={form.control} name="opening_balance" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opening Balance</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="opening_balance_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opening Balance Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="opening_balance_contra_account_id" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Opening Balance Contra Account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="e.g. Opening Balance Equity" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {contraAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_number} — {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Required only if the opening balance is non-zero. Posts through the Posting Engine.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Account'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BankAccountForm;
