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
import { Vendor } from '../pages/Vendors';
import { Product } from '../pages/Products';
import { Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { addDays, format } from 'date-fns';

const billItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  expense_account_id: z.string().min(1, "Expense account is required."),
});

const billSchema = z.object({
  bill_date: z.string().min(1, "Date is required."),
  due_date: z.string().min(1, "Due date is required."),
  vendor_id: z.string().min(1, "Vendor is required."),
  accounts_payable_id: z.string().min(1, "Accounts Payable account is required."),
  description: z.string().optional(),
  items: z.array(billItemSchema).min(1, "At least one line item is required."),
});

type BillFormValues = z.infer<typeof billSchema>;

interface BillFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const BillForm = ({ isOpen, setIsOpen }: BillFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<BillFormValues>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      bill_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      vendor_id: '',
      accounts_payable_id: '',
      description: '',
      items: [{ product_id: '', description: '', amount: 0, expense_account_id: '' }],
    },
  });

  useEffect(() => {
    if (!isOpen) {
      form.reset({
        bill_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        vendor_id: '',
        accounts_payable_id: '',
        description: '',
        items: [{ product_id: '', description: '', amount: 0, expense_account_id: '' }],
      });
    }
  }, [isOpen, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ['vendors'] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products'] });
  const { data: expenseAccounts } = useQuery<Account[]>({
    queryKey: ['expense_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Expense');
      if (error) throw error;
      return data;
    }
  });
  const { data: apAccounts } = useQuery<Account[]>({
    queryKey: ['ap_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('type', 'Liability');
      if (error) throw error;
      return data;
    }
  });

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.amount`, product.price || 0);
      if (product.expense_account_id) {
        form.setValue(`items.${index}.expense_account_id`, product.expense_account_id);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: BillFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const totalAmount = values.items.reduce((sum, item) => sum + item.amount, 0);
      const description = values.description || `Bill from ${vendors?.find(v => v.id === values.vendor_id)?.name}`;

      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: user.id,
          entry_date: values.bill_date,
          description,
          vendor_id: values.vendor_id,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const journalItems = [
        { journal_entry_id: entry.id, account_id: values.accounts_payable_id, type: 'credit', amount: totalAmount },
        ...values.items.map(item => ({
          journal_entry_id: entry.id,
          account_id: item.expense_account_id,
          type: 'debit',
          amount: item.amount,
        })),
      ];

      const { error: itemsError } = await supabase.from('journal_entry_items').insert(journalItems);
      if (itemsError) throw itemsError;

      const { error: billError } = await supabase.from('bills').insert({
        user_id: user.id,
        vendor_id: values.vendor_id,
        journal_entry_id: entry.id,
        bill_date: values.bill_date,
        due_date: values.due_date,
        status: 'open',
      });
      if (billError) throw billError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Bill recorded successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: BillFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record New Bill</DialogTitle>
          <DialogDescription>This will create a new bill and its corresponding journal entry.</DialogDescription>
        </DialogHeader>
        {!apAccounts?.some(acc => acc.name.toLowerCase().includes('accounts payable')) && (
            <Alert variant="destructive">
                <AlertDescription>
                Warning: You don't have an "Accounts Payable" account. Please create one in your Chart of Accounts (Type: Liability) to track money owed to vendors.
                </AlertDescription>
            </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField control={form.control} name="vendor_id" render={({ field }) => (
                <FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="bill_date" render={({ field }) => (
                <FormItem><FormLabel>Bill Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="due_date" render={({ field }) => (
                <FormItem><FormLabel>Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="accounts_payable_id" render={({ field }) => (
                <FormItem><FormLabel>Credit A/P</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/P Account" /></SelectTrigger></FormControl><SelectContent>{apAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Memo (Optional)</FormLabel><FormControl><Textarea placeholder="A brief description of the bill" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="space-y-2">
              <FormLabel>Expenses</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (
                    <FormItem className="col-span-4"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                    <FormItem className="col-span-3"><FormControl><Textarea placeholder="Description" {...field} rows={1} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.amount`} render={({ field }) => (
                    <FormItem className="col-span-2"><FormControl><Input type="number" step="0.01" placeholder="Amount" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.expense_account_id`} render={({ field }) => (
                    <FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Expense Account" /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>
                  )} />
                  <div className="col-span-1 pt-2"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', description: '', amount: 0, expense_account_id: '' })}>Add Line</Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Record Bill'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BillForm;