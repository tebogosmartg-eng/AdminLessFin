"use client";

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Product } from '../pages/Products';
import { Account } from '../pages/ChartOfAccounts';
import { format } from 'date-fns';

const adjustmentSchema = z.object({
  new_quantity: z.coerce.number().int(),
  inventory_account_id: z.string().min(1, "Inventory Asset account is required."),
  adjustment_account_id: z.string().min(1, "Adjustment account is required."),
  reason: z.string().min(1, "Reason is required."),
  date: z.string().min(1, "Date is required."),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

interface InventoryAdjustmentDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  product: Product;
}

const InventoryAdjustmentDialog = ({ isOpen, setIsOpen, product }: InventoryAdjustmentDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      new_quantity: product.quantity_on_hand,
      inventory_account_id: '',
      adjustment_account_id: '',
      reason: '',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const { data: accounts } = useQuery<Account[]>({ 
    queryKey: ['accounts', activeCompany?.id],
    enabled: !!activeCompany
  });

  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const expenseAccounts = accounts?.filter(a => a.type === 'Expense' || a.type === 'Income'); // Can be income (gain) or expense (loss)

  // Try to auto-select accounts if they have obvious names
  useEffect(() => {
    if (isOpen && accounts) {
      const invAcc = accounts.find(a => a.name.toLowerCase().includes('inventory asset'));
      const adjAcc = accounts.find(a => a.name.toLowerCase().includes('inventory shrinkage') || a.name.toLowerCase().includes('cost of goods'));
      
      form.reset({
        new_quantity: product.quantity_on_hand,
        inventory_account_id: invAcc?.id || '',
        adjustment_account_id: adjAcc?.id || (product.cogs_account_id || ''),
        reason: '',
        date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
  }, [isOpen, product, accounts, form]);

  const mutation = useMutation({
    mutationFn: async (values: AdjustmentFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('products', {
        body: {
          method: 'ADJUST_QUANTITY',
          company_id: activeCompany.id,
          productId: product.id,
          newQuantity: values.new_quantity,
          inventoryAccountId: values.inventory_account_id,
          adjustmentAccountId: values.adjustment_account_id,
          reason: values.reason,
          date: values.date,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      showSuccess('Inventory adjusted successfully.');
      setIsOpen(false);
    },
    onError: (error: any) => showError(error.message),
  });

  const onSubmit = (values: AdjustmentFormValues) => mutation.mutate(values);

  const newQty = form.watch('new_quantity');
  const diff = newQty - product.quantity_on_hand;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock: {product.name}</DialogTitle>
          <DialogDescription>
            Current Quantity: {product.quantity_on_hand}. Current Cost: {product.cost}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="new_quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>New Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            
            {diff !== 0 && (
              <div className={`text-sm font-medium ${diff < 0 ? 'text-red-500' : 'text-green-500'}`}>
                Adjustment: {diff > 0 ? '+' : ''}{diff} units 
                ({new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Math.abs(diff * (product.cost || 0)))})
              </div>
            )}

            <FormField control={form.control} name="inventory_account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Inventory Asset Account</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select asset account" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            
            <FormField control={form.control} name="adjustment_account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Adjustment Account (Expense/COGS)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select expense account" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Reason</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Shrinkage, Broken Stock, Found Item" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending || diff === 0}>
                {mutation.isPending ? 'Saving...' : 'Save Adjustment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryAdjustmentDialog;