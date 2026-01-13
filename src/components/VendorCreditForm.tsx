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
import { Vendor } from '../pages/Vendors';
import { Product } from '../pages/Products';
import { Account } from '../pages/ChartOfAccounts';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

const itemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(1, "Qty must be positive."),
  unit_price: z.coerce.number().min(0, "Price must be non-negative."),
  account_id: z.string().min(1, "Account is required."),
});

const schema = z.object({
  credit_number: z.string().min(1, "Number is required."),
  credit_date: z.string().min(1, "Date is required."),
  vendor_id: z.string().min(1, "Vendor is required."),
  ap_account_id: z.string().min(1, "AP account is required."),
  reason: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required."),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const VendorCreditForm = ({ isOpen, setIsOpen }: Props) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      credit_number: '',
      credit_date: format(new Date(), 'yyyy-MM-dd'),
      vendor_id: '',
      reason: '',
      items: [{ description: '', quantity: 1, unit_price: 0, account_id: '' }],
    },
  });

  const { data: nextNumber } = useQuery({
    queryKey: ['next_vcn_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'GET_NEXT_NUMBER', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (nextNumber) {
      form.setValue('credit_number', nextNumber);
    }
  }, [nextNumber, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ['vendors', activeCompany?.id] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products', activeCompany?.id] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts', activeCompany?.id] });

  const expenseAccounts = accounts?.filter(a => a.type === 'Expense' || a.type === 'Asset'); // Credit Expense (refund) or Asset (return inventory)
  const apAccounts = accounts?.filter(a => a.type === 'Liability'); // For AP

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.unit_price`, product.cost || 0); // Use Cost for vendor credits
      // Default to COGS or Inventory Asset if available
      if (product.cogs_account_id) {
        form.setValue(`items.${index}.account_id`, product.cogs_account_id);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany) throw new Error('No active company');
      
      const { error } = await supabase.functions.invoke('vendor-credits', {
        body: {
          method: 'CREATE',
          company_id: activeCompany.id,
          creditData: values,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor_credits'] });
      queryClient.invalidateQueries({ queryKey: ['vendor_ap_balances'] });
      showSuccess('Vendor Credit created successfully.');
      setIsOpen(false);
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const items = form.watch('items');
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create Vendor Credit</DialogTitle>
          <DialogDescription>Record a refund or return to a vendor.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField control={form.control} name="credit_number" render={({ field }) => (<FormItem><FormLabel>Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="credit_date" render={({ field }) => (<FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="ap_account_id" render={({ field }) => (<FormItem><FormLabel>Debit A/P</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="A/P Account" /></SelectTrigger></FormControl><SelectContent>{apAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>Reason</FormLabel><FormControl><Input placeholder="e.g. Returned damaged goods" {...field} /></FormControl><FormMessage /></FormItem>)} />
            
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-3">Item</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">Cost</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-3">Account (Credit)</div>
              </div>
              {fields.map((field, index) => {
                const quantity = form.watch(`items.${index}.quantity`);
                const unitPrice = form.watch(`items.${index}.unit_price`);
                const lineTotal = quantity * unitPrice;
                
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-3"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-3"><FormControl><Input placeholder="Desc" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" placeholder="Qty" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.unit_price`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" step="0.01" placeholder="Cost" {...field} /></FormControl></FormItem>)} />
                    <div className="col-span-1 pt-2 text-right font-mono text-xs">{formatCurrency(lineTotal)}</div>
                    <FormField control={form.control} name={`items.${index}.account_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Acc" /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <div className="col-span-1 pt-1 flex justify-end"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                )
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unit_price: 0, account_id: '' })}>Add Line</Button>
            </div>

            <div className="flex justify-end pt-2 border-t">
               <span className="text-lg font-bold">Total Debit: {formatCurrency(totalAmount)}</span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Create Vendor Credit'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default VendorCreditForm;