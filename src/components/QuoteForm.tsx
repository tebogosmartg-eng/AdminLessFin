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
import { Customer } from '../pages/Customers';
import { Product } from '../pages/Products';
import { TaxRate } from '../pages/TaxRates';
import { Account } from '../pages/ChartOfAccounts';
import { Trash2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import QuotePreview from './QuotePreview';
import { taxRatesQuery } from '../lib/queries';

const quoteItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(1, "Qty must be at least 1."),
  unit_price: z.coerce.number().min(0.01, "Price must be positive."),
  income_account_id: z.string().min(1, "Account is required."),
  tax_rate_id: z.string().optional(),
});

const quoteSchema = z.object({
  quote_number: z.string().min(1, "Quote number is required."),
  quote_date: z.string().min(1, "Date is required."),
  expiry_date: z.string().optional(),
  customer_id: z.string().min(1, "Customer is required."),
  description: z.string().optional(),
  items: z.array(quoteItemSchema).min(1, "At least one line item is required."),
});

type QuoteFormValues = z.infer<typeof quoteSchema>;

interface QuoteFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  quoteId?: string;
}

const QuoteForm = ({ isOpen, setIsOpen, quoteId }: QuoteFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!quoteId;
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      quote_number: '',
      quote_date: format(new Date(), 'yyyy-MM-dd'),
      expiry_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      customer_id: '',
      description: '',
      items: [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '', tax_rate_id: '' }],
    },
  });

  const watchedValues = form.watch();

  const { data: quoteToEdit } = useQuery({
    queryKey: ['quote_edit', quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('quotes', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, quoteId },
      });
      if (error) throw error;
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (isEditing && quoteToEdit) {
      form.reset({
        quote_number: quoteToEdit.quote_number,
        quote_date: quoteToEdit.quote_date,
        expiry_date: quoteToEdit.expiry_date || '',
        customer_id: quoteToEdit.customer_id,
        description: quoteToEdit.description || '',
        items: quoteToEdit.quote_items.map((item: any) => ({
          ...item,
          tax_rate_id: item.tax_rate_id || '',
        })),
      });
    }
  }, [quoteToEdit, isEditing, form]);

  const { data: nextQuoteNumber } = useQuery({
    queryKey: ['next_quote_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('quotes', {
        body: { method: 'GET_NEXT_QUOTE_NUMBER', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !isEditing && !!activeCompany,
  });

  useEffect(() => {
    if (nextQuoteNumber && !isEditing) {
      form.setValue('quote_number', nextQuoteNumber);
    }
  }, [nextQuoteNumber, isEditing, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useQuery<Customer[]>({ queryKey: ['customers', activeCompany?.id] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products', activeCompany?.id] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts', activeCompany?.id] });
  const { data: taxRates } = useQuery<TaxRate[]>({ ...taxRatesQuery(activeCompany?.id!), enabled: !!activeCompany });
  const incomeAccounts = accounts?.filter(a => a.type === 'Income');

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
    mutationFn: async (values: QuoteFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      
      const quoteData = {
        ...values,
        items: values.items.map(item => ({
          ...item,
          tax_rate_id: item.tax_rate_id || null,
        })),
      };

      const method = isEditing ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        quoteData,
        ...(isEditing && { quoteId: quoteId }),
      };

      const { error } = await supabase.functions.invoke('quotes', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', activeCompany?.id] });
      showSuccess(`Quote ${isEditing ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const onSubmit = (values: QuoteFormValues) => mutation.mutate(values);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Quote' : 'New Quote'}</DialogTitle>
            <DialogDescription>Fill out the details below to create a new quote.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="quote_number" render={({ field }) => (
                  <FormItem><FormLabel>Quote #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customer_id" render={({ field }) => (
                  <FormItem><FormLabel>Customer</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl><SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="quote_date" render={({ field }) => (
                  <FormItem><FormLabel>Quote Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="expiry_date" render={({ field }) => (
                  <FormItem><FormLabel>Expiry Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description / Memo (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Project proposal details" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-2 pt-4">
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
                      <FormField control={form.control} name={`items.${index}.tax_rate_id`} render={({ field }) => (<FormItem className="col-span-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="">None</SelectItem>{taxRates?.map(t => <SelectItem key={t.id} value={t.id}>{t.rate}%</SelectItem>)}</SelectContent></Select></FormItem>)} />
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
                <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Quote'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Sheet open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <SheetContent className="sm:max-w-3xl w-full">
            <SheetHeader>
                <SheetTitle>Quote Preview</SheetTitle>
                <SheetDescription>This is a preview of what your quote will look like.</SheetDescription>
            </SheetHeader>
            <QuotePreview
                formData={watchedValues}
                customers={customers}
                company={activeCompany}
                taxRates={taxRates}
            />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default QuoteForm;