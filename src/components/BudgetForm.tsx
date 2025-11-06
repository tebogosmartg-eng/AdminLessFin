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
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { Budget } from '../pages/Budgets';
import { format } from 'date-fns';

const budgetSchema = z.object({
  account_id: z.string().min(1, 'Please select an expense account.'),
  amount: z.coerce.number().min(0.01, 'Budget amount must be positive.'),
  period: z.enum(['monthly', 'quarterly', 'yearly']),
  start_date: z.string().min(1, 'Start date is required.'),
});

type BudgetFormValues = z.infer<typeof budgetSchema>;

interface BudgetFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  budget?: Budget;
}

const BudgetForm = ({ isOpen, setIsOpen, budget }: BudgetFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      account_id: '',
      amount: 0,
      period: 'monthly',
      start_date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  useEffect(() => {
    if (budget) {
      form.reset({
        account_id: budget.account_id,
        amount: budget.amount,
        period: budget.period,
        start_date: format(new Date(budget.start_date), 'yyyy-MM-dd'),
      });
    } else {
      form.reset({
        account_id: '',
        amount: 0,
        period: 'monthly',
        start_date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
  }, [budget, form, isOpen]);

  const { data: expenseAccounts } = useQuery<Account[]>({
    queryKey: ['expense_accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('type', 'Expense')
        .eq('company_id', activeCompany.id)
        .order('account_number');
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const mutation = useMutation({
    mutationFn: async (values: BudgetFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const budgetData = {
        ...values,
        company_id: activeCompany.id,
      };

      const { error } = budget
        ? await supabase.from('budgets').update(budgetData).eq('id', budget.id)
        : await supabase.from('budgets').insert(budgetData);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets_with_activity', activeCompany?.id] });
      showSuccess(`Budget ${budget ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: BudgetFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{budget ? 'Edit Budget' : 'Create New Budget'}</DialogTitle>
          <DialogDescription>Set a spending target for an expense account.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expense Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an expense account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {expenseAccounts?.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.account_number} - {acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="e.g., 500.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Budget'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BudgetForm;