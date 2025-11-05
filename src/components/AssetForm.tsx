import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Account } from '../pages/ChartOfAccounts';
import { Employee } from '../pages/Employees';

const assetSchema = z.object({
  asset_code: z.string().min(1, 'Asset code is required.'),
  description: z.string().min(1, 'Description is required.'),
  category_id: z.string().min(1, 'Category is required.'),
  purchase_date: z.string().min(1, 'Purchase date is required.'),
  purchase_cost: z.coerce.number().min(0.01, 'Cost must be positive.'),
  vendor_id: z.string().optional(),
  location: z.string().optional(),
  assigned_to_employee_id: z.string().optional(),
  serial_number: z.string().optional(),
  asset_account_id: z.string().min(1, 'Asset account is required.'),
  payment_account_id: z.string().min(1, 'Payment account is required.'),
  depreciation_method: z.enum(['straight-line', 'reducing-balance']).optional(),
  useful_life_years: z.coerce.number().int().min(1).optional(),
  residual_value: z.coerce.number().min(0).optional(),
  accumulated_depreciation_account_id: z.string().optional(),
  depreciation_expense_account_id: z.string().optional(),
});

type AssetFormValues = z.infer<typeof assetSchema>;

interface AssetFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  assetId?: string;
}

const AssetForm = ({ isOpen, setIsOpen, assetId }: AssetFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!assetId;

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      purchase_date: new Date().toISOString().split('T')[0],
      residual_value: 0,
    },
  });

  useEffect(() => {
    if (!isOpen) form.reset({ purchase_date: new Date().toISOString().split('T')[0], residual_value: 0 });
  }, [isOpen, form]);

  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ['vendors'] });
  const { data: employees } = useQuery<Employee[]>({ queryKey: ['employees'] });
  const { data: categories } = useQuery<{id: string, name: string}[]>({ queryKey: ['asset_categories'] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts'] });
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');
  const expenseAccounts = accounts?.filter(a => a.type === 'Expense');
  const paymentAccounts = [...(assetAccounts || []), ...(liabilityAccounts || [])];

  const mutation = useMutation({
    mutationFn: async (values: AssetFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const { payment_account_id, ...assetData } = values;

      const { data: asset, error: assetError } = await supabase
        .from('fixed_assets')
        .insert({ ...assetData, user_id: user.id })
        .select('id')
        .single();
      if (assetError) throw assetError;

      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
        user_id: user.id,
        entry_date: values.purchase_date,
        description: `Acquisition of asset: ${values.description}`,
        vendor_id: values.vendor_id || null,
      }).select('id').single();

      if (entryError) throw entryError;

      const { error: itemsError } = await supabase.from('journal_entry_items').insert([
        { journal_entry_id: entry.id, account_id: values.asset_account_id, type: 'debit', amount: values.purchase_cost },
        { journal_entry_id: entry.id, account_id: payment_account_id, type: 'credit', amount: values.purchase_cost },
      ]);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess(`Asset ${isEditing ? 'updated' : 'acquired'} successfully.`);
      setIsOpen(false);
    },
    onError: (error: any) => showError(error.message),
  });

  const onSubmit = (values: AssetFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Asset' : 'Acquire New Asset'}</DialogTitle>
          <DialogDescription>Enter the details for the asset below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-6">
            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Asset Details</legend>
              <FormField control={form.control} name="asset_code" render={({ field }) => (<FormItem><FormLabel>Asset Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="description" render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="category_id" render={({ field }) => (<FormItem><FormLabel>Category</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="location" render={({ field }) => (<FormItem><FormLabel>Location</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="serial_number" render={({ field }) => (<FormItem><FormLabel>Serial Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="assigned_to_employee_id" render={({ field }) => (<FormItem><FormLabel>Assigned To</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{employees?.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </fieldset>

            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Acquisition & Accounting</legend>
              <FormField control={form.control} name="purchase_date" render={({ field }) => (<FormItem><FormLabel>Purchase Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="purchase_cost" render={({ field }) => (<FormItem><FormLabel>Purchase Cost</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="asset_account_id" render={({ field }) => (<FormItem><FormLabel>Asset Account (Debit)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="payment_account_id" render={({ field }) => (<FormItem><FormLabel>Paid From (Credit)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Bank or A/P..." /></SelectTrigger></FormControl><SelectContent>{paymentAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </fieldset>

            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Depreciation Details (Optional)</legend>
              <FormField control={form.control} name="depreciation_method" render={({ field }) => (<FormItem><FormLabel>Method</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="straight-line">Straight-Line</SelectItem><SelectItem value="reducing-balance">Reducing Balance</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="useful_life_years" render={({ field }) => (<FormItem><FormLabel>Useful Life (Years)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="residual_value" render={({ field }) => (<FormItem><FormLabel>Residual Value</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accumulated_depreciation_account_id" render={({ field }) => (<FormItem><FormLabel>Accum. Depr. Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="depreciation_expense_account_id" render={({ field }) => (<FormItem><FormLabel>Depr. Expense Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </fieldset>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Asset'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AssetForm;