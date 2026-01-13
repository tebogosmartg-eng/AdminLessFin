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
import { Trash2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

const poItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  quantity: z.coerce.number().min(1, "Qty must be at least 1."),
  unit_cost: z.coerce.number().min(0, "Cost must be non-negative."),
});

const poSchema = z.object({
  po_number: z.string().min(1, "PO number is required."),
  po_date: z.string().min(1, "Date is required."),
  delivery_date: z.string().optional(),
  vendor_id: z.string().min(1, "Vendor is required."),
  notes: z.string().optional(),
  items: z.array(poItemSchema).min(1, "At least one line item is required."),
});

type POFormValues = z.infer<typeof poSchema>;

interface Props {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  poId?: string;
}

const PurchaseOrderForm = ({ isOpen, setIsOpen, poId }: Props) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!poId;

  const form = useForm<POFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      po_number: '',
      po_date: format(new Date(), 'yyyy-MM-dd'),
      delivery_date: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
      vendor_id: '',
      notes: '',
      items: [{ description: '', quantity: 1, unit_cost: 0 }],
    },
  });

  const { data: nextPONumber } = useQuery({
    queryKey: ['next_po_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('purchase-orders', {
        body: { method: 'GET_NEXT_NUMBER', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !isEditing && !!activeCompany,
  });

  const { data: existingPO } = useQuery({
    queryKey: ['po_edit', poId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('purchase-orders', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, poId },
      });
      if (error) throw error;
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (nextPONumber && !isEditing) {
      form.setValue('po_number', nextPONumber);
    }
  }, [nextPONumber, isEditing, form]);

  useEffect(() => {
    if (isEditing && existingPO) {
      form.reset({
        po_number: existingPO.po_number,
        po_date: existingPO.po_date,
        delivery_date: existingPO.delivery_date || '',
        vendor_id: existingPO.vendor_id,
        notes: existingPO.notes || '',
        items: existingPO.purchase_order_items.map((i: any) => ({
          product_id: i.product_id || undefined,
          description: i.description,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
        })),
      });
    } else if (!isEditing) {
      form.reset({
        po_number: '',
        po_date: format(new Date(), 'yyyy-MM-dd'),
        delivery_date: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
        vendor_id: '',
        notes: '',
        items: [{ description: '', quantity: 1, unit_cost: 0 }],
      });
    }
  }, [existingPO, isEditing, isOpen, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ['vendors', activeCompany?.id] });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products', activeCompany?.id] });

  const handleProductSelect = (productId: string, index: number) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}.description`, product.description || product.name);
      form.setValue(`items.${index}.unit_cost`, product.cost || 0);
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: POFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const method = isEditing ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        poId,
        poData: values,
      };
      const { error } = await supabase.functions.invoke('purchase-orders', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders', activeCompany?.id] });
      if (poId) queryClient.invalidateQueries({ queryKey: ['po_detail', poId] });
      showSuccess(`Purchase Order ${isEditing ? 'updated' : 'created'}.`);
      setIsOpen(false);
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const onSubmit = (values: POFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Purchase Order' : 'New Purchase Order'}</DialogTitle>
          <DialogDescription>Create an official order for a vendor.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField control={form.control} name="po_number" render={({ field }) => (<FormItem><FormLabel>PO #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="po_date" render={({ field }) => (<FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="delivery_date" render={({ field }) => (<FormItem><FormLabel>Delivery Due</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Delivery instructions, terms, etc." {...field} /></FormControl><FormMessage /></FormItem>)} />
            
            <div className="space-y-2 pt-4">
              <FormLabel>Items</FormLabel>
              {fields.map((field, index) => {
                const quantity = form.watch(`items.${index}.quantity`);
                const unitCost = form.watch(`items.${index}.unit_cost`);
                const lineTotal = quantity * unitCost;
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <FormField control={form.control} name={`items.${index}.product_id`} render={({ field }) => (<FormItem className="col-span-3"><Select onValueChange={(v) => { field.onChange(v); handleProductSelect(v, index); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger></FormControl><SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-4"><FormControl><Input placeholder="Desc" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-1"><FormControl><Input type="number" placeholder="Qty" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.unit_cost`} render={({ field }) => (<FormItem className="col-span-2"><FormControl><Input type="number" step="0.01" placeholder="Cost" {...field} /></FormControl></FormItem>)} />
                    <div className="col-span-1 pt-2 text-right font-mono text-sm">{formatCurrency(lineTotal)}</div>
                    <div className="col-span-1 pt-1"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                )
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unit_cost: 0 })}>Add Line</Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save PO'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseOrderForm;