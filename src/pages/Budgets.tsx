import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { showError, showSuccess } from '../utils/toast';
import BudgetForm from '../components/BudgetForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from '../lib/utils';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { budgetsQuery } from '../lib/queries';

export type Budget = {
  id: string;
  account_id: string;
  amount: number;
  period: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  account_name: string;
  actual_amount: number;
  period_start_date: string;
  period_end_date: string;
};

const Budgets = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | undefined>(undefined);
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const { data: budgets, isLoading } = useQuery<Budget[]>({
    ...budgetsQuery(activeCompany?.id!),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('budgets', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          budgetId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets_with_activity', activeCompany?.id] });
      showSuccess('Budget deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting budget: ${error.message}`);
    },
  });

  const handleEdit = (budget: Budget) => {
    setSelectedBudget(budget);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedBudget(undefined);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this budget?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Budgets vs. Actuals</CardTitle>
              <CardDescription>Track your spending against your budget for the current period.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Budget
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="w-[300px]">Progress</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Budgeted</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Loading budgets...</TableCell>
                </TableRow>
              ) : budgets && budgets.length > 0 ? (
                budgets.map((budget) => {
                  const remaining = budget.amount - budget.actual_amount;
                  const progress = budget.amount > 0 ? (budget.actual_amount / budget.amount) * 100 : 0;
                  return (
                    <TableRow key={budget.id}>
                      <TableCell className="font-medium">{budget.account_name}</TableCell>
                      <TableCell>
                        <Progress value={progress} className={cn(progress > 100 && "bg-red-500")} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(budget.actual_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(budget.amount)}</TableCell>
                      <TableCell className={cn("text-right font-mono", remaining < 0 && "text-red-600")}>
                        {formatCurrency(remaining)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(budget)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(budget.id)} className="text-red-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No budgets found. Create one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <BudgetForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        budget={selectedBudget}
      />
    </>
  );
};

export default Budgets;