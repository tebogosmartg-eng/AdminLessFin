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
import { Trash2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import InvoicePreview from './InvoicePreview';

const invoiceItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(1, "Qty must be at least 1."),
  unit_price: z.coerce.number().min(0.01, "Price must be positive."),
  income_account_id: z.string().min(1, "Income account is required."),
});

const invoiceSchema = z.object({
  invoice_number: z.string().min(1, "Invoice number is required."),
  invoice_date: z.string().min(1, "Date is required."),
  due_date: z.string().min(1, "Due date is required."),
  customer_id: z.string().min(1, "Customer is required."),
  accounts_receivable_id: z.string().min(1, "Accounts Receivable account is required."),
  inventory_asset_account_id: z.string().optional(),
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

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_number: '',
      invoice_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      customer_id: '',
      accounts_receivable_id: '',
      inventory_asset_account_id: '',
      description: '',
      items: [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '' }],
    },
  });

  const watchedValues = form.watch();

  // Note: Editing logic is complex and has been omitted for this implementation.
  // This form currently only supports creating new invoices.

  const { data: nextInvoiceNumber } = useQuery({
    queryKey: ['next_invoice_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_next_invoice_number_for_user');
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !isEditing && !!activeCompany,
  });

  useEffect(() => {
    if (nextInvoiceNumber) {
      form.setValue('invoice_number', nextInvoiceNumber);
    }
  }, [nextInvoiceNumber, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customers', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.from('customers').select('*').eq('company_id', activeCompany.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });
  const { data: products } = useQuery<Product[]>({
    queryKey: ['products', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.from('products').select('*').eq('company_id', activeCompany.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('company_id', activeCompany.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });
  const incomeAccounts = accounts?.filter(a => a.type === 'Income');
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');

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

  const mutation = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');
      
      const p_items = values.items.map(item => ({
        product_id: item.product_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        income_account_id: item.income_account_id,
      }));

      const { error } = await supabase.rpc('create_invoice_with_inventory', {
        p_company_id: activeCompany.id,
        p_customer_id: values.customer_id,
        p_invoice_date: values.invoice_date,
        p_due_date: values.due_date,
        p_invoice_number: values.invoice_number,
        p_ar_account_id: values.accounts_receivable_id,
        p_inventory_asset_account_id: values.inventory_asset_account_id || null,
        p_description: values.description || `Invoice ${values.invoice_number}`,
        p_items: p_items,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['products', activeCompany?.id] });
      showSuccess('Invoice created successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: InvoiceFormValues) => {
    // Check for missing COGS account on inventory items
    for (const [index, item] of values.items.entries()) {
      if (item.product_id) {
        const product = products?.find(p => p.id === item.product_id);
        if (product?.type === 'inventory' && !product.cogs_account_id) {
          const errorMessage = `Inventory item "${product.name}" is missing a COGS account. Please edit it in Products & Services.`;
          form.setError(`items.${index}.product_id`, { type: 'manual', message: errorMessage });
          showError(errorMessage);
          return; // Stop submission
        }
      }
    }

    const hasInventoryItem = values.items.some(item => {
        const product = products?.find(p => p.id === item.product_id);
        return product?.type === 'inventory';
    });

    if (hasInventoryItem && !values.inventory_asset_account_id) {
        form.setError("inventory_asset_account_id", {
            type: "manual",
            message: "An Inventory Asset account is required when selling inventory items.",
        });
        return;
    }
    mutation.mutate(values);
  };
  
  const hasInventoryItem = watchedValues.items.some(item => products?.find(p => p.id === item.product_id)?.type === 'inventory');

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Invoice' : 'New Invoice'}</DialogTitle>
            <DialogDescription>Fill out the details below to create a new invoice.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="invoice_number" render={({ field }) => (
                  <FormItem><FormLabel>Invoice #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customer_id" render={({ field }) => (
                  <FormItem><FormLabel>Customer</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl><SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="invoice_date" render={({ field }) => (
                  <FormItem><FormLabel>Invoice Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="due_date" render={({ field }) => (
                  <FormItem><FormLabel>Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (
                    <FormItem><FormLabel>Deposit To (A/R Account)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/R Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                {hasInventoryItem && (
                  <FormField control={form.control} name="inventory_asset_account_id" render={({ field }) => (<FormItem><FormLabel>Inventory Asset Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Inventory Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                )}
              </div>
              <div className="space-y-2 pt-4">
                <FormLabel>Line Items</FormLabel>
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
                      <div className="col-span-1 pt-2 text-right font-mono">{formatCurrency(lineTotal)}</div>
                      <FormField control={form.control} name={`items.${index}.income_account_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Income Account" /></SelectTrigger></FormControl><SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                      <div className="col-span-1 pt-2"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                    </div>
                  )
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '' })}>Add Line</Button>
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
            />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default InvoiceForm;