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
import { formatCurrency } from '../lib/utils';

const saleItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(1, "Qty must be at least 1."),
  unit_price: z.coerce.number().min(0.01, "Price must be positive."),
  income_account_id: z.string().min(1, "Income account is required."),
});

const saleSchema = z.object({
  entry_date: z.string().min(1, "Date is required."),
  customer_id: z.string().min(1, "Customer is required."),
  accounts_receivable_id: z.string().min(1, "Accounts Receivable account is required."),
  inventory_asset_account_id: z.string().optional(),
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
      inventory_asset_account_id: '',
      description: '',
      items: [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '' }],
    },
  });

  useEffect(() => {
    if (!isOpen) {
      form.reset({
        entry_date: new Date().toISOString().split('T')[0],
        customer_id: '',
        accounts_receivable_id: '',
        inventory_asset_account_id: '',
        description: '',
        items: [{ product_id: '', description: '', quantity: 1, unit_price: 0, income_account_id: '' }],
      });
    }
  }, [isOpen, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useQuery<Customer[]>({ queryKey: ['customers'] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products'] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts'] });
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
    mutationFn: async (values: SaleFormValues) => {
      if (!user) throw new Error('User not authenticated');
      const description = values.description || `Sale to ${customers?.find(c => c.id === values.customer_id)?.name}`;
      
      const soldProductIds = values.items.map(i => i.product_id).filter(Boolean);
      if (soldProductIds.length > 0) {
        const soldInventoryItems = products?.filter(p => soldProductIds.includes(p.id) && p.type === 'inventory');
        if (soldInventoryItems && soldInventoryItems.length > 0 && !values.inventory_asset_account_id) {
            throw new Error("An Inventory Asset account must be selected when selling inventory items.");
        }
      }

      const { error } = await supabase.rpc('record_sale_with_inventory', {
        p_user_id: user.id,
        p_customer_id: values.customer_id,
        p_sale_date: values.entry_date,
        p_ar_account_id: values.accounts_receivable_id,
        p_inventory_asset_account_id: values.inventory_asset_account_id || null,
        p_description: description,
        p_items: values.items.map(item => ({...item, product_id: item.product_id || null}))
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      showSuccess('Sale recorded and inventory updated.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: SaleFormValues) => mutation.mutate(values);

  const watchedItems = form.watch('items');
  const hasInventoryItem = watchedItems.some(item => products?.find(p => p.id === item.product_id)?.type === 'inventory');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Record New Sale</DialogTitle>
          <DialogDescription>This will create a journal entry for the sale and update inventory levels.</DialogDescription>
        </DialogHeader>
        {!assetAccounts?.some(acc => acc.name.toLowerCase().includes('accounts receivable')) && (
            <Alert variant="destructive"><AlertDescription>Warning: You don't have an "Accounts Receivable" account. Please create one in your Chart of Accounts (Type: Asset).</AlertDescription></Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <FormField control={form.control} name="entry_date" render={({ field }) => (<FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="customer_id" render={({ field }) => (<FormItem><FormLabel>Customer</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl><SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (<FormItem><FormLabel>Accounts Receivable</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/R Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            {hasInventoryItem && (
              <FormField control={form.control} name="inventory_asset_account_id" render={({ field }) => (<FormItem><FormLabel>Inventory Asset Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Inventory Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            )}
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Memo (Optional)</FormLabel><FormControl><Textarea placeholder="A brief description of the sale" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="space-y-2">
              <FormLabel>Products/Services Sold</FormLabel>
              {fields.map((field, index) => {
                const quantity = form.watch(`items.${index}.quantity`);
                const unitPrice = form.watch(`items.${index}.unit_price`);
                const lineTotal = quantity * unitPrice;
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-3"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
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