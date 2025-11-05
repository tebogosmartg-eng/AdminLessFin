import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Account } from './ChartOfAccounts';

const Reports = () => {
  const fetchAccounts = async () => {
    const { data, error } = await supabase.from('chart_of_accounts').select('*').order('name');
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

  // Income Statement Calculations
  const incomeAccounts = accounts?.filter(acc => acc.type === 'Income') || [];
  const expenseAccounts = accounts?.filter(acc => acc.type === 'Expense') || [];
  const totalIncome = incomeAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const netIncome = totalIncome - totalExpenses;

  // Balance Sheet Calculations
  const assetAccounts = accounts?.filter(acc => acc.type === 'Asset') || [];
  const liabilityAccounts = accounts?.filter(acc => acc.type === 'Liability') || [];
  const equityAccounts = accounts?.filter(acc => acc.type === 'Equity') || [];
  
  const totalAssets = assetAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalOwnerEquity = equityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalEquity = totalOwnerEquity + netIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  // Trial Balance Calculations
  let totalDebits = 0;
  let totalCredits = 0;
  accounts?.forEach(acc => {
    if (['Asset', 'Expense'].includes(acc.type)) {
      totalDebits += acc.balance;
    } else {
      totalCredits += acc.balance;
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Reports</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance</CardTitle>
          <CardDescription>As of {new Date().toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map(account => (
                <TableRow key={account.id}>
                  <TableCell>{account.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {['Asset', 'Expense'].includes(account.type) ? formatCurrency(account.balance) : ''}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {['Liability', 'Equity', 'Income'].includes(account.type) ? formatCurrency(account.balance) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700">
                <TableCell>Totals</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalDebits)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalCredits)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Balance Sheet</CardTitle>
          <CardDescription>As of {new Date().toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assets</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetAccounts.map(account => (
                    <TableRow key={account.id}>
                      <TableCell>{account.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(account.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700">
                    <TableCell>Total Assets</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalAssets)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Liabilities & Equity</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800">
                    <TableCell>Liabilities</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  {liabilityAccounts.map(account => (
                    <TableRow key={account.id}>
                      <TableCell className="pl-8">{account.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(account.balance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total Liabilities</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalLiabilities)}</TableCell>
                  </TableRow>

                  <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800">
                    <TableCell>Equity</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  {equityAccounts.map(account => (
                    <TableRow key={account.id}>
                      <TableCell className="pl-8">{account.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(account.balance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="pl-8">Net Income</TableCell>
                    <TableCell className="text-right">{formatCurrency(netIncome)}</TableCell>
                  </TableRow>
                  <TableRow className="font-semibold">
                    <TableCell>Total Equity</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalEquity)}</TableCell>
                  </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700">
                    <TableCell>Total Liabilities & Equity</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalLiabilitiesAndEquity)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;