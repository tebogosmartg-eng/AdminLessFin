import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokePayroll } from '../lib/payrollOperations';
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
import { FormDialog } from './ui/form-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { showError, showSuccess } from '../utils/toast';
import { addDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type PayFrequency = 'monthly' | 'fortnightly' | 'weekly';

/** Period end for a frequency starting on `start` (YYYY-MM-DD). */
function periodEndFor(start: string, frequency: PayFrequency): string {
  const date = parseISO(start);
  if (frequency === 'weekly') return format(addDays(date, 6), 'yyyy-MM-dd');
  if (frequency === 'fortnightly') return format(addDays(date, 13), 'yyyy-MM-dd');
  return format(endOfMonth(date), 'yyyy-MM-dd');
}

const payrollRunSchema = z.object({
  pay_period_start: z.string().min(1, 'Start date is required.'),
  pay_period_end: z.string().min(1, 'End date is required.'),
  pay_date: z.string().min(1, 'Pay date is required.'),
  additional_run: z.boolean().default(false),
  pay_frequency: z.enum(['monthly', 'fortnightly', 'weekly']).default('monthly'),
}).refine((v) => v.pay_period_end >= v.pay_period_start, {
  message: 'The period ends before it starts.',
  path: ['pay_period_end'],
});

type PayrollRunFormValues = z.infer<typeof payrollRunSchema>;

interface NewPayrollRunDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const NewPayrollRunDialog = ({ isOpen, setIsOpen }: NewPayrollRunDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<PayrollRunFormValues>({
    resolver: zodResolver(payrollRunSchema),
    defaultValues: {
      pay_period_start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      pay_period_end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      pay_date: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      additional_run: false,
      pay_frequency: 'monthly',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: PayrollRunFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const { additional_run, ...runData } = values;
      await invokePayroll({
        method: 'CREATE_RUN',
        company_id: activeCompany.id,
        runData,
        additional_run,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll_runs', activeCompany?.id] });
      showSuccess('New payroll run created.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: PayrollRunFormValues) => {
    mutation.mutate(values);
  };

  return (
    <FormDialog open={isOpen} onOpenChange={setIsOpen} dirty={form.formState.isDirty || mutation.isPending}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start New Payroll Run</DialogTitle>
          <DialogDescription>Select the period and pay date for this run.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="pay_frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pay Frequency</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      const frequency = value as PayFrequency;
                      field.onChange(frequency);
                      const start = form.getValues('pay_period_start');
                      if (start) {
                        const end = periodEndFor(start, frequency);
                        form.setValue('pay_period_end', end, { shouldDirty: true });
                        form.setValue('pay_date', end, { shouldDirty: true });
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Pay frequency"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="fortnightly">Fortnightly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The run pays employees whose salary is set to this frequency.</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pay_period_start"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Period Start Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pay_period_end"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Period End Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pay_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pay Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="additional_run"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Additional run for a period that already has one</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Only for a bonus or correction run. Without this, a second run over the same dates is refused so nobody is paid twice.
                    </p>
                  </div>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating...' : 'Create Payroll Run'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </FormDialog>
  );
};

export default NewPayrollRunDialog;