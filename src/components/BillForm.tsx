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
import { Project } from '../pages/Projects';
import { Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { addDays, format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { projectsQuery } from '../lib/queries';

const billItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(1, "Qty must be at least 1."),
  unit_cost: z.coerce.number().min(0.01, "Cost must be positive."),
  expense_account_id: z.string().min(1, "Account is required."),
  project_id: z.string().optional(),
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
  initialData?: Partial<BillFormValues>;
  onSuccess?: () => void;
}

const BillForm = ({ isOpen, setIsOpen, initialData, onSuccess }: BillFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<BillFormValues>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      bill_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      vendor_id: '',
      accounts_payable_id: '',
      description: '',
      items: [{ product_id: '', description: '', quantity: 1, unit_cost: 0, expense_account_id: '', project_id: '' }],
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        form.reset({
          bill_date: initialData.bill_date || format(new Date(), 'yyyy-MM-dd'),
          due_date: initialData.due_date || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
          vendor_id: initialData.vendor_id || '',
          accounts_payable_id: initialData.accounts_payable_id || '',
          description: initialData.description || '',
          items: initialData.items || [{ product_id: '', description: '', quantity: 1, unit_cost: 0, expense_account_id: '', project_id: '' }],
        });
      } else {
        form.reset({
          bill_date: format(new Date(), 'yyyy-MM-dd'),
          due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
          vendor_id: '',
          accounts_payable_id: '',
          description: '',
          items: [{ product_id: '', description: '', quantity: 1, unit_cost: 0, expense_account_id: '', project_id: '' }],
        });
      }
    }
  }, [isOpen, initialData, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ['vendors', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('vendors', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });
  const { data: products } = useQuery<Product[]>({
    queryKey: ['products', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('products', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany
  });
  const { data: projects } = useQuery<Project[]>({ ...projectsQuery(activeCompany?.id!), enabled: !!activeCompany });

  const expenseAccounts = accounts?.filter(a => a.type === 'Expense');
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const apAccounts = accounts?.filter(a => a.type === 'Liability');

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.unit_cost`, product.cost || 0);
      if (product.type === 'inventory') {
        const inventoryAssetAccount = assetAccounts?.find(a => a.name.toLowerCase().includes('inventory'));
        if (inventoryAssetAccount) {
          form.setValue(`items.${index}.expense_account_id`, inventoryAssetAccount.id);
        }
      } else if (product.cogs_account_id) {
        form.setValue(`items.${index}.expense_account_id`, product.cogs_account_id);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: BillFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');

      const p_items = values.items.map(item => ({
        product_id: item.product_id || null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        expense_account_id: item.expense_account_id,
        project_id: item.project_id || null,
      }));

      const billData = {
        vendor_id: values.vendor_id,
        bill_date: values.bill_date,
        due_date: values.due_date,
        accounts_payable_id: values.accounts_payable_id,
        description: values.description || `Bill from ${vendors?.find(v => v.id === values.vendor_id)?.name}`,
        p_items: p_items,
      };

      const { error } = await supabase.functions.invoke('bills', {
        body: {
          method: 'POST',
          company_id: activeCompany.id,
          billData: billData,
        },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['products', activeCompany?.id] });
      showSuccess('Bill recorded and inventory updated.');
      if (onSuccess) onSuccess();
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: BillFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Record New Bill</DialogTitle>
          <DialogDescription>This will create a new bill and update inventory levels for stock items.</DialogDescription>
        </DialogHeader>
        {!apAccounts?.some(acc => acc.name.toLowerCase().includes('accounts payable')) && (
            <Alert variant="destructive"><AlertDescription>Warning: You don't have an "Accounts Payable" account. Please create one in your Chart of Accounts (Type: Liability).</AlertDescription></Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="bill_date" render={({ field }) => (<FormItem><FormLabel>Bill Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="due_date" render={({ field }) => (<FormItem><FormLabel>Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accounts_payable_id" render={({ field }) => (<FormItem><FormLabel>Credit A/P</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/P Account" /></SelectTrigger></FormControl><SelectContent>{apAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Memo (Optional)</FormLabel><FormControl><Textarea placeholder="A brief description of the bill" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-2">Item</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">Cost</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-2">Account</div>
                <div className="col-span-2">Project</div>
              </div>
              {fields.map((field, index) => {
                const quantity = form.watch(`items.${index}.quantity`);
                const unitCost = form.watch(`items.${index}.unit_cost`);
                const lineTotal = quantity * unitCost;
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={(value) => { field.onChange(value); handleProductSelect(value, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-3"><FormControl><Textarea placeholder="Description" {...field} rows={1} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" placeholder="Qty" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.unit_cost`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" step="0.01" placeholder="Cost" {...field} /></FormControl></FormItem>)} />
                    <div className="col-span-1 pt-2 text-right font-mono">{formatCurrency(lineTotal)}</div>
                    <FormField control={form.control} name={`items.${index}.expense_account_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger></FormControl><SelectContent>{[...(expenseAccounts || []), ...(assetAccounts || [])].map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.project_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="">None</SelectItem>{projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <div className="col-span-12 md:col-span-1 pt-2 flex justify-end md:justify-start"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                )
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: '', description: '', quantity: 1, unit_cost: 0, expense_account_id: '', project_id: '' })}>Add Line</Button>
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