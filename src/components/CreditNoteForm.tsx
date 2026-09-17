/**
 * Issue a credit note.
 *
 * What the clerk chooses: the customer, optionally the invoice being credited,
 * why, and the lines. What the clerk does NOT choose any more is the debtors
 * control account or the VAT account -- the server resolves both by role, the
 * receivable being the one the credited invoice actually raised. Offering
 * "any asset account" as receivables is how a credit note used to balance
 * perfectly and corrupt the debtors ledger.
 *
 * Crediting an invoice starts from that invoice's own lines, and the form will
 * not submit a credit larger than the invoice has left to credit; the server
 * enforces the same limit.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { showError, showSuccess } from '../utils/toast';
import { Customer } from '../pages/Customers';
import { Product } from '../pages/Products';
import { Account } from '../pages/ChartOfAccounts';
import { TaxRate } from '../pages/TaxRates';
import { Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { taxRatesQuery, accountsQuery, customersQuery, productsQuery } from '../lib/queries';
import { edgeErrorMessage } from '../lib/platform/edgeError';
import { creditNoteTotals } from '../lib/creditNotes/creditNoteTotals';
import { refreshAfterCreditNoteChange } from '../lib/creditNotes/creditNoteQueries';

const NONE = 'none';

const itemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().trim().min(1, 'Describe what is being credited.'),
  quantity: z.coerce.number().positive('Quantity must be more than zero.'),
  unit_price: z.coerce.number().min(0, 'Price cannot be negative.'),
  account_id: z.string().min(1, 'Choose the income account.'),
  tax_rate_id: z.string().optional(),
});

const schema = z.object({
  credit_note_number: z.string().trim().min(1, 'A number is required.'),
  credit_note_date: z.string().min(1, 'A date is required.'),
  customer_id: z.string().min(1, 'Choose the customer.'),
  invoice_id: z.string().optional(),
  apply_to_invoice: z.boolean(),
  reason: z.string().trim().min(1, 'Say why this credit is being issued. It is printed on the credit note.'),
  items: z.array(itemSchema).min(1, 'Add at least one line.'),
});

type FormValues = z.infer<typeof schema>;

type CreditableInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  gross: number;
  credited: number;
  creditable: number;
  outstanding: number;
};

type InvoiceForCredit = {
  invoice: { id: string; invoice_number: string; invoice_date: string };
  gross: number;
  credited: number;
  creditable: number;
  outstanding: number;
  suggested_tax_rate_id: string | null;
  vat_total: number;
  lines: Array<{ description: string; quantity: number; unit_price: number; account_id: string }>;
};

interface Props {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  /** Open already pointed at a customer, e.g. from the customer's page. */
  initialCustomerId?: string;
  /** Open already crediting an invoice, e.g. from the invoice's page. */
  initialInvoiceId?: string;
}

const blankLine = () => ({
  product_id: '',
  description: '',
  quantity: 1,
  unit_price: 0,
  account_id: '',
  tax_rate_id: NONE,
});

const CreditNoteForm = ({ isOpen, setIsOpen, initialCustomerId, initialInvoiceId }: Props) => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoiceBasis, setInvoiceBasis] = useState<InvoiceForCredit | null>(null);
  const [taxNote, setTaxNote] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      credit_note_number: '',
      credit_note_date: format(new Date(), 'yyyy-MM-dd'),
      customer_id: '',
      invoice_id: '',
      apply_to_invoice: true,
      reason: '',
      items: [blankLine()],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'items' });

  const { data: customers } = useQuery<Customer[]>({ ...customersQuery(companyId!), enabled: !!companyId });
  const { data: products } = useQuery<Product[]>({ ...productsQuery(companyId!), enabled: !!companyId });
  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(companyId!), enabled: !!companyId });
  const { data: taxRates } = useQuery<TaxRate[]>({ ...taxRatesQuery(companyId!), enabled: !!companyId });
  const incomeAccounts = useMemo(() => (accounts ?? []).filter((a) => a.type === 'Income'), [accounts]);

  const { data: nextNumber } = useQuery({
    queryKey: ['next_cn_number', companyId],
    enabled: isOpen && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'GET_NEXT_NUMBER', company_id: companyId },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The next credit note number could not be read.'));
      return data as string;
    },
  });

  const customerId = form.watch('customer_id');
  const invoiceId = form.watch('invoice_id');

  const { data: creditableInvoices, isLoading: loadingInvoices } = useQuery<CreditableInvoice[]>({
    queryKey: ['creditable_invoices', companyId, customerId],
    enabled: isOpen && !!companyId && !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'GET_CREDITABLE_INVOICES', company_id: companyId, customerId },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The customer’s invoices could not be loaded.'));
      return (data ?? []) as CreditableInvoice[];
    },
  });

  // A fresh form every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      credit_note_number: '',
      credit_note_date: format(new Date(), 'yyyy-MM-dd'),
      customer_id: initialCustomerId ?? '',
      invoice_id: '',
      apply_to_invoice: true,
      reason: '',
      items: [blankLine()],
    });
    setInvoiceBasis(null);
    setTaxNote(null);
    if (initialCustomerId && initialInvoiceId) {
      void loadInvoice(initialInvoiceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialCustomerId, initialInvoiceId]);

  useEffect(() => {
    if (isOpen && nextNumber && !form.getValues('credit_note_number')) {
      form.setValue('credit_note_number', nextNumber);
    }
  }, [isOpen, nextNumber, form]);

  /** Start from what the invoice actually said. */
  async function loadInvoice(id: string) {
    form.setValue('invoice_id', id);
    if (!id || id === NONE) {
      setInvoiceBasis(null);
      setTaxNote(null);
      return;
    }
    setLoadingInvoice(true);
    try {
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'GET_INVOICE_FOR_CREDIT', company_id: companyId, invoiceId: id },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The invoice could not be loaded.'));
      const basis = data as InvoiceForCredit;
      setInvoiceBasis(basis);
      if (basis.lines.length > 0) {
        replace(
          basis.lines.map((line) => ({
            product_id: '',
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            account_id: line.account_id,
            tax_rate_id: basis.suggested_tax_rate_id ?? NONE,
          })),
        );
      }
      setTaxNote(
        basis.vat_total > 0 && !basis.suggested_tax_rate_id
          ? `${basis.invoice.invoice_number} charged ${formatCurrency(basis.vat_total)} VAT at more than one rate. Choose the VAT rate for each line being credited.`
          : null,
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The invoice could not be loaded.');
      form.setValue('invoice_id', '');
      setInvoiceBasis(null);
    } finally {
      setLoadingInvoice(false);
    }
  }

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find((p) => p.id === productId);
    if (!product) return;
    form.setValue(`items.${index}.description`, product.description || product.name);
    form.setValue(`items.${index}.unit_price`, product.price || 0);
    if (product.income_account_id) form.setValue(`items.${index}.account_id`, product.income_account_id);
  };

  const items = form.watch('items');
  const totals = creditNoteTotals(items, taxRates as Array<{ id: string; rate: number }> | undefined);
  const selectedInvoice = invoiceBasis && invoiceId === invoiceBasis.invoice.id ? invoiceBasis : null;
  const overCredit =
    selectedInvoice && totals.total > selectedInvoice.creditable + 0.005
      ? `${selectedInvoice.invoice.invoice_number} can be credited by at most ${formatCurrency(selectedInvoice.creditable)}.`
      : null;
  const applyToInvoice = form.watch('apply_to_invoice');
  const willApply = selectedInvoice && applyToInvoice
    ? Math.max(0, Math.min(totals.total, selectedInvoice.outstanding))
    : 0;

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: {
          method: 'CREATE',
          company_id: companyId,
          creditNoteData: {
            credit_note_number: values.credit_note_number.trim(),
            credit_note_date: values.credit_note_date,
            customer_id: values.customer_id,
            invoice_id: values.invoice_id && values.invoice_id !== NONE ? values.invoice_id : null,
            apply_to_invoice: values.apply_to_invoice,
            reason: values.reason.trim(),
            items: values.items.map((item) => ({
              product_id: item.product_id || null,
              description: item.description.trim(),
              quantity: item.quantity,
              unit_price: item.unit_price,
              account_id: item.account_id,
              tax_rate_id: item.tax_rate_id && item.tax_rate_id !== NONE ? item.tax_rate_id : null,
            })),
          },
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The credit note could not be issued.'));
      return data as { credit_note_id: string; credit_note_number: string; total: number; applied: number; unapplied: number };
    },
    onSuccess: (result, values) => {
      refreshAfterCreditNoteChange(queryClient);
      queryClient.invalidateQueries({ queryKey: ['next_cn_number'] });
      const invoiceNumber = creditableInvoices?.find((i) => i.id === values.invoice_id)?.invoice_number;
      showSuccess(
        result.applied > 0
          ? `${result.credit_note_number} issued for ${formatCurrency(result.total)}. ${formatCurrency(result.applied)} applied to ${invoiceNumber ?? 'the invoice'}${result.unapplied > 0 ? `, ${formatCurrency(result.unapplied)} held on account` : ''}.`
          : `${result.credit_note_number} issued for ${formatCurrency(result.total)} and held on the customer’s account.`,
      );
      setIsOpen(false);
      navigate(`/credit-notes/${result.credit_note_id}`);
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : 'The credit note could not be issued.'),
  });

  const lineError = form.formState.errors.items;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Issue credit note</DialogTitle>
          <DialogDescription>
            Reduce what a customer owes, for returned goods, an overcharge or an agreed discount. It is posted to the
            ledger when issued and can later be voided, never deleted.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => {
              if (overCredit) {
                showError(overCredit);
                return;
              }
              mutation.mutate(values);
            })}
            className="space-y-5"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>Customer</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('invoice_id', '');
                        setInvoiceBasis(null);
                        setTaxNote(null);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="credit_note_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="credit_note_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <FormField
                control={form.control}
                name="invoice_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credits invoice (optional)</FormLabel>
                    <Select
                      onValueChange={(value) => void loadInvoice(value === NONE ? '' : value)}
                      value={field.value || NONE}
                      disabled={!customerId || loadingInvoices}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={customerId ? 'Not against a specific invoice' : 'Choose a customer first'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not against a specific invoice</SelectItem>
                        {creditableInvoices?.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoice_number} · {format(new Date(inv.invoice_date + 'T00:00:00'), 'dd MMM yyyy')} ·{' '}
                            up to {formatCurrency(inv.creditable)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for credit</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="e.g. Two units returned damaged" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {loadingInvoice && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading the invoice lines…
              </p>
            )}

            {selectedInvoice && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p>
                    {selectedInvoice.invoice.invoice_number} was for {formatCurrency(selectedInvoice.gross)}
                    {selectedInvoice.credited > 0 && `, of which ${formatCurrency(selectedInvoice.credited)} has already been credited`}
                    . Up to {formatCurrency(selectedInvoice.creditable)} can be credited; {formatCurrency(selectedInvoice.outstanding)} is
                    still outstanding on it.
                  </p>
                  <FormField
                    control={form.control}
                    name="apply_to_invoice"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Apply this credit to {selectedInvoice.invoice.invoice_number}
                          {applyToInvoice && totals.total > 0 && (
                            <span className="text-muted-foreground">
                              {' '}
                              ({formatCurrency(willApply)} against the invoice
                              {totals.total - willApply > 0.005 ? `, ${formatCurrency(totals.total - willApply)} held on account` : ''})
                            </span>
                          )}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </AlertDescription>
              </Alert>
            )}

            {taxNote && <p className="text-sm text-amber-700 dark:text-amber-400">{taxNote}</p>}

            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-muted-foreground lg:grid">
                <div className="col-span-2">Product</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-1 text-right">Unit price</div>
                <div className="col-span-1">VAT</div>
                <div className="col-span-2">Income account</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1" />
              </div>
              {fields.map((row, index) => {
                const line = totals.lines[index] ?? { amount: 0, tax: 0 };
                return (
                  <div key={row.id} className="grid grid-cols-2 items-start gap-2 rounded-md border p-2 lg:grid-cols-12 lg:border-0 lg:p-0">
                    <FormField
                      control={form.control}
                      name={`items.${index}.product_id`}
                      render={({ field }) => (
                        <FormItem className="col-span-2 lg:col-span-2">
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              handleProductSelect(value, index);
                            }}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger aria-label="Product">
                                <SelectValue placeholder="Product" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {products?.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.description`}
                      render={({ field }) => (
                        <FormItem className="col-span-2 lg:col-span-3">
                          <FormControl>
                            <Input placeholder="Description" aria-label="Description" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem className="col-span-1">
                          <FormControl>
                            <Input type="number" step="any" min="0" className="text-right" aria-label="Quantity" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.unit_price`}
                      render={({ field }) => (
                        <FormItem className="col-span-1">
                          <FormControl>
                            <Input type="number" step="0.01" min="0" className="text-right" aria-label="Unit price" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.tax_rate_id`}
                      render={({ field }) => (
                        <FormItem className="col-span-1">
                          <Select onValueChange={field.onChange} value={field.value || NONE}>
                            <FormControl>
                              <SelectTrigger aria-label="VAT rate">
                                <SelectValue placeholder="VAT" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={NONE}>No VAT</SelectItem>
                              {taxRates?.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name ? `${t.name} (${t.rate}%)` : `${t.rate}%`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.account_id`}
                      render={({ field }) => (
                        <FormItem className="col-span-1 lg:col-span-2">
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger aria-label="Income account">
                                <SelectValue placeholder="Income account" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {incomeAccounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <div className="col-span-1 pt-2 text-right text-sm tabular-nums">
                      {formatCurrency(line.amount)}
                      {line.tax > 0 && (
                        <div className="text-xs text-muted-foreground">+{formatCurrency(line.tax)} VAT</div>
                      )}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {Array.isArray(lineError) && lineError.some(Boolean) && (
                <p className="text-sm font-medium text-destructive">
                  {lineError
                    .map((e, i) =>
                      e
                        ? `Line ${i + 1}: ${
                            e.description?.message ?? e.quantity?.message ?? e.unit_price?.message ?? e.account_id?.message ?? ''
                          }`
                        : null,
                    )
                    .filter(Boolean)
                    .join(' ')}
                </p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => append(blankLine())}>
                <Plus className="mr-2 h-4 w-4" /> Add line
              </Button>
            </div>

            <div className="flex flex-col items-end gap-1 border-t pt-3 text-sm">
              <div className="flex w-full max-w-xs justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex w-full max-w-xs justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span className="tabular-nums">{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex w-full max-w-xs justify-between text-lg font-bold">
                <span>Total credit</span>
                <span className="tabular-nums">{formatCurrency(totals.total)}</span>
              </div>
              {overCredit && <p className="font-medium text-destructive">{overCredit}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending || loadingInvoice || !!overCredit || totals.total <= 0}>
                {mutation.isPending ? 'Issuing…' : 'Issue credit note'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreditNoteForm;
