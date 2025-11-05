import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Account } from './ChartOfAccounts';

const Reports = () => {
  const fetchAccounts = async () => {
    const { data, error } = await supabase.from('chart_of_accounts').select('*');
    if (error) throw new Error(error.message);
    return data as Account[];
  };

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const incomeAccounts = accounts?.filter(acc => acc.type === 'Income') || [];
  const expenseAccounts = accounts?.filter(acc => acc.type === 'Expense') || [];

  const totalIncome = incomeAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const netIncome = totalIncome - totalExpenses;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/4" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Reports</h1>
      <Card>
        <CardHeader>
          <CardTitle>Income Statement</CardTitle>
          <CardDescription>For the period ending {new Date().toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800">
                <TableCell>Income</TableCell>
                <TableCell></TableCell>
              </TableRow>
              {incomeAccounts.map(account => (
                <TableRow key={account.id}>
                  <TableCell className="pl-8">{account.name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(account.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total Income</TableCell>
                <TableCell className="text-right">{formatCurrency(totalIncome)}</TableCell>
              </TableRow>

              <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800">
                <TableCell>Expenses</TableCell>
                <TableCell></TableCell>
              </TableRow>
              {expenseAccounts.map(account => (
                <TableRow key={account.id}>
                  <TableCell className="pl-8">{account.name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(account.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total Expenses</TableCell>
                <TableCell className="text-right">{formatCurrency(totalExpenses)}</TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700">
                <TableCell>Net Income</TableCell>
                <TableCell className="text-right">{formatCurrency(netIncome)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;