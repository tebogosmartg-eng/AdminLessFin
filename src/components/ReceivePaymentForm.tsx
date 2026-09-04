import { useEffect, useMemo, useState } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { Alert, AlertDescription } from './ui/alert';
import { Textarea } from './ui/textarea';
import { formatCurrency } from '../lib/utils';
import { edgeErrorMessage } from '../lib/platform/edgeError';
import {
  findCashEquivalentAccounts,
  manuallyPostableAccounts,
  resolveControlAccounts,
} from '../lib/accounting/accountRoles';
import {
  allocateOldestFirst, allocatedCents, allocationProblem, type OpenInvoice,
} from '../lib/accounting/receiptAllocation';

const paymentSchema = z.object({
  payment_date: z.string().min(1, 'Date is required.'),
  deposit_account_id: z.string().min(1, 'Deposit account is required.'),
  amount: z.coerce.number().min(0.01, 'Amount must be positive.'),
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

const cents = (n: number) => Math.round(n * 100);

const ReceivePaymentForm = ({ isOpen, setIsOpen, customerId, customerName, amountDue }: ReceivePaymentFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  /**
   * How much of the receipt each invoice takes, keyed by invoice id, as the
   * raw text in the box so a half-typed number is not fought with.
   */
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState(false);

  /**
   * Stable for as long as the dialog is open, so a failed submit that is
   * retried -- or a double click that gets past the disabled button -- records
   * the receipt once. A new dialog gets a new key.
   */
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_date: new Date().toISOString().split('T')[0],
      deposit_account_id: '',
      amount: amountDue > 0 ? amountDue : 0,
      description: '',
    },
  });

  const { data: assetAccounts } = useQuery<Account[]>({
    queryKey: ['asset_accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('type', 'Asset')
        .eq('company_id', activeCompany.id);
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, balance: 0 })) as Account[];
    },
    enabled: !!activeCompany,
  });

  /** The customer's unpaid invoices, with what is genuinely left on each. */
  const { data: openInvoices, isLoading: invoicesLoading } = useQuery<OpenInvoice[]>({
    queryKey: ['customer_open_invoices', activeCompany?.id, customerId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('payments', {
        body: {
          method: 'GET_CUSTOMER_OPEN_INVOICES',
          company_id: activeCompany!.id,
          customerId,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The open invoices could not be loaded.'));
      return (data ?? []) as OpenInvoice[];
    },
    enabled: !!activeCompany && !!customerId && isOpen,
  });

  const amount = Number(form.watch('amount') || 0);

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      payment_date: new Date().toISOString().split('T')[0],
      deposit_account_id: form.getValues('deposit_account_id'),
      amount: amountDue > 0 ? amountDue : 0,
      description: `Payment from ${customerName}`,
    });
    setAllocations({});
    setEdited(false);
    setIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `ui:receipt:${crypto.randomUUID()}`
        : `ui:receipt:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
  }, [isOpen, amountDue, customerName, form]);

  // Deposit account: a real cash-equivalent, not simply "any asset that is not
  // debtors" — which is how a receipt ends up banked into office furniture.
  const bankAccounts = useMemo(() => {
    const postable = manuallyPostableAccounts(assetAccounts ?? []);
    const cash = findCashEquivalentAccounts(postable);
    if (cash.length) return cash;
    const controls = resolveControlAccounts(postable);
    return postable.filter((a) => a.id !== controls.ar?.id && a.account_role !== 'trade_receivable');
  }, [assetAccounts]);

  useEffect(() => {
    if (isOpen && bankAccounts.length && !form.getValues('deposit_account_id')) {
      form.setValue('deposit_account_id', bankAccounts[0].id);
    }
  }, [isOpen, bankAccounts, form]);

  // Until the clerk says otherwise, the money goes against the oldest invoice
  // first — the same rule the server applies, so what is shown is what happens.
  useEffect(() => {
    if (edited || !openInvoices) return;
    setAllocations(allocateOldestFirst(openInvoices, amount));
  }, [openInvoices, amount, edited]);

  const appliedCents = useMemo(() => allocatedCents(allocations), [allocations]);
  const remainderCents = cents(amount) - appliedCents;
  const blocked = useMemo(
    () => allocationProblem(openInvoices ?? [], allocations, amount),
    [openInvoices, allocations, amount],
  );

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const list = Object.entries(allocations)
        .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) || 0 }))
        .filter((a) => a.amount > 0);

      const { data, error } = await supabase.functions.invoke('payments', {
        body: {
          method: 'RECORD_CUSTOMER_RECEIPT',
          company_id: activeCompany.id,
          customerId,
          payment_date: values.payment_date,
          deposit_account_id: values.deposit_account_id,
          amount: values.amount,
          // An explicit list, always — including an empty one, which means the
          // money is deliberately left on account rather than applied.
          allocations: list,
          description: values.description,
          idempotency_key: idempotencyKey,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The payment could not be recorded.'));
      return data as { posting_status: string; allocated: number; unallocated: number; journal_number: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['customer_ar_balances'] });
      queryClient.invalidateQueries({ queryKey: ['customer_open_invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });

      // Reporting a replay as a fresh success would tell someone their payment
      // was recorded twice when it was banked once.
      if (result?.posting_status === 'duplicate') {
        showSuccess(`This payment was already recorded as ${result.journal_number}. Nothing was recorded twice.`);
      } else if (result && result.unallocated > 0) {
        showSuccess(
          `Payment received. ${formatCurrency(result.allocated)} applied to invoices, ` +
          `${formatCurrency(result.unallocated)} left on account.`,
        );
      } else {
        showSuccess('Payment received and applied to the customer’s invoices.');
      }
      setIsOpen(false);
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : 'The payment could not be recorded.');
    },
  });

  const onSubmit = (values: PaymentFormValues) => {
    if (blocked) {
      showError(blocked);
      return;
    }
    mutation.mutate(values);
  };

  const setRow = (invoiceId: string, value: string) => {
    setEdited(true);
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive Payment from {customerName}</DialogTitle>
          <DialogDescription>
            {amountDue > 0
              ? `Outstanding: ${formatCurrency(amountDue)}`
              : 'This customer has no outstanding balance. Anything received will sit on their account as a credit.'}
          </DialogDescription>
        </DialogHeader>

        {!bankAccounts.length && (
          <Alert variant="destructive">
            <AlertDescription>
              There is no bank or cash account to deposit into. Add one in the Chart of Accounts first.
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
                <FormItem><FormLabel>Amount Received</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <FormField control={form.control} name="deposit_account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Deposit To</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select a bank account" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {bankAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.account_number} {acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* What the money settles. Without this the receipt reaches the
                ledger but the invoices stay open for ever. */}
            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">Apply to invoices</span>
                <div className="flex gap-2">
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => { setEdited(false); setAllocations(allocateOldestFirst(openInvoices ?? [], amount)); }}
                  >
                    Oldest first
                  </Button>
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => { setEdited(true); setAllocations({}); }}
                  >
                    Leave on account
                  </Button>
                </div>
              </div>

              {invoicesLoading ? (
                <div className="p-3"><Skeleton className="h-16 w-full" /></div>
              ) : !openInvoices?.length ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No unpaid invoices. The full amount will sit on the customer&rsquo;s account as a credit.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="w-[140px] text-right">Apply</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openInvoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                          <TableCell className="text-muted-foreground">{inv.due_date ?? inv.invoice_date}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(inv.outstanding)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number" step="0.01" min="0" max={inv.outstanding}
                              className="h-8 text-right font-mono"
                              value={allocations[inv.id] ?? ''}
                              onChange={(e) => setRow(inv.id, e.target.value)}
                              aria-label={`Amount to apply to ${inv.invoice_number}`}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  Applied {formatCurrency(appliedCents / 100)} of {formatCurrency(amount)}
                </span>
                <span className={remainderCents < 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                  {remainderCents < 0
                    ? `${formatCurrency(-remainderCents / 100)} over-applied`
                    : `${formatCurrency(remainderCents / 100)} left on account`}
                </span>
              </div>
            </div>

            {blocked && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{blocked}</AlertDescription>
              </Alert>
            )}

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Memo (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., EFT reference 4471" {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending || !!blocked || !bankAccounts.length}>
                {mutation.isPending ? 'Saving…' : 'Receive Payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ReceivePaymentForm;
