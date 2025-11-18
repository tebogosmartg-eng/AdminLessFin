import { useEffect, useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { addDays, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const invoiceFromQuoteSchema = z.object({
  invoice_number: z.string().min(1, "Invoice number is required."),
  invoice_date: z.string().min(1, "Date is required."),
  due_date: z.string().min(1, "Due date is required."),
  accounts_receivable_id: z.string().min(1, "A/R account is required."),
  inventory_asset_account_id: z.string().optional(),
  tax_payable_account_id: z.string().optional(),
  description: z.string().optional(),
  invoice_type: z.enum(['full', 'percentage']),
  percentage: z.coerce.number().min(1, "Percentage must be > 0").max(100, "Percentage must be <= 100").optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceFromQuoteSchema>;

interface CreateInvoiceFromQuoteDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  quote: any;
}

const CreateInvoiceFromQuoteDialog = ({ isOpen, setIsOpen, quote }: CreateInvoiceFromQuoteDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFromQuoteSchema),
    defaultValues: {
      invoice_number: '',
      invoice_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      invoice_type: 'full',
      percentage: 50,
    },
  });

  const { data: nextInvoiceNumber } = useQuery({
    queryKey: ['next_invoice_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('invoices', {
        body: { method: 'GET_NEXT_INVOICE_NUMBER', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (nextInvoiceNumber) {
      form.setValue('invoice_number', nextInvoiceNumber);
    }
  }, [nextInvoiceNumber, form]);

  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts', activeCompany?.id] });
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');

  const mutation = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      
      const percentage = values.invoice_type === 'full' ? 100 : values.percentage;
      if (!percentage) throw new Error("Percentage is required for partial invoice.");

      const { invoice_type, ...invoiceData } = values;

      const { error } = await supabase.functions.invoke('invoices', {
        body: {
          method: 'CREATE_FROM_QUOTE',
          company_id: activeCompany.id,
          quoteId: quote.id,
          invoiceData,
          percentage,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', activeCompany?.id] });
      showSuccess('Invoice created successfully.');
      setIsOpen(false);
      navigate('/invoices');
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const onSubmit = (values: InvoiceFormValues) => mutation.mutate(values);
  const invoiceType = form.watch('invoice_type');
  const hasInventoryItem = quote.quote_items.some((item: any) => item.products?.type === 'inventory');
  const hasTax = quote.quote_items.some((item: any) => item.tax_rate_id);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Invoice from Quote #{quote.quote_number}</DialogTitle>
          <DialogDescription>Specify the details for the new invoice.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="invoice_type"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Invoice Amount</FormLabel>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex items-center space-x-4">
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl><RadioGroupItem value="full" /></FormControl>
                        <FormLabel className="font-normal">Full quote amount</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl><RadioGroupItem value="percentage" /></FormControl>
                        <FormLabel className="font-normal">Percentage of quote</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {invoiceType === 'percentage' && (
              <FormField control={form.control} name="percentage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Percentage to Invoice</FormLabel>
                  <FormControl>
                    <div className="relative w-40">
                      <Input type="number" {...field} className="pr-8" />
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                        %
                      </span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="invoice_number" render={({ field }) => (<FormItem><FormLabel>Invoice #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="invoice_date" render={({ field }) => (<FormItem><FormLabel>Invoice Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="due_date" render={({ field }) => (<FormItem><FormLabel>Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="accounts_receivable_id" render={({ field }) => (<FormItem><FormLabel>A/R Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select A/R Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              {hasInventoryItem && (<FormField control={form.control} name="inventory_asset_account_id" render={({ field }) => (<FormItem><FormLabel>Inventory Asset Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Inventory Account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />)}
              {hasTax && (<FormField control={form.control} name="tax_payable_account_id" render={({ field }) => (<FormItem><FormLabel>Tax Payable Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Tax Liability Account" /></SelectTrigger></FormControl><SelectContent>{liabilityAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />)}
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creating...' : 'Create Invoice'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateInvoiceFromQuoteDialog;