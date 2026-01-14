import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { formatCurrency, cn } from '../lib/utils';
import { format } from 'date-fns';

const ComparativePL = () => {
  const { activeCompany } = useAuth();

  const { data: report, isLoading } = useQuery({
    queryKey: ['comparative_pl', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_COMPARATIVE_PL',
          company_id: activeCompany.id,
          end_date: format(new Date(), 'yyyy-MM-dd'),
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const incomeAccounts = report?.accounts.filter(a => a.type === 'Income') || [];
  const expenseAccounts = report?.accounts.filter(a => a.type === 'Expense') || [];

  const calculateTotal = (accounts: any[], month: string) => {
    return accounts.reduce((sum, acc) => sum + (acc.values[month] || 0), 0);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Comparative P&L</h1>
      <Card>
        <CardHeader>
          <CardTitle>Comparative Income Statement</CardTitle>
          <CardDescription>Monthly performance over the last 3 months.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-96 w-full" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  {report?.months.map(m => <TableHead key={m.label} className="text-right">{m.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/50 font-semibold"><TableCell colSpan={4}>Income</TableCell></TableRow>
                {incomeAccounts.map(acc => (
                  <TableRow key={acc.name}>
                    <TableCell className="pl-8">{acc.name}</TableCell>
                    {report?.months.map(m => (
                      <TableCell key={m.label} className="text-right font-mono">{formatCurrency(acc.values[m.label] || 0)}</TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t">
                  <TableCell>Total Income</TableCell>
                  {report?.months.map(m => (
                    <TableCell key={m.label} className="text-right font-mono">{formatCurrency(calculateTotal(incomeAccounts, m.label))}</TableCell>
                  ))}
                </TableRow>

                <TableRow className="bg-muted/50 font-semibold h-4"><TableCell colSpan={4}></TableCell></TableRow>
                <TableRow className="bg-muted/50 font-semibold"><TableCell colSpan={4}>Expenses</TableCell></TableRow>
                {expenseAccounts.map(acc => (
                  <TableRow key={acc.name}>
                    <TableCell className="pl-8">{acc.name}</TableCell>
                    {report?.months.map(m => (
                      <TableCell key={m.label} className="text-right font-mono">{formatCurrency(acc.values[m.label] || 0)}</TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t">
                  <TableCell>Total Expenses</TableCell>
                  {report?.months.map(m => (
                    <TableCell key={m.label} className="text-right font-mono">{formatCurrency(calculateTotal(expenseAccounts, m.label))}</TableCell>
                  ))}
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow className="text-lg font-bold">
                  <TableCell>Net Profit</TableCell>
                  {report?.months.map(m => {
                    const profit = calculateTotal(incomeAccounts, m.label) - calculateTotal(expenseAccounts, m.label);
                    return (
                      <TableCell key={m.label} className={cn("text-right font-mono", profit >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(profit)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ComparativePL;