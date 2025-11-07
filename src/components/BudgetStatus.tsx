import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

type Budget = {
  id: string;
  account_name: string;
  amount: number;
  actual_amount: number;
};

const BudgetStatus = () => {
  const { activeCompany } = useAuth();

  const { data: budgets, isLoading } = useQuery<Budget[]>({
    queryKey: ['budgets_with_activity', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('budgets', {
        body: {
          method: 'GET_ALL',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs. Actuals</CardTitle>
        <CardDescription>Current period spending at a glance.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24 w-full" /> : (
          budgets && budgets.length > 0 ? (
            <div className="space-y-4">
              {budgets.slice(0, 4).map(budget => {
                const progress = budget.amount > 0 ? (budget.actual_amount / budget.amount) * 100 : 0;
                return (
                  <div key={budget.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{budget.account_name}</span>
                      <span className={cn("font-mono", progress > 100 && "text-red-600")}>
                        {formatCurrency(budget.actual_amount)} / {formatCurrency(budget.amount)}
                      </span>
                    </div>
                    <Progress value={progress} className={cn(progress > 100 && "bg-red-500")} />
                  </div>
                )
              })}
              {budgets.length > 4 && (
                <Button asChild variant="link" className="px-0 mt-2 h-auto py-0">
                  <Link to="/budgets">View all budgets</Link>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No budgets set up. <Link to="/budgets" className="underline">Create one</Link> to track spending.</p>
          )
        )}
      </CardContent>
    </Card>
  );
};

export default BudgetStatus;