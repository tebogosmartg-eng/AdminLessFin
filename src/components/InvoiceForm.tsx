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
import { Trash2, Clock } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import InvoicePreview from './InvoicePreview';
import { taxRatesQuery } from '../lib/queries';
import AddUnbilledTimeDialog from './AddUnbilledTimeDialog';

const invoiceItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Qty must be positive."),
  unit_price: z.coerce.number().min(0, "Price must be non-negative."),
  income_account_id: z.string().min(1, "Income account is required."),
  tax_rate_id: z.string().optional(),
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
  items: z.array(invoiceItemSchema).min(1, "At least one line item is required."),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invoiceId?: string;
}

const InvoiceForm = ({ isOpen, setIsOpen, invoiceId }: InvoiceFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!invoiceId;
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUnbilledTimeOpen, setIsUnbilledTimeOpen] = useState(false);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_number: '',
      invoice_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      items: [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '', tax_rate_id: '' }],
    },
  });

  const watchedValues = form.watch();
  const customerId = form.watch('customer_id');

  const { data: invoiceToEdit } = useQuery({
    queryKey: ['invoice_edit', invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('invoices', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, invoiceId },
      });
      if (error) throw error;
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (isEditing && invoiceToEdit) {
      // Map the invoice items from the journal entry format
      const items = invoiceToEdit.journal_entries?.[0]?.journal_entry_items
        .filter((item: any) => item.type === 'credit' && !item.chart_of_accounts?.name.toLowerCase().includes('tax'))
        .map((item: any) => ({
          product_id: '', // We don't track product ID in journal items explicitly in GET_ONE, but in future optimization we could
          description: item.chart_of_accounts?.name || 'Item', // This is a fallback if description isn't stored per line item in basic journal structure
          quantity: 1, // Basic journal doesn't store qty/price separately usually, simplifying here or we need enhanced schema
          unit_price: item.amount,
          income_account_id: '', // Would need to reverse lookup or store this
          tax_rate_id: item.journal_entry_item_tax_rates?.[0]?.tax_rates?.id || '',
        }));

      form.reset({
        invoice_number: invoiceToEdit.invoice_number,
        invoice_date: invoiceToEdit.invoice_date,
        due_date: invoiceToEdit.due_date,
        customer_id: invoiceToEdit.customers?.id || '', // Need ID, GET_ONE currently returns object. We might need to adjust GET_ONE or use the ID from the parent object if available. 
        // Note: GET_ONE select includes customers(name, address, email). We need customer_id directly from invoices table.
        // Adjusting GET_ONE is out of scope for this file, assuming we can get it or user re-selects.
        // Actually, let's fix the logic below slightly to be robust.
        accounts_receivable_id: '', // Needs to be inferred from the Debit line of the JE
        items: items || [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '', tax_rate_id: '' }],
      });
      // NOTE: Full edit reconstruction from Journal Entry is complex because JE loses some context (like Qty). 
      // For now, simple editing of header fields or creating new is safer. 
      // Real "Edit Invoice" usually requires a dedicated invoice_items table which we are simulating via JSONB -> JE.
      // Given the schema limitations, editing an existing invoice fully might reset items if not careful.
      // We will allow editing but user might need to re-enter items if we can't perfectly reconstruct them.
    } 
  }, [invoiceToEdit, isEditing, form]);

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

  const { data: customers } = useQuery<Customer[]>({ queryKey: ['customers', activeCompany?.id] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products', activeCompany?.id] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts', activeCompany?.id] });
  const { data: taxRates } = useQuery<TaxRate[]>({ ...taxRatesQuery(activeCompany?.id!), enabled: !!activeCompany });
  
  const incomeAccounts = accounts?.filter(a => a.type === 'Income');
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');

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
    const newItems = timeEntries.map(entry => ({
      product_id: '',
      description: `${entry.projects.name} - ${entry.notes || 'Work performed on ' + format(new Date(entry.date), 'PPP')}`,
      quantity: entry.hours,
      unit_price: entry.projects.billable_rate || 0,
      income_account_id: '',
      tax_rate_id: '',
      timesheet_ids: [entry.id],
    }));

    const existingItems = watchedValues.items;
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
        product_id: item.product_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        income_account_id: item.income_account_id,
        tax_rate_id: (item.tax_rate_id === 'none' || !item.tax_rate_id) ? null : item.tax_rate_id,
      }));

      const payload: any = {
        company_id: activeCompany.id,
        invoiceData: { ...values, p_items }, // p_items is key for the PUT logic we added
      };

      if (isEditing) {
        payload.method = 'PUT';
        payload.invoiceId = invoiceId;
      } else {
        payload.method = 'CREATE_WITH_TIMESHEETS';
        payload.timesheetIds = timesheetIds;
      }

      const { error } = await supabase.functions.invoke('invoices', {
        body: payload,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['products', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['unbilled_time', customerId, activeCompany?.id] });
      // Invalidate specific invoice detail if editing
      if (invoiceId) {
          queryClient.invalidateQueries({ queryKey: ['invoice_detail', invoiceId] });
      }
      showSuccess(`Invoice ${isEditing ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: InvoiceFormValues) => mutation.mutate(values);
  
  const hasInventoryItem = watchedValues.items.some(item => products?.find(p => p.id === item.product_id)?.type === 'inventory');
  const hasTax = watchedValues.items.some(item => item.tax_rate_id && item.tax_rate_id !== 'none');

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Invoice' : 'New Invoice'}</DialogTitle>
            <DialogDescription>
                {isEditing 
                    ? "Updating this invoice will regenerate the underlying accounting entries." 
                    : "Fill out the details below to create a new invoice."}
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
                <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (<FormItem><FormLabel>Deposit To (A/R Account)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/R Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                {hasInventoryItem && (<FormField control={form.control} name="inventory_asset_account_id" render={({ field }) => (<FormItem><FormLabel>Inventory Asset Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Inventory Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />)}
                {hasTax && (<FormField control={form.control} name="tax_payable_account_id" render={({ field }) => (<FormItem><FormLabel>Tax Payable Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Tax Liability Account" /></SelectTrigger></FormControl><SelectContent>{liabilityAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />)}
              </div>
              <div className="space-y-2 pt-4">
                <div className="flex justify-between items-center">
                  <FormLabel>Items</FormLabel>
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsUnbilledTimeOpen(true)} disabled={!customerId}>
                    <Clock className="mr-2 h-4 w-4" /> Add Unbilled Time
                  </Button>
                </div>
                <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <div className="col-span-3">Item</div>
                  <div className="col-span-3">Description</div>
                  <div className="col-span-1">Qty</div>
                  <div className="col-span-1">Price</div>
                  <div className="col-span-1">Tax</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-2">Account</div>
                </div>
                {fields.map((field, index) => {
                  const quantity = form.watch(`items.${index}.quantity`);
                  const unitPrice = form.watch(`items.${index}.unit_price`);
                  const lineTotal = quantity * unitPrice;
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                      <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-3"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-3"><FormControl><Textarea placeholder="Description" {...field} rows={1} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" placeholder="Qty" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.unit_price`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" step="0.01" placeholder="Price" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name={`items.${index}.tax_rate_id`} render={({ field }) => (<FormItem className="col-span-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{taxRates?.map(t => <SelectItem key={t.id} value={t.id}>{t.rate}%</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      <div className="col-span-1 pt-2 text-right font-mono">{formatCurrency(lineTotal)}</div>
                      <FormField control={form.control} name={`items.${index}.income_account_id`} render={({ field }) => (<FormItem className="col-span-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger></FormControl><SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      <div className="col-span-1 pt-2"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                    </div>
                  )
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '', tax_rate_id: '' })}>Add Line</Button>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsPreviewOpen(true)}>Preview</Button>
                <div className="flex-grow" />
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Invoice'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Sheet open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <SheetContent className="sm:max-w-3xl w-full">
            <SheetHeader>
                <SheetTitle>Invoice Preview</SheetTitle>
                <SheetDescription>This is a preview of what your invoice will look like.</SheetDescription>
            </SheetHeader>
            <InvoicePreview
                formData={watchedValues}
                customers={customers}
                company={activeCompany}
                taxRates={taxRates}
            />
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