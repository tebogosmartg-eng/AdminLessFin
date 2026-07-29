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
import { Customer } from '../pages/Customers';
import { Product } from '../pages/Products';
import { Account } from '../pages/ChartOfAccounts';
import { TaxRate } from '../pages/TaxRates';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { taxRatesQuery, accountsQuery, customersQuery, productsQuery } from '../lib/queries';

const itemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(1, "Qty must be positive."),
  unit_price: z.coerce.number().min(0, "Price must be non-negative."),
  account_id: z.string().min(1, "Account is required."),
  tax_rate_id: z.string().optional(),
});

const schema = z.object({
  credit_note_number: z.string().min(1, "Number is required."),
  credit_note_date: z.string().min(1, "Date is required."),
  customer_id: z.string().min(1, "Customer is required."),
  ar_account_id: z.string().min(1, "A/R account is required."),
  tax_account_id: z.string().optional(),
  reason: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required."),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const CreditNoteForm = ({ isOpen, setIsOpen }: Props) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      credit_note_number: '',
      credit_note_date: format(new Date(), 'yyyy-MM-dd'),
      customer_id: '',
      reason: '',
      items: [{ description: '', quantity: 1, unit_price: 0, account_id: '', tax_rate_id: '' }],
    },
  });

  const { data: nextNumber } = useQuery({
    queryKey: ['next_cn_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'GET_NEXT_NUMBER', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (nextNumber) {
      form.setValue('credit_note_number', nextNumber);
    }
  }, [nextNumber, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useQuery<Customer[]>({ ...customersQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: products } = useQuery<Product[]>({ ...productsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: taxRates } = useQuery<TaxRate[]>({ ...taxRatesQuery(activeCompany!.id), enabled: !!activeCompany });

  const incomeAccounts = accounts?.filter(a => a.type === 'Income');
  const assetAccounts = accounts?.filter(a => a.type === 'Asset'); // For A/R
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability'); // For Tax

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.unit_price`, product.price || 0);
      if (product.income_account_id) {
        form.setValue(`items.${index}.account_id`, product.income_account_id);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany) throw new Error('No active company');
      
      const items = values.items.map(item => ({
        ...item,
        tax_rate_id: (item.tax_rate_id === 'none' || !item.tax_rate_id) ? null : item.tax_rate_id,
      }));

      const { error } = await supabase.functions.invoke('credit-notes', {
        body: {
          method: 'CREATE',
          company_id: activeCompany.id,
          creditNoteData: { ...values, items },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit_notes'] });
      queryClient.invalidateQueries({ queryKey: ['customer_ar_balances'] });
      showSuccess('Credit Note created successfully.');
      setIsOpen(false);
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const items = form.watch('items');
  const totalAmount = items.reduce((sum, item) => {
      const sub = (item.quantity || 0) * (item.unit_price || 0);
      const rate = taxRates?.find(t => t.id === item.tax_rate_id)?.rate || 0;
      return sum + sub * (1 + rate/100);
  }, 0);

  const hasTax = items.some(item => item.tax_rate_id && item.tax_rate_id !== 'none');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create Credit Note</DialogTitle>
          <DialogDescription>Refund or credit a customer account.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField control={form.control} name="credit_note_number" render={({ field }) => (<FormItem><FormLabel>Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="customer_id" render={({ field }) => (<FormItem><FormLabel>Customer</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="credit_note_date" render={({ field }) => (<FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="ar_account_id" render={({ field }) => (<FormItem><FormLabel>Credit A/R</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="A/R Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            {hasTax && (
              <FormField control={form.control} name="tax_account_id" render={({ field }) => (<FormItem><FormLabel>Tax Account (Debit)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Tax Liability Account" /></SelectTrigger></FormControl><SelectContent>{liabilityAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            )}
            <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>Reason</FormLabel><FormControl><Input placeholder="e.g. Return of goods" {...field} /></FormControl><FormMessage /></FormItem>)} />
            
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-3">Item</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">Price</div>
                <div className="col-span-1">Tax</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-2">Account (Debit)</div>
              </div>
              {fields.map((field, index) => {
                const quantity = form.watch(`items.${index}.quantity`);
                const unitPrice = form.watch(`items.${index}.unit_price`);
                const taxRateId = form.watch(`items.${index}.tax_rate_id`);
                const rate = taxRates?.find(t => t.id === taxRateId)?.rate || 0;
                const lineTotal = (quantity * unitPrice) * (1 + rate/100);
                
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-3"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-3"><FormControl><Input placeholder="Desc" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" placeholder="Qty" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.unit_price`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" step="0.01" placeholder="Price" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.tax_rate_id`} render={({ field }) => (<FormItem className="col-span-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{taxRates?.map(t => <SelectItem key={t.id} value={t.id}>{t.rate}%</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <div className="col-span-1 pt-2 text-right font-mono text-xs">{formatCurrency(lineTotal)}</div>
                    <FormField control={form.control} name={`items.${index}.account_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Acc" /></SelectTrigger></FormControl><SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <div className="col-span-12 md:col-span-12 pt-1 flex justify-end"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                )
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unit_price: 0, account_id: '', tax_rate_id: '' })}>Add Line</Button>
            </div>

            <div className="flex justify-end pt-2 border-t">
               <span className="text-lg font-bold">Total Credit: {formatCurrency(totalAmount)}</span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Create Credit Note'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreditNoteForm;