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
import { useDialogFormReset } from '../hooks/useDialogFormReset';
import { accountsQuery, vendorsQuery } from '../lib/queries';

const costMethodEnum = z.enum(['fifo', 'weighted_average', 'standard', 'specific']);
const itemClassEnum = z.enum(['stock', 'non_stock', 'service']).optional().nullable();
const stockStatusEnum = z.enum(['in_stock', 'low_stock', 'out_of_stock', 'discontinued']).optional().nullable();

const productSchema = z.object({
  name: z.string().min(1, 'Product/Service name is required.'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price cannot be negative.').optional().nullable(),
  cost: z.coerce.number().min(0, 'Cost cannot be negative.').optional().nullable(),
  type: z.enum(['service', 'inventory']),
  income_account_id: z.string().optional().nullable(),
  cogs_account_id: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  item_class: itemClassEnum,
  cost_method: costMethodEnum.optional().nullable(),
  uom: z.string().optional().nullable(),
  inventory_asset_account_id: z.string().optional().nullable(),
  variance_account_id: z.string().optional().nullable(),
  reorder_level: z.coerce.number().min(0).optional().nullable(),
  stock_status: stockStatusEnum,
  category_name: z.string().optional().nullable(),
  supplier_id: z.string().optional().nullable(),
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
      sku: '',
      barcode: '',
      item_class: 'stock',
      cost_method: 'weighted_average',
      uom: 'EA',
      inventory_asset_account_id: '',
      variance_account_id: '',
      reorder_level: 0,
      stock_status: 'in_stock',
      category_name: '',
      supplier_id: '',
    },
  });

  const watchType = form.watch('type');

  useDialogFormReset(isOpen, product?.id ?? 'new', () => {
    if (product) {
      const p = product as Product & Record<string, unknown>;
      form.reset({
        name: product.name,
        description: product.description || '',
        price: product.price || 0,
        cost: product.cost || 0,
        type: product.type,
        income_account_id: product.income_account_id || '',
        cogs_account_id: product.cogs_account_id || '',
        sku: (p.sku as string) || '',
        barcode: (p.barcode as string) || '',
        item_class: (p.item_class as ProductFormValues['item_class']) || 'stock',
        cost_method: (p.cost_method as ProductFormValues['cost_method']) || 'weighted_average',
        uom: (p.uom as string) || 'EA',
        inventory_asset_account_id: (p.inventory_asset_account_id as string) || '',
        variance_account_id: (p.variance_account_id as string) || '',
        reorder_level: Number(p.reorder_level) || 0,
        stock_status: (p.stock_status as ProductFormValues['stock_status']) || 'in_stock',
        category_name: (p.category_name as string) || '',
        supplier_id: (p.supplier_id as string) || '',
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
        sku: '',
        barcode: '',
        item_class: 'stock',
        cost_method: 'weighted_average',
        uom: 'EA',
        inventory_asset_account_id: '',
        variance_account_id: '',
        reorder_level: 0,
        stock_status: 'in_stock',
        category_name: '',
        supplier_id: '',
      });
    }
  });

  const { data: accounts } = useQuery<Account[]>({ 
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });
  const incomeAccounts = accounts?.filter(acc => acc.type === 'Income');
  const expenseAccounts = accounts?.filter(acc => acc.type === 'Expense');
  const assetAccounts = accounts?.filter(acc => acc.type === 'Asset');

  const { data: vendors } = useQuery({
    ...vendorsQuery(activeCompany!.id),
    enabled: !!activeCompany && isOpen,
  });

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
        sku: values.sku || null,
        barcode: values.barcode || null,
        item_class: values.type === 'inventory' ? values.item_class || 'stock' : 'service',
        // products.cost_method is NOT NULL DEFAULT 'weighted_average' (eim_v170): every product
        // row carries a costing method. Service items don't use inventory costing, but the column
        // still requires a value, so send the schema default instead of null (which overrides the
        // default and violates the NOT NULL constraint → HTTP 500 on save).
        cost_method: values.type === 'inventory' ? values.cost_method || 'weighted_average' : 'weighted_average',
        uom: values.uom || null,
        inventory_asset_account_id: values.inventory_asset_account_id || null,
        variance_account_id: values.variance_account_id || null,
        reorder_level: values.reorder_level ?? null,
        stock_status: values.stock_status || null,
        category_name: values.category_name || null,
        supplier_id: values.supplier_id || null,
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
            {watchType === 'inventory' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl><Input placeholder="SKU" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Barcode</FormLabel>
                        <FormControl><Input placeholder="Barcode" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="category_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl><Input placeholder="Category" {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cost_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost method</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'weighted_average'}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="weighted_average">Weighted average</SelectItem>
                            <SelectItem value="fifo">FIFO</SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="specific">Specific</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="uom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>UOM</FormLabel>
                        <FormControl><Input placeholder="EA" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="reorder_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reorder level</FormLabel>
                      <FormControl><Input type="number" step="any" {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="inventory_asset_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inventory asset account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger></FormControl>
                        <SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="variance_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variance account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger></FormControl>
                        <SelectContent>{expenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="supplier_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred supplier</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {(vendors as { id: string; name: string }[] | undefined)?.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
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