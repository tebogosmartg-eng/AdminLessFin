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
import { showError, showSuccess } from '../utils/toast';
import { Vendor } from '../pages/Vendors';
import { Product } from '../pages/Products';
import { Account } from '../pages/ChartOfAccounts';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const itemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(0.01, "Qty must be positive."),
  unit_cost: z.coerce.number().min(0, "Cost must be non-negative."),
  expense_account_id: z.string().min(1, "Account is required."),
});

const schema = z.object({
  profile_name: z.string().min(1, "Profile name is required."),
  vendor_id: z.string().min(1, "Vendor is required."),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  start_date: z.string().min(1, "Start date is required."),
  end_date: z.string().optional(),
  status: z.enum(['active', 'paused', 'completed']),
  items: z.array(itemSchema).min(1, "At least one item is required."),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  billId?: string;
}

const RecurringBillForm = ({ isOpen, setIsOpen, billId }: Props) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!billId;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      profile_name: '',
      vendor_id: '',
      frequency: 'monthly',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      status: 'active',
      items: [{ description: '', quantity: 1, unit_cost: 0, expense_account_id: '' }],
    },
  });

  const { data: existingData } = useQuery({
    queryKey: ['recurring_bill_edit', billId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('recurring-bills', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, id: billId },
      });
      if (error) throw error;
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (isEditing && existingData) {
      form.reset({
        profile_name: existingData.profile_name,
        vendor_id: existingData.vendor_id,
        frequency: existingData.frequency,
        start_date: existingData.start_date,
        end_date: existingData.end_date || '',
        status: existingData.status,
        items: existingData.recurring_bill_items.map((i: any) => ({
          product_id: i.product_id || undefined,
          description: i.description,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          expense_account_id: i.expense_account_id,
        })),
      });
    } else if (!isEditing) {
      form.reset({
        profile_name: '',
        vendor_id: '',
        frequency: 'monthly',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'active',
        items: [{ description: '', quantity: 1, unit_cost: 0, expense_account_id: '' }],
      });
    }
  }, [existingData, isEditing, isOpen, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ['vendors', activeCompany?.id] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products', activeCompany?.id] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts', activeCompany?.id] });
  
  const expenseAccounts = accounts?.filter(a => a.type === 'Expense' || a.type === 'Asset'); // Allow assets for inventory purchases

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.unit_cost`, product.cost || 0);
      if (product.cogs_account_id) {
        form.setValue(`items.${index}.expense_account_id`, product.cogs_account_id);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const method = isEditing ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        id: billId,
        data: values,
      };
      const { error } = await supabase.functions.invoke('recurring-bills', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_bills', activeCompany?.id] });
      showSuccess(`Recurring bill ${isEditing ? 'updated' : 'created'}.`);
      setIsOpen(false);
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Template' : 'New Recurring Bill'}</DialogTitle>
          <DialogDescription>Automate bill creation for regular expenses.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="profile_name" render={({ field }) => (<FormItem><FormLabel>Profile Name</FormLabel><FormControl><Input placeholder="e.g. Monthly Rent" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="frequency" render={({ field }) => (<FormItem><FormLabel>Frequency</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="start_date" render={({ field }) => (<FormItem><FormLabel>Next Run Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="end_date" render={({ field }) => (<FormItem><FormLabel>End Date (Opt)</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="space-y-2 pt-4">
              <FormLabel>Items</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-3"><Select onValueChange={(v) => { field.onChange(v); handleProductSelect(v, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-3"><FormControl><Input placeholder="Desc" {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" placeholder="Qty" {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.unit_cost`} render={({ field }) => (<FormItem className="col-span-2"><FormControl><Input type="number" step="0.01" placeholder="Cost" {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.expense_account_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Acc" /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                  <div className="col-span-1 pt-1"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unit_cost: 0, expense_account_id: '' })}>Add Line</Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Template'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RecurringBillForm;