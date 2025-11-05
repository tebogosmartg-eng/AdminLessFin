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
import { Alert, AlertDescription } from './ui/alert';

const saleItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  income_account_id: z.string().min(1, "Income account is required."),
});

const saleSchema = z.object({
  entry_date: z.string().min(1, "Date is required."),
  customer_id: z.string().min(1, "Customer is required."),
  accounts_receivable_id: z.string().min(1, "Accounts Receivable account is required."),
  description: z.string().optional(),
  items: z.array(saleItemSchema).min(1, "At least one line item is required."),
});

type SaleFormValues = z.infer<typeof saleSchema>;

interface SaleFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const SaleForm = ({ isOpen, setIsOpen }: SaleFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      entry_date: new Date().toISOString().split('T')[0],
      customer_id: '',
      accounts_receivable_id: '',
      description: '',
      items: [{ description: '', amount: 0, income_account_id: '' }],
    },
  });

  useEffect(() => {
    if (!isOpen) {
      form.reset({
        entry_date: new Date().toISOString().split('T')[0],
        customer_id: '',
        accounts_receivable_id: '',
        description: '',
        items: [{ description: '', amount: 0, income_account_id: '' }],
      });
    }
  }, [isOpen, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useQuery<Customer[]>({ queryKey: ['customers'] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products'] });
  const { data: incomeAccounts } = useQuery<Account[]>({
    queryKey: ['income_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Income');
      if (error) throw error;
      return data;
    }
  });
  const { data: arAccounts } = useQuery<Account[]>({
    queryKey: ['ar_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Asset');
      if (error) throw error;
      return data;
    }
  });

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
    mutationFn: async (values: SaleFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const totalAmount = values.items.reduce((sum, item) => sum + item.amount, 0);
      const description = values.description || `Sale to ${customers?.find(c => c.id === values.customer_id)?.name}`;

      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: user.id,
          entry_date: values.entry_date,
          description,
          customer_id: values.customer_id,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const journalItems = [
        // Debit Accounts Receivable
        {
          journal_entry_id: entry.id,
          account_id: values.accounts_receivable_id,
          type: 'debit',
          amount: totalAmount,
        },
        // Credit each income account
        ...values.items.map(item => ({
          journal_entry_id: entry.id,
          account_id: item.income_account_id,
          type: 'credit',
          amount: item.amount,
        })),
      ];

      const { error: itemsError } = await supabase.from('journal_entry_items').insert(journalItems);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Sale recorded successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: SaleFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record New Sale</DialogTitle>
          <DialogDescription>This will create a new journal entry for the sale.</DialogDescription>
        </DialogHeader>
        {!arAccounts?.some(acc => acc.name.toLowerCase().includes('accounts receivable')) && (
            <Alert variant="destructive">
                <AlertDescription>
                Warning: You don't have an "Accounts Receivable" account. Please create one in your Chart of Accounts (Type: Asset) to track money owed by customers.
                </AlertDescription>
            </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="entry_date" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="customer_id" render={({ field }) => (
                <FormItem><FormLabel>Customer</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl><SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (
                <FormItem><FormLabel>Deposit To</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/R Account" /></SelectTrigger></FormControl><SelectContent>{arAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Memo (Optional)</FormLabel><FormControl><Textarea placeholder="A brief description of the sale" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="space-y-2">
              <FormLabel>Products/Services Sold</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (
                    <FormItem className="col-span-4"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                    <FormItem className="col-span-3"><FormControl><Textarea placeholder="Description" {...field} rows={1} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.amount`} render={({ field }) => (
                    <FormItem className="col-span-2"><FormControl><Input type="number" step="0.01" placeholder="Amount" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.income_account_id`} render={({ field }) => (
                    <FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Income Account" /></SelectTrigger></FormControl><SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                  )} />
                  <div className="col-span-1 pt-2"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', description: '', amount: 0, income_account_id: '' })}>Add Line</Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Record Sale'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default SaleForm;