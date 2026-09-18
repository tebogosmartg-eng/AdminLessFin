/**
 * Record a supplier credit.
 *
 * What the clerk chooses: the supplier, optionally the bill being credited,
 * why, and the lines. What the clerk does NOT choose any more is the creditors
 * control account or the VAT account -- the server resolves both by role, the
 * payable being the one the credited bill actually raised. Offering "any
 * liability account" as payables is how a supplier credit used to balance
 * perfectly and corrupt the creditors ledger.
 *
 * Crediting a bill starts from that bill's own lines, and the form will not
 * submit a credit larger than the bill has left to credit; the server enforces
 * the same limit.
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
import { Vendor } from '../pages/Vendors';
import { Product } from '../pages/Products';
import { Account } from '../pages/ChartOfAccounts';
import { TaxRate } from '../pages/TaxRates';
import { Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { safeFormatDate } from '../lib/dates';
import { formatCurrency } from '../lib/utils';
import { taxRatesQuery, accountsQuery, vendorsQuery, productsQuery } from '../lib/queries';
import { edgeErrorMessage } from '../lib/platform/edgeError';
import { vendorCreditTotals } from '../lib/vendorCredits/vendorCreditTotals';
import { refreshAfterVendorCreditChange } from '../lib/vendorCredits/vendorCreditQueries';

const NONE = 'none';

/**
 * The accounts a bill can have been posted to, and therefore the accounts a
 * credit can reverse: what was bought, whether it was an expense or an asset.
 * The control accounts, the bank and VAT are excluded -- the server refuses
 * them too.
 */
const CREDITABLE_ROLES_EXCLUDED = ['trade_payable', 'trade_receivable', 'bank', 'input_vat', 'output_vat', 'vat_control'];

const itemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().trim().min(1, 'Describe what is being credited.'),
  quantity: z.coerce.number().positive('Quantity must be more than zero.'),
  unit_price: z.coerce.number().min(0, 'Price cannot be negative.'),
  account_id: z.string().min(1, 'Choose the account this credit reverses.'),
  tax_rate_id: z.string().optional(),
});

const schema = z.object({
  credit_number: z.string().trim().min(1, 'A number is required.'),
  credit_date: z.string().min(1, 'A date is required.'),
  vendor_id: z.string().min(1, 'Choose the supplier.'),
  bill_id: z.string().optional(),
  apply_to_bill: z.boolean(),
  reason: z.string().trim().min(1, 'Say why this credit was given. It is printed on the credit.'),
  items: z.array(itemSchema).min(1, 'Add at least one line.'),
});

type FormValues = z.infer<typeof schema>;

type CreditableBill = {
  id: string;
  bill_number: string;
  bill_date: string;
  status: string;
  gross: number;
  credited: number;
  creditable: number;
  outstanding: number;
};

type BillForCredit = {
  bill: { id: string; bill_number: string; bill_date: string };
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
  /** Open already pointed at a supplier, e.g. from the supplier's page. */
  initialVendorId?: string;
  /** Open already crediting a bill, e.g. from the bills list. */
  initialBillId?: string;
}

const blankLine = () => ({
  product_id: '',
  description: '',
  quantity: 1,
  unit_price: 0,
  account_id: '',
  tax_rate_id: NONE,
});

const VendorCreditForm = ({ isOpen, setIsOpen, initialVendorId, initialBillId }: Props) => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [loadingBill, setLoadingBill] = useState(false);
  const [billBasis, setBillBasis] = useState<BillForCredit | null>(null);
  const [taxNote, setTaxNote] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      credit_number: '',
      credit_date: safeFormatDate(new Date(), 'yyyy-MM-dd'),
      vendor_id: '',
      bill_id: '',
      apply_to_bill: true,
      reason: '',
      items: [blankLine()],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'items' });

  const { data: vendors } = useQuery<Vendor[]>({ ...vendorsQuery(companyId!), enabled: !!companyId });
  const { data: products } = useQuery<Product[]>({ ...productsQuery(companyId!), enabled: !!companyId });
  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(companyId!), enabled: !!companyId });
  const { data: taxRates } = useQuery<TaxRate[]>({ ...taxRatesQuery(companyId!), enabled: !!companyId });
  const costAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (a) =>
          (a.type === 'Expense' || a.type === 'Asset') &&
          !CREDITABLE_ROLES_EXCLUDED.includes((a as { account_role?: string | null }).account_role ?? ''),
      ),
    [accounts],
  );

  const { data: nextNumber } = useQuery({
    queryKey: ['next_vcn_number', companyId],
    enabled: isOpen && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'GET_NEXT_NUMBER', company_id: companyId },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The next supplier credit number could not be read.'));
      return data as string;
    },
  });

  const vendorId = form.watch('vendor_id');
  const billId = form.watch('bill_id');

  const { data: creditableBills, isLoading: loadingBills } = useQuery<CreditableBill[]>({
    queryKey: ['creditable_bills', companyId, vendorId],
    enabled: isOpen && !!companyId && !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'GET_CREDITABLE_BILLS', company_id: companyId, vendorId },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The supplier’s bills could not be loaded.'));
      return (data ?? []) as CreditableBill[];
    },
  });

  // A fresh form every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      credit_number: '',
      credit_date: safeFormatDate(new Date(), 'yyyy-MM-dd'),
      vendor_id: initialVendorId ?? '',
      bill_id: '',
      apply_to_bill: true,
      reason: '',
      items: [blankLine()],
    });
    setBillBasis(null);
    setTaxNote(null);
    if (initialVendorId && initialBillId) {
      void loadBill(initialBillId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialVendorId, initialBillId]);

  useEffect(() => {
    if (isOpen && nextNumber && !form.getValues('credit_number')) {
      form.setValue('credit_number', nextNumber);
    }
  }, [isOpen, nextNumber, form]);

  /** Start from what the bill actually said. */
  async function loadBill(id: string) {
    form.setValue('bill_id', id);
    if (!id || id === NONE) {
      setBillBasis(null);
      setTaxNote(null);
      return;
    }
    setLoadingBill(true);
    try {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'GET_BILL_FOR_CREDIT', company_id: companyId, billId: id },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The bill could not be loaded.'));
      const basis = data as BillForCredit;
      setBillBasis(basis);
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
          ? `${basis.bill.bill_number} carried ${formatCurrency(basis.vat_total)} VAT at more than one rate. Choose the VAT rate for each line being credited.`
          : null,
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The bill could not be loaded.');
      form.setValue('bill_id', '');
      setBillBasis(null);
    } finally {
      setLoadingBill(false);
    }
  }

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find((p) => p.id === productId);
    if (!product) return;
    form.setValue(`items.${index}.description`, product.description || product.name);
    form.setValue(`items.${index}.unit_price`, product.cost || 0);
    if (product.cogs_account_id) form.setValue(`items.${index}.account_id`, product.cogs_account_id);
  };

  const items = form.watch('items');
  const totals = vendorCreditTotals(items, taxRates as Array<{ id: string; rate: number }> | undefined);
  const selectedBill = billBasis && billId === billBasis.bill.id ? billBasis : null;
  const overCredit =
    selectedBill && totals.total > selectedBill.creditable + 0.005
      ? `${selectedBill.bill.bill_number} can be credited by at most ${formatCurrency(selectedBill.creditable)}.`
      : null;
  const applyToBill = form.watch('apply_to_bill');
  const willApply = selectedBill && applyToBill
    ? Math.max(0, Math.min(totals.total, selectedBill.outstanding))
    : 0;

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: {
          method: 'CREATE',
          company_id: companyId,
          creditData: {
            credit_number: values.credit_number.trim(),
            credit_date: values.credit_date,
            vendor_id: values.vendor_id,
            bill_id: values.bill_id && values.bill_id !== NONE ? values.bill_id : null,
            apply_to_bill: values.apply_to_bill,
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
      if (error) throw new Error(await edgeErrorMessage(error, 'The supplier credit could not be recorded.'));
      return data as { vendor_credit_id: string; credit_number: string; total: number; applied: number; unapplied: number };
    },
    onSuccess: (result, values) => {
      refreshAfterVendorCreditChange(queryClient);
      queryClient.invalidateQueries({ queryKey: ['next_vcn_number'] });
      const billNumber = creditableBills?.find((b) => b.id === values.bill_id)?.bill_number;
      showSuccess(
        result.applied > 0
          ? `${result.credit_number} recorded for ${formatCurrency(result.total)}. ${formatCurrency(result.applied)} set against ${billNumber ?? 'the bill'}${result.unapplied > 0 ? `, ${formatCurrency(result.unapplied)} held on account` : ''}.`
          : `${result.credit_number} recorded for ${formatCurrency(result.total)} and held on the supplier’s account.`,
      );
      setIsOpen(false);
      navigate(`/vendor-credits/${result.vendor_credit_id}`);
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : 'The supplier credit could not be recorded.'),
  });

  const lineError = form.formState.errors.items;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Record supplier credit</DialogTitle>
          <DialogDescription>
            Reduce what is owed to a supplier, for returned goods, an overcharge or an agreed discount. It is posted to
            the ledger when recorded and can later be voided, never deleted.
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
                name="vendor_id"
                render={({ field }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>Supplier</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('bill_id', '');
                        setBillBasis(null);
                        setTaxNote(null);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vendors?.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
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
                name="credit_number"
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
                name="credit_date"
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
                name="bill_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credits bill (optional)</FormLabel>
                    <Select
                      onValueChange={(value) => void loadBill(value === NONE ? '' : value)}
                      value={field.value || NONE}
                      disabled={!vendorId || loadingBills}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={vendorId ? 'Not against a specific bill' : 'Choose a supplier first'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not against a specific bill</SelectItem>
                        {creditableBills?.map((bill) => (
                          <SelectItem key={bill.id} value={bill.id}>
                            {bill.bill_number} · {safeFormatDate(bill.bill_date, 'dd MMM yyyy')} ·{' '}
                            up to {formatCurrency(bill.creditable)}
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

            {loadingBill && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading the bill lines…
              </p>
            )}

            {selectedBill && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p>
                    {selectedBill.bill.bill_number} was for {formatCurrency(selectedBill.gross)}
                    {selectedBill.credited > 0 && `, of which ${formatCurrency(selectedBill.credited)} has already been credited`}
                    . Up to {formatCurrency(selectedBill.creditable)} can be credited; {formatCurrency(selectedBill.outstanding)} is
                    still outstanding on it.
                  </p>
                  <FormField
                    control={form.control}
                    name="apply_to_bill"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Apply this credit to {selectedBill.bill.bill_number}
                          {applyToBill && totals.total > 0 && (
                            <span className="text-muted-foreground">
                              {' '}
                              ({formatCurrency(willApply)} against the bill
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
                <div className="col-span-2">Account</div>
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
                              <SelectItem value={NONE}>None</SelectItem>
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
                              <SelectTrigger aria-label="Account">
                                <SelectValue placeholder="Account" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {costAccounts.map((acc) => (
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
              <Button type="submit" disabled={mutation.isPending || loadingBill || !!overCredit || totals.total <= 0}>
                {mutation.isPending ? 'Recording…' : 'Record supplier credit'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default VendorCreditForm;
