import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '../lib/utils';

type AccountBalance = {
  id: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  balance: number;
};

type AccountActivity = {
  id: string;
  name: string;
  type: 'Income' | 'Expense';
  activity: number;
};

const Reports = () => {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const fromDate = date?.from ?? new Date();
  const toDate = date?.to ?? new Date();

  const { data: pointInTimeAccounts, isLoading: isLoadingPointInTime } = useQuery<AccountBalance[]>({
    queryKey: ['pointInTimeBalances', toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_balances_as_of_date', {
        p_end_date: format(toDate, 'yyyy-MM-dd'),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!toDate,
  });

  const { data: periodActivityAccounts, isLoading: isLoadingPeriodActivity } = useQuery<AccountActivity[]>({
    queryKey: ['periodActivity', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_period_activity', {
        p_start_date: format(fromDate, 'yyyy-MM-dd'),
        p_end_date: format(toDate, 'yyyy-MM-dd'),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!fromDate && !!toDate,
  });

  const isLoading = isLoadingPointInTime || isLoadingPeriodActivity;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const incomeAccounts = periodActivityAccounts?.filter(acc => acc.type === 'Income') || [];
  const expenseAccounts = periodActivityAccounts?.filter(acc => acc.type === 'Expense') || [];
  const totalIncome = incomeAccounts.reduce((sum, acc) => sum + acc.activity, 0);
  const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.activity, 0);
  const netIncome = totalIncome - totalExpenses;

  const assetAccounts = pointInTimeAccounts?.filter(acc => acc.type === 'Asset') || [];
  const liabilityAccounts = pointInTimeAccounts?.filter(acc => acc.type === 'Liability') || [];
  const equityAccounts = pointInTimeAccounts?.filter(acc => acc.type === 'Equity') || [];
  const totalAssets = assetAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalEquity = equityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  let totalDebits = 0;
  let totalCredits = 0;
  pointInTimeAccounts?.forEach(acc => {
    if (['Asset', 'Expense'].includes(acc.type)) {
      acc.balance >= 0 ? (totalDebits += acc.balance) : (totalCredits += -acc.balance);
    } else {
      acc.balance >= 0 ? (totalCredits += acc.balance) : (totalDebits += -acc.balance);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Reports</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn("w-[300px] justify-start text-left font-normal", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Trial Balance</CardTitle>
              <CardDescription>As of {format(toDate, "PPP")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pointInTimeAccounts?.map(account => (
                    <TableRow key={account.id}>
                      <TableCell>{account.name}</TableCell>
                      <TableCell className="text-right font-mono">{['Asset', 'Expense'].includes(account.type) && account.balance >= 0 ? formatCurrency(account.balance) : (['Liability', 'Equity', 'Income'].includes(account.type) && account.balance < 0 ? formatCurrency(-account.balance) : '')}</TableCell>
                      <TableCell className="text-right font-mono">{['Liability', 'Equity', 'Income'].includes(account.type) && account.balance >= 0 ? formatCurrency(account.balance) : (['Asset', 'Expense'].includes(account.type) && account.balance < 0 ? formatCurrency(-account.balance) : '')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700"><TableCell>Totals</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalDebits)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalCredits)}</TableCell></TableRow></TableFooter>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Income Statement</CardTitle>
              <CardDescription>For the period from {format(fromDate, "PPP")} to {format(toDate, "PPP")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800"><TableCell>Income</TableCell><TableCell></TableCell></TableRow>
                  {incomeAccounts.map(account => (<TableRow key={account.id}><TableCell className="pl-8">{account.name}</TableCell><TableCell className="text-right">{formatCurrency(account.activity)}</TableCell></TableRow>))}
                  <TableRow className="font-semibold"><TableCell>Total Income</TableCell><TableCell className="text-right">{formatCurrency(totalIncome)}</TableCell></TableRow>
                  <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800"><TableCell>Expenses</TableCell><TableCell></TableCell></TableRow>
                  {expenseAccounts.map(account => (<TableRow key={account.id}><TableCell className="pl-8">{account.name}</TableCell><TableCell className="text-right">{formatCurrency(account.activity)}</TableCell></TableRow>))}
                  <TableRow className="font-semibold"><TableCell>Total Expenses</TableCell><TableCell className="text-right">{formatCurrency(totalExpenses)}</TableCell></TableRow>
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700"><TableCell>Net Income</TableCell><TableCell className="text-right">{formatCurrency(netIncome)}</TableCell></TableRow></TableFooter>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Balance Sheet</CardTitle>
              <CardDescription>As of {format(toDate, "PPP")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Assets</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>{assetAccounts.map(account => (<TableRow key={account.id}><TableCell>{account.name}</TableCell><TableCell className="text-right">{formatCurrency(account.balance)}</TableCell></TableRow>))}</TableBody>
                    <TableFooter><TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700"><TableCell>Total Assets</TableCell><TableCell className="text-right">{formatCurrency(totalAssets)}</TableCell></TableRow></TableFooter>
                  </Table>
                </div>
                <div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Liabilities & Equity</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800"><TableCell>Liabilities</TableCell><TableCell></TableCell></TableRow>
                      {liabilityAccounts.map(account => (<TableRow key={account.id}><TableCell className="pl-8">{account.name}</TableCell><TableCell className="text-right">{formatCurrency(account.balance)}</TableCell></TableRow>))}
                      <TableRow className="font-semibold"><TableCell>Total Liabilities</TableCell><TableCell className="text-right">{formatCurrency(totalLiabilities)}</TableCell></TableRow>
                      <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800"><TableCell>Equity</TableCell><TableCell></TableCell></TableRow>
                      {equityAccounts.map(account => (<TableRow key={account.id}><TableCell className="pl-8">{account.name}</TableCell><TableCell className="text-right">{formatCurrency(account.balance)}</TableCell></TableRow>))}
                      <TableRow className="font-semibold"><TableCell>Total Equity</TableCell><TableCell className="text-right">{formatCurrency(totalEquity)}</TableCell></TableRow>
                    </TableBody>
                    <TableFooter><TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700"><TableCell>Total Liabilities & Equity</TableCell><TableCell className="text-right">{formatCurrency(totalLiabilitiesAndEquity)}</TableCell></TableRow></TableFooter>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Reports;