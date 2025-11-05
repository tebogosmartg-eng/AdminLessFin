import { useEffect } from 'react';
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

const invoiceItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  income_account_id: z.string().min(1, "Income account is required."),
});

const invoiceSchema = z.object({
  invoice_number: z.string().min(1, "Invoice number is required."),
  invoice_date: z.string().min(1, "Date is required."),
  due_date: z.string().min(1, "Due date is required."),
  customer_id: z.string().min(1, "Customer is required."),
  accounts_receivable_id: z.string().min(1, "Accounts Receivable account is required."),
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!invoiceId;

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_number: '',
      invoice_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      customer_id: '',
      accounts_receivable_id: '',
      description: '',
      items: [{ product_id: '', description: '', amount: 0, income_account_id: '' }],
    },
  });

  // Note: Editing logic is complex and has been omitted for this initial implementation.
  // This form currently only supports creating new invoices.

  const { data: nextInvoiceNumber } = useQuery({
    queryKey: ['next_invoice_number'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_next_invoice_number_for_user');
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !isEditing,
  });

  useEffect(() => {
    if (nextInvoiceNumber) {
      form.setValue('invoice_number', nextInvoiceNumber);
    }
  }, [nextInvoiceNumber, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useQuery<Customer[]>({ queryKey: ['customers'] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products'] });
  const { data: incomeAccounts } = useQuery<Account[]>({ queryKey: ['income_accounts'], queryFn: async () => {
    const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Income');
    if (error) throw error;
    return data;
  }});
  const { data: arAccounts } = useQuery<Account[]>({ queryKey: ['ar_accounts'], queryFn: async () => {
    const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Asset');
    if (error) throw error;
    return data;
  }});

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.amount`, product.price || 0);
      if (product.income_account_id) {
        form.setValue(`items.${index}.income_account_id`, product.income_account_id);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const totalAmount = values.items.reduce((sum, item) => sum + item.amount, 0);
      const description = values.description || `Invoice ${values.invoice_number}`;

      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({ user_id: user.id, entry_date: values.invoice_date, description, customer_id: values.customer_id })
        .select('id').single();
      if (entryError) throw entryError;

      const journalItems = [
        { journal_entry_id: entry.id, account_id: values.accounts_receivable_id, type: 'debit', amount: totalAmount },
        ...values.items.map(item => ({ journal_entry_id: entry.id, account_id: item.income_account_id, type: 'credit', amount: item.amount })),
      ];
      const { error: itemsError } = await supabase.from('journal_entry_items').insert(journalItems);
      if (itemsError) throw itemsError;

      const { error: invoiceError } = await supabase
        .from('invoices')
        .insert({ user_id: user.id, customer_id: values.customer_id, journal_entry_id: entry.id, invoice_number: values.invoice_number, invoice_date: values.invoice_date, due_date: values.due_date });
      if (invoiceError) throw invoiceError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Invoice created successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: InvoiceFormValues) => mutation.mutate(values);

  return (
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
            <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (
                <FormItem><FormLabel>Deposit To (A/R Account)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/R Account" /></SelectTrigger></FormControl><SelectContent>{arAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <div className="space-y-2 pt-4">
              <FormLabel>Line Items</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (
                    <FormItem className="col-span-12 sm:col-span-4"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                    <FormItem className="col-span-12 sm:col-span-3"><FormControl><Textarea placeholder="Description" {...field} rows={1} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.amount`} render={({ field }) => (
                    <FormItem className="col-span-6 sm:col-span-2"><FormControl><Input type="number" step="0.01" placeholder="Amount" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.income_account_id`} render={({ field }) => (
                    <FormItem className="col-span-6 sm:col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Income Account" /></SelectTrigger></FormControl><SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>
                  )} />
                  <div className="col-span-12 sm:col-span-1 pt-2"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', description: '', amount: 0, income_account_id: '' })}>Add Line</Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Invoice'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceForm;