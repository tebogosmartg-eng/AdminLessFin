import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { edgeErrorMessage } from '../lib/platform/edgeError';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackFirstUsageEvent } from '@/lib/analytics/productAnalytics';
import { Vendor } from '../pages/Vendors';
import { Product } from '../pages/Products';
import { Project } from '../pages/Projects';
import { TaxRate } from '../pages/TaxRates';
import { Account } from '../pages/ChartOfAccounts';
import { Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { addDays, format, isValid } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { projectsQuery, taxRatesQuery } from '../lib/queries';
import { useDialogFormReset } from '../hooks/useDialogFormReset';
import {
  findAccountByRole,
  manuallyPostableAccounts,
  resolveControlAccounts,
  restrictedToModule,
} from '../lib/accounting/accountRoles';

const billItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Qty must be positive."),
  unit_cost: z.coerce.number().min(0, "Cost must be non-negative."),
  expense_account_id: z.string().min(1, "Account is required."),
  project_id: z.string().optional(),
  tax_rate_id: z.string().optional(),
});

const billSchema = z.object({
  bill_number: z.string().optional(),
  bill_date: z.string().min(1, "Date is required."),
  due_date: z.string().min(1, "Due date is required."),
  vendor_id: z.string().min(1, "Vendor is required."),
  accounts_payable_id: z.string().min(1, "Accounts Payable account is required."),
  tax_receivable_account_id: z.string().optional(),
  description: z.string().optional(),
  items: z.array(billItemSchema).min(1, "At least one line item is required."),
});

export type BillFormValues = z.infer<typeof billSchema>;

interface BillFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  billId?: string;
  duplicateFromId?: string;
  initialData?: Partial<BillFormValues>;
  onSuccess?: () => void;
}

const BillForm = ({ isOpen, setIsOpen, billId, duplicateFromId, initialData, onSuccess }: BillFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!billId;
  const isDuplicating = !!duplicateFromId;
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [existingAttachmentUrl, setExistingAttachmentUrl] = useState<string | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const form = useForm<BillFormValues>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      bill_number: '',
      bill_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      vendor_id: '',
      accounts_payable_id: '',
      tax_receivable_account_id: '',
      description: '',
      items: [{ product_id: '', description: '', quantity: 1, unit_cost: 0, expense_account_id: '', project_id: '', tax_rate_id: '' }],
    },
  });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ['vendors', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('vendors', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });

  // Memoised: these were recomputed on every render, so any effect that listed
  // them as a dependency re-ran on every render. One such effect calls
  // form.setValue('items', ...), which re-renders — a self-sustaining loop that
  // overwrote the line-item account the moment the user picked one. That loop is
  // the reported "account selection flickers".
  const expenseAccounts = useMemo(() => accounts?.filter(a => a.type === 'Expense'), [accounts]);
  const assetAccounts = useMemo(() => accounts?.filter(a => a.type === 'Asset'), [accounts]);
  const apAccounts = useMemo(() => accounts?.filter(a => a.type === 'Liability'), [accounts]);
  // A bill may not post to an account the Accounting Policy Engine reserves to
  // the Inventory or Fixed Assets module — it rejects the posting with
  // "may only be posted from the Inventory module". Offering such an account
  // here guaranteed a failure the customer could not anticipate, so the picker
  // shows only what a bill can legitimately post to. The database rule is
  // unchanged and remains the authority.
  const lineAccountOptions = useMemo(
    () => manuallyPostableAccounts([...(expenseAccounts || []), ...(assetAccounts || [])]),
    [expenseAccounts, assetAccounts],
  );
  const noPostableAccounts = !!accounts && lineAccountOptions.length === 0;

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { data: products } = useQuery<Product[]>({
    queryKey: ['products', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('products', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });
  
  const { data: projects } = useQuery<Project[]>({ ...projectsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: taxRates } = useQuery<TaxRate[]>({ ...taxRatesQuery(activeCompany!.id), enabled: !!activeCompany });

  const vendorId = form.watch('vendor_id');
  const billDate = form.watch('bill_date');

  // Smart Defaults: apply once per open so a CoA refetch cannot overwrite AP.
  useEffect(() => {
    if (!isOpen || isEditing || isDuplicating || !accounts) return;
    if (form.getValues('accounts_payable_id')) return;
    const controls = resolveControlAccounts(accounts);
    if (controls.ap) form.setValue('accounts_payable_id', controls.ap.id);
  }, [isOpen, accounts, isEditing, isDuplicating, form]);

  // Apply initial data (e.g. PO → Bill conversion).
  //
  // Applied ONCE per dialog opening. Previously this ran on every render (its
  // dependency list held arrays rebuilt each render) and each run called
  // form.setValue('items', ...), wiping whatever line-item account the user had
  // just chosen and re-triggering the render that ran it again.
  const initialDataAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      initialDataAppliedFor.current = null;
      return;
    }
    if (isEditing || isDuplicating || !initialData) return;
    // Accounts are needed to resolve the fallback expense account; wait for them
    // rather than applying twice.
    if (!accounts) return;
    const key = JSON.stringify(initialData);
    if (initialDataAppliedFor.current === key) return;
    initialDataAppliedFor.current = key;

    if (initialData.vendor_id) form.setValue('vendor_id', initialData.vendor_id);
    if (initialData.description) form.setValue('description', initialData.description);
    if (initialData.bill_date) form.setValue('bill_date', initialData.bill_date);
    if (initialData.due_date) form.setValue('due_date', initialData.due_date);
    if (initialData.bill_number) form.setValue('bill_number', initialData.bill_number);

    if (initialData.items && initialData.items.length > 0) {
      const defaultExpenseId = expenseAccounts?.[0]?.id || assetAccounts?.[0]?.id || '';
      form.setValue(
        'items',
        initialData.items.map((item) => ({
          product_id: item.product_id || '',
          description: item.description || '',
          quantity: item.quantity ?? 1,
          unit_cost: item.unit_cost ?? 0,
          expense_account_id: item.expense_account_id || defaultExpenseId,
          project_id: item.project_id || '',
          tax_rate_id: item.tax_rate_id || '',
        }))
      );
    }
  }, [isOpen, initialData, isEditing, isDuplicating, form, accounts, expenseAccounts, assetAccounts]);

  const { data: sourceBill } = useQuery({
    queryKey: ['bill_duplicate', duplicateFromId, activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('bills', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, billId: duplicateFromId },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && isDuplicating && !!duplicateFromId && !!activeCompany,
  });

  useDialogFormReset(isOpen, sourceBill ? `dup:${duplicateFromId}` : 'new', () => {
    if (!isDuplicating || !sourceBill) return;

    const debitItems =
      sourceBill.journal_entries?.journal_entry_items?.filter(
        (item: { type: string }) => item.type === 'debit'
      ) || [];

    const defaultExpenseId = expenseAccounts?.[0]?.id || assetAccounts?.[0]?.id || '';

    form.reset({
      bill_number: '',
      bill_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: sourceBill.due_date
        ? format(addDays(new Date(sourceBill.due_date), 30), 'yyyy-MM-dd')
        : format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      vendor_id: sourceBill.vendor_id,
      accounts_payable_id: form.getValues('accounts_payable_id'),
      tax_receivable_account_id: '',
      description: sourceBill.journal_entries?.description
        ? `Copy of: ${sourceBill.journal_entries.description}`
        : '',
      items:
        debitItems.length > 0
          ? debitItems.map((item: {
              account_id: string;
              amount: number;
              project_id?: string;
              chart_of_accounts?: { name?: string } | null;
              journal_entry_item_tax_rates?: { tax_rates: { id: string } }[];
            }) => ({
              product_id: '',
              description: item.chart_of_accounts?.name || 'Line item',
              quantity: 1,
              unit_cost: item.amount,
              expense_account_id: item.account_id || defaultExpenseId,
              project_id: item.project_id || '',
              tax_rate_id: item.journal_entry_item_tax_rates?.[0]?.tax_rates?.id || '',
            }))
          : [{ description: '', quantity: 1, unit_cost: 0, expense_account_id: defaultExpenseId, project_id: '', tax_rate_id: '' }],
    });
  });

  useEffect(() => {
    if (vendorId && billDate && !isEditing && vendors) {
      const vendor = vendors.find(v => v.id === vendorId);
      if (vendor) {
        const terms = vendor.payment_terms || 30;
        const baseDate = new Date(billDate);
        if (isValid(baseDate)) {
          const newDueDate = addDays(baseDate, terms);
          form.setValue('due_date', format(newDueDate, 'yyyy-MM-dd'));
        }
      }
    }
  }, [vendorId, billDate, vendors, isEditing, form]);

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.unit_cost`, product.cost || 0);
      // Only assign an account the bill can actually post to. The inventory
      // asset and COGS accounts belong to the Inventory module; assigning them
      // here produced a policy rejection at save time.
      const assignable = (id: string | null | undefined) =>
        !!id && lineAccountOptions.some((a) => a.id === id);
      if (product.type !== 'inventory' && assignable(product.cogs_account_id)) {
        form.setValue(`items.${index}.expense_account_id`, product.cogs_account_id!);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: BillFormValues) => {
      if (!user || !activeCompany) throw new Error('Authentication required');

      let finalAttachmentUrl = existingAttachmentUrl;
      if (removeAttachment) finalAttachmentUrl = null;

      if (attachmentFile) {
         const fileExt = attachmentFile.name.split('.').pop();
         const fileName = `bill-${Date.now()}.${fileExt}`;
         const filePath = `${activeCompany.id}/bills/${fileName}`;
         const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, attachmentFile);
         if (uploadError) throw new Error(`Upload Error: ${uploadError.message}`);
         const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
         finalAttachmentUrl = urlData.publicUrl;
      }

      const p_items = values.items.map(item => ({
        product_id: item.product_id === 'none' ? null : (item.product_id || null),
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        expense_account_id: item.expense_account_id,
        project_id: item.project_id === 'none' ? null : (item.project_id || null),
        tax_rate_id: (item.tax_rate_id === 'none' || !item.tax_rate_id) ? null : item.tax_rate_id,
      }));

      const billData = {
        bill_number: values.bill_number || null,
        vendor_id: values.vendor_id,
        bill_date: values.bill_date,
        due_date: values.due_date,
        accounts_payable_id: values.accounts_payable_id,
        tax_receivable_account_id: (values.tax_receivable_account_id === 'none' || !values.tax_receivable_account_id) ? null : values.tax_receivable_account_id,
        description: values.description || null,
        attachment_url: finalAttachmentUrl,
        p_items: p_items,
      };

      const { error } = await supabase.functions.invoke('bills', {
        body: {
          method: 'POST',
          company_id: activeCompany.id,
          billData: billData,
        },
      });

      // supabase-js reports every non-2xx as "Edge Function returned a non-2xx
      // status code". Replace it with the server's actual diagnosis (missing
      // control account, closed period, rejected account) so the customer can
      // act on it.
      if (error) throw new Error(await edgeErrorMessage(error, 'The bill could not be recorded.'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      if (!billId && !duplicateFromId && activeCompany) {
        trackFirstUsageEvent(activeCompany.id, AnalyticsEvents.USAGE_FIRST_BILL, 'bill');
      }
      showSuccess(`Bill recorded successfully.`);
      if (onSuccess) onSuccess();
      setIsOpen(false);
      form.reset();
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const onSubmit = (values: BillFormValues) => mutation.mutate(values);

  // react-hook-form calls this when validation blocks submit. Without it the
  // Record Bill button appeared inert: no request, no message, dialog open.
  const onInvalid = () => {
    const itemErrors = form.formState.errors.items;
    const firstLine = Array.isArray(itemErrors)
      ? itemErrors.findIndex((e) => e)
      : -1;
    showError(
      firstLine >= 0
        ? `Line ${firstLine + 1} is incomplete — check the highlighted fields.`
        : 'Some required details are missing — check the highlighted fields.',
    );
  };

  const watchedItems = form.watch('items');
  const hasTax = watchedItems.some(item => item.tax_rate_id && item.tax_rate_id !== 'none');
  const totalAmount = watchedItems.reduce((sum, item) => {
      const sub = (item.quantity || 0) * (item.unit_cost || 0);
      const rate = taxRates?.find(t => t.id === item.tax_rate_id)?.rate || 0;
      return sum + sub * (1 + rate/100);
  }, 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-6xl h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Bill' : isDuplicating ? 'Duplicate Bill' : 'Record New Bill'}</DialogTitle>
          <DialogDescription>Enter the supplier invoice details below.</DialogDescription>
        </DialogHeader>
        {noPostableAccounts && (
          <Alert variant="destructive">
            <AlertDescription>
              This company has no expense or asset account a bill can post to.
              {accounts?.some((a) => restrictedToModule(a))
                ? ' The only candidates are reserved to the Inventory or Fixed Assets module.'
                : ''}{' '}
              Add an operating expense account in the Chart of Accounts, then record this bill.
            </AlertDescription>
          </Alert>
        )}
        {!findAccountByRole(accounts, 'trade_payable') && (
            <Alert variant="destructive"><AlertDescription>Warning: You don't have a Trade Payables control account. Please assign account_role trade_payable in your Chart of Accounts (Type: Liability).</AlertDescription></Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="bill_number" render={({ field }) => (<FormItem><FormLabel>Bill #</FormLabel><FormControl><Input placeholder="Vendor Inv #" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="bill_date" render={({ field }) => (<FormItem><FormLabel>Bill Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="due_date" render={({ field }) => (<FormItem><FormLabel>Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>General Description</FormLabel><FormControl><Textarea placeholder="Brief note about this bill" {...field} /></FormControl><FormMessage /></FormItem>)} />
            
            <FormItem>
              <FormLabel>Attachment (Optional)</FormLabel>
              {existingAttachmentUrl && !attachmentFile && !removeAttachment && (
                <div className="flex items-center justify-between p-2 border rounded-md">
                  <a href={existingAttachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline truncate text-blue-600">
                    View Existing Attachment
                  </a>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRemoveAttachment(true)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {removeAttachment && (
                <div className="text-sm text-muted-foreground p-2 border rounded-md border-dashed">
                  Attachment will be removed. <Button type="button" variant="link" className="p-0 h-auto" onClick={() => setRemoveAttachment(false)}>Undo</Button>
                </div>
              )}
              <FormControl>
                <Input 
                  type="file" 
                  onChange={(e) => {
                    setAttachmentFile(e.target.files?.[0] || null);
                    setRemoveAttachment(false);
                  }} 
                />
              </FormControl>
            </FormItem>

            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground hidden md:grid">
                <div className="col-span-2">Item</div>
                <div className="col-span-2">Description</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">Cost</div>
                <div className="col-span-1">Tax</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-2">Account</div>
                <div className="col-span-2">Project</div>
              </div>
              {fields.map((field, index) => {
                const quantity = form.watch(`items.${index}.quantity`);
                const unitCost = form.watch(`items.${index}.unit_cost`);
                const taxRateId = form.watch(`items.${index}.tax_rate_id`);
                const rate = taxRates?.find(t => t.id === taxRateId)?.rate || 0;
                const lineTotal = (Number(quantity) || 0) * (Number(unitCost) || 0) * (1 + rate/100);
                
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start border-b pb-4 md:border-none md:pb-0">
                    <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-12 md:col-span-2"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-12 md:col-span-2"><FormControl><Input placeholder="Description" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-4 md:col-span-1"><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.unit_cost`} render={({ field }) => (<FormItem className="col-span-4 md:col-span-1"><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.tax_rate_id`} render={({ field }) => (<FormItem className="col-span-4 md:col-span-1"><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{taxRates?.map(t => <SelectItem key={t.id} value={t.id}>{t.rate}%</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <div className="col-span-6 md:col-span-1 pt-2 text-right font-mono text-xs">{formatCurrency(lineTotal)}</div>
                    <FormField control={form.control} name={`items.${index}.expense_account_id`} render={({ field }) => (<FormItem className="col-span-5 md:col-span-2"><Select onValueChange={field.onChange} value={field.value || undefined}><FormControl><SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger></FormControl><SelectContent>{lineAccountOptions.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.project_id`} render={({ field }) => (<FormItem className="col-span-12 md:col-span-2"><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <div className="col-span-1 pt-1 flex justify-end"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                )
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unit_cost: 0, expense_account_id: expenseAccounts?.[0]?.id || '', project_id: '', tax_rate_id: '' })}>Add Line</Button>
            </div>
            
            <div className="pt-4 border-t">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="text-muted-foreground px-0">
                  {showAdvanced ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                  {showAdvanced ? 'Hide Advanced Accounting' : 'Show Advanced Accounting'}
                </Button>
                {showAdvanced && (
                  <div className="grid grid-cols-2 gap-4 mt-4 bg-muted/30 p-4 rounded-md">
                      <FormField control={form.control} name="accounts_payable_id" render={({ field }) => (<FormItem><FormLabel>Credit Accounts Payable</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger></FormControl><SelectContent>{apAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                      {hasTax && (
                          <FormField control={form.control} name="tax_receivable_account_id" render={({ field }) => (<FormItem><FormLabel>Tax Receivable Account</FormLabel><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="Select Asset Account" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                      )}
                  </div>
                )}
            </div>

            <div className="flex justify-end pt-2 border-t">
               <span className="text-xl font-bold">Total Bill: {formatCurrency(totalAmount)}</span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Record Bill'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BillForm;