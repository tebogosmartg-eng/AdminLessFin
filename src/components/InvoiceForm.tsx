import { useEffect, useState } from 'react';
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
import { Account } from '../pages/ChartOfAccounts';
import { Customer } from '../pages/Customers';
import { Product } from '../pages/Products';
import { TaxRate } from '../pages/TaxRates';
import { Project } from '../pages/Projects';
import { Trash2, Clock } from 'lucide-react';
import { addDays, format, isValid } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import InvoicePreview from './InvoicePreview';
import { taxRatesQuery, projectsQuery, customersQuery } from '../lib/queries';
import AddUnbilledTimeDialog from './AddUnbilledTimeDialog';

const invoiceItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Qty must be positive."),
  unit_price: z.coerce.number().min(0, "Price must be non-negative."),
  income_account_id: z.string().min(1, "Income account is required."),
  tax_rate_id: z.string().optional(),
  project_id: z.string().optional(),
  timesheet_ids: z.array(z.string()).optional(),
});

const invoiceSchema = z.object({
  invoice_number: z.string().min(1, "Invoice number is required."),
  invoice_date: z.string().min(1, "Date is required."),
  due_date: z.string().min(1, "Due date is required."),
  customer_id: z.string().min(1, "Customer is required."),
  accounts_receivable_id: z.string().min(1, "Accounts Receivable account is required."),
  inventory_asset_account_id: z.string().optional(),
  tax_payable_account_id: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one line item is required."),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invoiceId?: string;
  duplicateFromId?: string;
  initialCustomerId?: string;
}

const InvoiceForm = ({ isOpen, setIsOpen, invoiceId, duplicateFromId, initialCustomerId }: InvoiceFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!invoiceId;
  const isDuplicating = !!duplicateFromId;
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUnbilledTimeOpen, setIsUnbilledTimeOpen] = useState(false);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_number: '',
      invoice_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      customer_id: '',
      notes: activeCompany?.default_invoice_notes || '',
      items: [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '', tax_rate_id: '', project_id: '' }],
    },
  });

  const { data: customers } = useQuery<Customer[]>({ 
    ...customersQuery(activeCompany?.id!),
    enabled: !!activeCompany 
  });
  
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

  const { data: projects } = useQuery<Project[]>({ ...projectsQuery(activeCompany?.id!), enabled: !!activeCompany });
  const { data: taxRates } = useQuery<TaxRate[]>({ ...taxRatesQuery(activeCompany?.id!), enabled: !!activeCompany });
  
  const incomeAccounts = accounts?.filter(a => a.type === 'Income');
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');

  const watchedValues = form.watch();
  const customerId = form.watch('customer_id');
  const invoiceDate = form.watch('invoice_date');

  useEffect(() => {
    if (isOpen && accounts && !isEditing) {
      const arAcc = accounts.find(a => a.name.toLowerCase().includes('receivable'));
      const taxAcc = accounts.find(a => a.name.toLowerCase().includes('tax payable'));
      const invAcc = accounts.find(a => a.name.toLowerCase().includes('inventory asset'));

      if (arAcc) form.setValue('accounts_receivable_id', arAcc.id);
      if (taxAcc) form.setValue('tax_payable_account_id', taxAcc.id);
      if (invAcc) form.setValue('inventory_asset_account_id', invAcc.id);
    }
  }, [isOpen, accounts, isEditing, form]);

  useEffect(() => {
    if (customerId && invoiceDate && !isEditing && customers) {
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        const terms = customer.payment_terms || 30;
        const baseDate = new Date(invoiceDate);
        if (isValid(baseDate)) {
          const newDueDate = addDays(baseDate, terms);
          form.setValue('due_date', format(newDueDate, 'yyyy-MM-dd'));
        }
      }
    }
  }, [customerId, invoiceDate, customers, isEditing, form]);

  useEffect(() => {
    if (isOpen && !isEditing && !isDuplicating) {
      if (initialCustomerId) {
        form.setValue('customer_id', initialCustomerId);
        setIsUnbilledTimeOpen(true);
      }
      const currentNotes = form.getValues('notes');
      if (!currentNotes && activeCompany?.default_invoice_notes) {
        form.setValue('notes', activeCompany.default_invoice_notes);
      }
    }
  }, [isOpen, isEditing, isDuplicating, initialCustomerId, activeCompany, form]);

  const sourceId = invoiceId || duplicateFromId;
  const { data: sourceInvoice } = useQuery({
    queryKey: ['invoice_source', sourceId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('invoices', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, invoiceId: sourceId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!sourceId && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (sourceInvoice && isOpen) {
      const jeItems = sourceInvoice.journal_entries?.[0]?.journal_entry_items || [];
      const arItem = jeItems.find((item: any) => item.type === 'debit');
      
      const items = jeItems
        .filter((item: any) => item.type === 'credit' && !item.chart_of_accounts?.name.toLowerCase().includes('tax'))
        .map((item: any) => ({
          product_id: item.product_id || '', 
          description: item.description || item.chart_of_accounts?.name || 'Item', 
          quantity: item.quantity || 1, 
          unit_price: item.unit_price || item.amount,
          income_account_id: item.account_id, 
          tax_rate_id: item.journal_entry_item_tax_rates?.[0]?.tax_rates?.id || '',
          project_id: item.project_id || '',
        }));

      form.reset({
        invoice_number: isDuplicating ? '' : sourceInvoice.invoice_number,
        invoice_date: isDuplicating ? format(new Date(), 'yyyy-MM-dd') : sourceInvoice.invoice_date,
        due_date: isDuplicating ? format(addDays(new Date(), 30), 'yyyy-MM-dd') : sourceInvoice.due_date,
        customer_id: sourceInvoice.customers?.id || '',
        description: sourceInvoice.description || '',
        notes: sourceInvoice.notes || activeCompany?.default_invoice_notes || '',
        accounts_receivable_id: arItem?.account_id || '', 
        items: items.length > 0 ? items : [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '', tax_rate_id: '', project_id: '' }],
      });
    }
  }, [sourceInvoice, isEditing, isDuplicating, isOpen, activeCompany, form]);

  const { data: nextInvoiceNumber } = useQuery({
    queryKey: ['next_invoice_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('invoices', {
        body: { method: 'GET_NEXT_INVOICE_NUMBER', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !isEditing && !!activeCompany,
  });

  useEffect(() => {
    if (nextInvoiceNumber && !isEditing) {
      form.setValue('invoice_number', nextInvoiceNumber);
    }
  }, [nextInvoiceNumber, isEditing, form]);

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "items" });

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.unit_price`, product.price || 0);
      if (product.income_account_id) {
        form.setValue(`items.${index}.income_account_id`, product.income_account_id);
      }
    }
  };

  const handleAddUnbilledTime = (timeEntries: any[]) => {
    const defaultIncomeAcc = incomeAccounts?.[0]?.id || '';
    const newItems = timeEntries.map(entry => ({
      product_id: '',
      description: `${entry.projects.name} - ${entry.notes || 'Work performed on ' + format(new Date(entry.date), 'PPP')}`,
      quantity: entry.hours,
      unit_price: entry.projects.billable_rate || 0,
      income_account_id: defaultIncomeAcc, 
      tax_rate_id: '',
      project_id: entry.project_id,
      timesheet_ids: [entry.id],
    }));

    const existingItems = form.getValues('items');
    if (existingItems.length === 1 && !existingItems[0].description && existingItems[0].unit_price === 0) {
      replace(newItems);
    } else {
      append(newItems);
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated');
      
      const timesheetIds = values.items.flatMap(item => item.timesheet_ids || []);
      
      const p_items = values.items.map(item => ({
        product_id: item.product_id === 'none' ? null : (item.product_id || null),
        quantity: item.quantity,
        unit_price: item.unit_price,
        income_account_id: item.income_account_id,
        tax_rate_id: (item.tax_rate_id === 'none' || !item.tax_rate_id) ? null : item.tax_rate_id,
        project_id: item.project_id === 'none' ? null : (item.project_id || null),
      }));

      const payload: any = {
        method: isEditing ? 'PUT' : 'CREATE_WITH_TIMESHEETS',
        company_id: activeCompany.id,
        invoiceId,
        invoiceData: { ...values, p_items },
        timesheetIds: isEditing ? [] : timesheetIds,
      };

      const { error } = await supabase.functions.invoke('invoices', {
        body: payload,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      if (invoiceId) queryClient.invalidateQueries({ queryKey: ['invoice_detail', invoiceId] });
      showSuccess(`Invoice ${isEditing ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const onSubmit = (values: InvoiceFormValues) => mutation.mutate(values);
  
  const productsLookup = products || [];
  const hasInventoryItem = watchedValues.items.some(item => productsLookup.find(p => p.id === item.product_id)?.type === 'inventory');
  const hasTax = watchedValues.items.some(item => item.tax_rate_id && item.tax_rate_id !== 'none');

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
                {isEditing ? 'Edit Invoice' : isDuplicating ? 'Duplicate Invoice' : 'New Invoice'}
            </DialogTitle>
            <DialogDescription>
                Fill out the details below to create or update your invoice.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="invoice_number" render={({ field }) => (<FormItem><FormLabel>Invoice #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="customer_id" render={({ field }) => (<FormItem><FormLabel>Customer</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl><SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="invoice_date" render={({ field }) => (<FormItem><FormLabel>Invoice Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="due_date" render={({ field }) => (<FormItem><FormLabel>Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (<FormItem><FormLabel>A/R Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                {hasInventoryItem && (<FormField control={form.control} name="inventory_asset_account_id" render={({ field }) => (<FormItem><FormLabel>Inventory Asset Account</FormLabel><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />)}
                {hasTax && (<FormField control={form.control} name="tax_payable_account_id" render={({ field }) => (<FormItem><FormLabel>Tax Payable Account</FormLabel><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{liabilityAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />)}
              </div>
              <div className="space-y-2 pt-4">
                <div className="flex justify-between items-center">
                  <FormLabel>Line Items</FormLabel>
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsUnbilledTimeOpen(true)} disabled={!customerId}>
                    <Clock className="mr-2 h-4 w-4" /> Add Unbilled Time
                  </Button>
                </div>
                <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground hidden md:grid">
                  <div className="col-span-2">Item</div>
                  <div className="col-span-3">Description</div>
                  <div className="col-span-1 text-center">Qty</div>
                  <div className="col-span-1 text-right">Price</div>
                  <div className="col-span-1 text-center">Tax</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-2">Account</div>
                  <div className="col-span-1"></div>
                </div>
                {fields.map((field, index) => {
                  const quantity = form.watch(`items.${index}.quantity`);
                  const unitPrice = form.watch(`items.${index}.unit_price`);
                  const lineTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-start border-b pb-4 md:border-none md:pb-0">
                      <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-12 md:col-span-2"><FormControl><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value || 'none'}><SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormControl></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-12 md:col-span-3"><FormControl><Textarea placeholder="Description" {...field} rows={1} className="min-h-[40px]" /></FormControl></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-4 md:col-span-1"><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.unit_price`} render={({ field }) => (<FormItem className="col-span-4 md:col-span-1"><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.tax_rate_id`} render={({ field }) => (<FormItem className="col-span-4 md:col-span-1"><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{taxRates?.map(t => <SelectItem key={t.id} value={t.id}>{t.rate}%</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      <div className="col-span-6 md:col-span-1 pt-2 text-right font-mono text-sm">{formatCurrency(lineTotal)}</div>
                      <FormField control={form.control} name={`items.${index}.income_account_id`} render={({ field }) => (<FormItem className="col-span-5 md:col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger></FormControl><SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.project_id`} render={({ field }) => (<FormItem className="col-span-12 md:col-span-1"><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name.substring(0,10)}...</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      <div className="col-span-1 pt-2 flex justify-end"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                    </div>
                  )
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '', tax_rate_id: '', project_id: '' })}>Add Line</Button>
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Invoice Notes</FormLabel><FormControl><Textarea placeholder="Terms, bank details..." {...field} rows={3} /></FormControl><FormMessage /></FormItem>)} />
              <DialogFooter className="pt-4 border-t sticky bottom-0 bg-background py-4">
                <Button type="button" variant="outline" onClick={() => setIsPreviewOpen(true)}>Preview</Button>
                <div className="flex-grow" />
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Processing...' : 'Save Invoice'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <Sheet open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <SheetContent className="sm:max-w-3xl w-full overflow-y-auto">
            <SheetHeader>
                <SheetTitle>Invoice Preview</SheetTitle>
                <SheetDescription>Verify your invoice details before saving.</SheetDescription>
            </SheetHeader>
            <div className="mt-4">
                <InvoicePreview formData={watchedValues} customers={customers} company={activeCompany} taxRates={taxRates} />
            </div>
        </SheetContent>
      </Sheet>
      
      {customerId && (
        <AddUnbilledTimeDialog
          isOpen={isUnbilledTimeOpen}
          setIsOpen={setIsUnbilledTimeOpen}
          customerId={customerId}
          onAdd={handleAddUnbilledTime}
        />
      )}
    </>
  );
};

export default InvoiceForm;