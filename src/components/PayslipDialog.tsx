import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokePayroll } from '../lib/payrollOperations';
import { Button } from './ui/button';
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from './ui/dialog';
import { FormDialog } from './ui/form-dialog';
import { useDialogFormReset } from '../hooks/useDialogFormReset';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Trash2 } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { isCalculatedPayslipLine } from '../lib/payrollRulesEngine/payComponents';

const payslipItemSchema = z.object({
  description: z.string().min(1, "Description is required."),
  type: z.enum(['earning', 'deduction', 'taxable_benefit', 'employer_contribution', 'company_contribution', 'reimbursement']),
  amount: z.coerce.number().min(0, "Amount cannot be negative."),
  component_code: z.string().nullable().optional(),
  irp5_code: z.string().nullable().optional(),
});

const payslipSchema = z.object({
  items: z.array(payslipItemSchema),
});

type PayslipFormValues = z.infer<typeof payslipSchema>;

type PayslipEditData = {
  payroll_run_id: string;
  payslip_items: {
    description: string;
    type: 'earning' | 'deduction' | 'taxable_benefit' | 'employer_contribution' | 'company_contribution' | 'reimbursement';
    amount: number;
    component_code?: string | null;
    irp5_code?: string | null;
  }[];
  employees: { first_name: string; last_name: string };
};

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
      return invokePayroll<PayslipEditData>({
        method: 'GET_PAYSLIP_DETAIL',
        company_id: activeCompany.id,
        payslipId: payslipId,
      });
    },
    enabled: isOpen && !!activeCompany,
  });

  // Reset when the dialog opens for a payslip and when its record first
  // arrives — never because a refetch landed mid-edit, and always fresh on
  // reopen (the dialog stays mounted in PayrollRunDetail).
  useDialogFormReset(isOpen, payslipData ? `edit:${payslipId}` : `pending:${payslipId}`, () => {
    if (payslipData) {
      form.reset({
        items: payslipData.payslip_items.map(({ description, type, amount, component_code, irp5_code }) => ({
          description,
          type,
          amount,
          component_code: component_code ?? null,
          irp5_code: irp5_code ?? null,
        })),
      });
    }
  });

  const { fields, remove } = useFieldArray({ control: form.control, name: "items" });

  const mutation = useMutation({
    mutationFn: async (values: PayslipFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      await invokePayroll({
        method: 'UPDATE_PAYSLIP',
        company_id: activeCompany.id,
        payslipId: payslipId,
        items: values.items.map(({ description, type, amount, component_code, irp5_code }) => ({
          description,
          type,
          amount,
          component_code: component_code ?? null,
          irp5_code: irp5_code ?? null,
        })),
      });
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
    <FormDialog open={isOpen} onOpenChange={setIsOpen} dirty={form.formState.isDirty || mutation.isPending}>
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
              <p className="text-sm text-muted-foreground">
                Salary, allowances, benefits, PAYE, UIF, and SDL are calculated. Change them on the pay package or the run&apos;s period inputs, then regenerate.
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                {fields.map((field, index) => {
                  const locked = isCalculatedPayslipLine({
                    description: watchedItems[index]?.description ?? '',
                    type: watchedItems[index]?.type ?? '',
                    amount: Number(watchedItems[index]?.amount ?? 0),
                    component_code: watchedItems[index]?.component_code,
                  });
                  return (
                  <div key={field.id} className="flex items-center gap-2">
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                      <FormItem className="flex-1"><FormControl><Input placeholder="Description" {...field} disabled={locked} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.type`} render={({ field }) => (
                      <FormItem><Select onValueChange={field.onChange} value={field.value} disabled={locked}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="earning">Earning</SelectItem><SelectItem value="deduction">Deduction</SelectItem><SelectItem value="taxable_benefit">Taxable benefit</SelectItem><SelectItem value="employer_contribution">Employer contribution</SelectItem></SelectContent></Select></FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.amount`} render={({ field }) => (
                      <FormItem><FormControl><Input type="number" step="0.01" placeholder="Amount" {...field} disabled={locked} /></FormControl></FormItem>
                    )} />
                    {!locked && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                  );
                })}
              </div>
              
              <div className="space-y-2 pt-4 border-t">
                <div className="flex justify-between font-medium"><p>Total Earnings:</p><p>{formatCurrency(totalEarnings)}</p></div>
                <div className="flex justify-between font-medium"><p>Total Deductions:</p><p>{formatCurrency(totalDeductions)}</p></div>
                <div className="flex justify-between text-lg font-bold"><p>Net Pay:</p><p>{formatCurrency(netPay)}</p></div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </FormDialog>
  );
};

export default PayslipDialog;