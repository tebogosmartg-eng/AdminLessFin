import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { Product } from '../pages/Products';

const productSchema = z.object({
  name: z.string().min(1, 'Product/Service name is required.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price cannot be negative.').optional().nullable(),
  cost: z.coerce.number().min(0, 'Cost cannot be negative.').optional().nullable(),
  type: z.enum(['service', 'inventory']),
  income_account_id: z.string().optional().nullable(),
  cogs_account_id: z.string().optional().nullable(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  product?: Product;
}

const ProductForm = ({ isOpen, setIsOpen, product }: ProductFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      price: 0,
      cost: 0,
      type: 'service',
      income_account_id: '',
      cogs_account_id: '',
    },
  });

  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        description: product.description || '',
        price: product.price || 0,
        cost: product.cost || 0,
        type: product.type,
        income_account_id: product.income_account_id || '',
        cogs_account_id: product.cogs_account_id || '',
      });
    } else {
      form.reset({
        name: '',
        description: '',
        price: 0,
        cost: 0,
        type: 'service',
        income_account_id: '',
        cogs_account_id: '',
      });
    }
  }, [product, form, isOpen]);

  const { data: accounts } = useQuery<Account[]>({ 
    queryKey: ['accounts', activeCompany?.id],
    enabled: !!activeCompany,
  });
  const incomeAccounts = accounts?.filter(acc => acc.type === 'Income');
  const expenseAccounts = accounts?.filter(acc => acc.type === 'Expense');

  const mutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const method = product ? 'PUT' : 'POST';
      const productData = {
        ...values,
        price: values.price || 0,
        cost: values.cost || 0,
        income_account_id: values.income_account_id || null,
        cogs_account_id: values.cogs_account_id || null,
      };
      
      const body = {
        method,
        company_id: activeCompany.id,
        productData,
        ...(product && { productId: product.id }),
      };

      const { error } = await supabase.functions.invoke('products', { body });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', activeCompany?.id] });
      showSuccess(`Item ${product ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: ProductFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Item' : 'Add New Item'}</DialogTitle>
          <DialogDescription>Add a product or service you buy or sell.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input placeholder="e.g., Web Design Services" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl><Textarea placeholder="A brief description of the item" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Price</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Cost</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="service">Service</SelectItem>
                      <SelectItem value="inventory">Inventory</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="income_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Income Account (for Sales)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select an income account" /></SelectTrigger></FormControl>
                    <SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cogs_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>COGS Account (for Inventory Sales)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a COGS account" /></SelectTrigger></FormControl>
                    <SelectContent>{expenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Item'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductForm;