import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { showError, showSuccess } from '../utils/toast';
import { endOfMonth, format, startOfMonth } from 'date-fns';

const payrollRunSchema = z.object({
  pay_period_start: z.string().min(1, 'Start date is required.'),
  pay_period_end: z.string().min(1, 'End date is required.'),
  pay_date: z.string().min(1, 'Pay date is required.'),
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
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: PayrollRunFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const { error } = await supabase.from('payroll_runs').insert({
        ...values,
        company_id: activeCompany.id,
      });

      if (error) throw new Error(error.message);
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start New Payroll Run</DialogTitle>
          <DialogDescription>Select the period and pay date for this run.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
    </Dialog>
  );
};

export default NewPayrollRunDialog;