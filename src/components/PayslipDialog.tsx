import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Trash2 } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

const payslipItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  type: z.enum(['earning', 'deduction']),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
});

const payslipSchema = z.object({
  items: z.array(payslipItemSchema),
});

type PayslipFormValues = z.infer<typeof payslipSchema>;

interface PayslipDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  payslipId: string;
}

const PayslipDialog = ({ isOpen, setIsOpen, payslipId }: PayslipDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<PayslipFormValues>({
    resolver: zodResolver(payslipSchema),
    defaultValues: { items: [] },
  });

  const { data: payslipData, isLoading } = useQuery({
    queryKey: ['payslip_detail', payslipId],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('payroll', {
        body: {
          method: 'GET_PAYSLIP_DETAIL',
          company_id: activeCompany.id,
          payslipId: payslipId,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (payslipData) {
      form.reset({
        items: payslipData.payslip_items.map(({ description, type, amount }) => ({ description, type, amount })),
      });
    }
  }, [payslipData, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const mutation = useMutation({
    mutationFn: async (values: PayslipFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('payroll', {
        body: {
          method: 'UPDATE_PAYSLIP',
          company_id: activeCompany.id,
          payslipId: payslipId,
          items: values.items,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll_run_detail', payslipData.payroll_run_id] });
      queryClient.invalidateQueries({ queryKey: ['payslip_detail', payslipId] });
      showSuccess('Payslip updated successfully.');
      setIsOpen(false);
    },
    onError: (error: any) => showError(error.message),
  });

  const onSubmit = (values: PayslipFormValues) => mutation.mutate(values);

  const watchedItems = form.watch('items');
  const totalEarnings = watchedItems.filter(i => i.type === 'earning').reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const totalDeductions = watchedItems.filter(i => i.type === 'deduction').reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const netPay = totalEarnings - totalDeductions;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          {isLoading ? <Skeleton className="h-6 w-1/2" /> : (
            <>
              <DialogTitle>Edit Payslip</DialogTitle>
              <DialogDescription>
                For {payslipData?.employees.first_name} {payslipData?.employees.last_name}
              </DialogDescription>
            </>
          )}
        </DialogHeader>
        {isLoading ? <Skeleton className="h-96 w-full" /> : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                      <FormItem className="flex-1"><FormControl><Input placeholder="Description" {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.type`} render={({ field }) => (
                      <FormItem><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="earning">Earning</SelectItem><SelectItem value="deduction">Deduction</SelectItem></SelectContent></Select></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.amount`} render={({ field }) => (
                      <FormItem><FormControl><Input type="number" step="0.01" placeholder="Amount" {...field} /></FormControl></FormItem>
                    )} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', type: 'earning', amount: 0 })}>Add Line</Button>
              </div>
              
              <div className="space-y-2 pt-4 border-t">
                <div className="flex justify-between font-medium"><p>Total Earnings:</p><p>{formatCurrency(totalEarnings)}</p></div>
                <div className="flex justify-between font-medium"><p>Total Deductions:</p><p>{formatCurrency(totalDeductions)}</p></div>
                <div className="flex justify-between text-lg font-bold"><p>Net Pay:</p><p>{formatCurrency(netPay)}</p></div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PayslipDialog;