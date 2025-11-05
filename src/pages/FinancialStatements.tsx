import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Calendar as CalendarIcon, Download } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, startOfYear, endOfYear, subDays } from 'date-fns';
import { cn, downloadCSV } from '../lib/utils';
import { formatCurrency } from '../lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

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

const FinancialStatements = () => {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  const fromDate = date?.from ?? new Date();
  const toDate = date?.to ?? new Date();
  const priorDate = subDays(fromDate, 1);

  const { data: balancesAsOf, isLoading: isLoadingBalances } = useQuery<AccountBalance[]>({
    queryKey: ['balancesAsOf', toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_balances_as_of_date', { p_end_date: format(toDate, 'yyyy-MM-dd') });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!toDate,
  });

  const { data: openingBalances, isLoading: isLoadingOpeningBalances } = useQuery<AccountBalance[]>({
    queryKey: ['balancesAsOf', priorDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_balances_as_of_date', { p_end_date: format(priorDate, 'yyyy-MM-dd') });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!priorDate,
  });

  const { data: periodActivity, isLoading: isLoadingActivity } = useQuery<AccountActivity[]>({
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

  const isLoading = isLoadingBalances || isLoadingActivity || isLoadingOpeningBalances;

  // Income Statement Calculations
  const incomeAccounts = periodActivity?.filter(acc => acc.type === 'Income') || [];
  const expenseAccounts = periodActivity?.filter(acc => acc.type === 'Expense') || [];
  const totalIncome = incomeAccounts.reduce((sum, acc) => sum + acc.activity, 0);
  const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.activity, 0);
  const netIncome = totalIncome - totalExpenses;

  // Balance Sheet Calculations
  const assetAccounts = balancesAsOf?.filter(acc => acc.type === 'Asset') || [];
  const liabilityAccounts = balancesAsOf?.filter(acc => acc.type === 'Liability') || [];
  const equityAccounts = balancesAsOf?.filter(acc => acc.type === 'Equity') || [];
  const totalAssets = assetAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalEquity = equityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  // Statement of Changes in Equity Calculations
  const openingRetainedEarnings = openingBalances?.find(acc => acc.name === 'Retained Earnings')?.balance || 0;
  const closingRetainedEarnings = openingRetainedEarnings + netIncome;

  // Trial Balance Calculations
  let totalDebits = 0;
  let totalCredits = 0;
  balancesAsOf?.forEach(acc => {
    if (['Asset', 'Expense'].includes(acc.type)) {
      acc.balance >= 0 ? (totalDebits += acc.balance) : (totalCredits += -acc.balance);
    } else {
      acc.balance >= 0 ? (totalCredits += acc.balance) : (totalDebits += -acc.balance);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <h1 className="text-3xl font-bold">Financial Statements</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button id="date" variant={"outline"} className={cn("w-[300px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (date.to ? (<>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</>) : (format(date.from, "LLL dd, y"))) : (<span>Pick a date</span>)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
          </PopoverContent>
        </Popover>
      </div>

      <Tabs defaultValue="income-statement">
        <TabsList className="print:hidden">
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="equity">Changes in Equity</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="income-statement">
          <Card>
            <CardHeader><CardTitle>Income Statement</CardTitle><CardDescription>For the period from {format(fromDate, "PPP")} to {format(toDate, "PPP")}</CardDescription></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow className="font-semibold bg-muted/50"><TableCell>Income</TableCell><TableCell></TableCell></TableRow>
                  {incomeAccounts.map(acc => (<TableRow key={acc.id}><TableCell className="pl-8">{acc.name}</TableCell><TableCell className="text-right">{formatCurrency(acc.activity)}</TableCell></TableRow>))}
                  <TableRow className="font-semibold"><TableCell>Total Income</TableCell><TableCell className="text-right">{formatCurrency(totalIncome)}</TableCell></TableRow>
                  <TableRow className="font-semibold bg-muted/50"><TableCell>Expenses</TableCell><TableCell></TableCell></TableRow>
                  {expenseAccounts.map(acc => (<TableRow key={acc.id}><TableCell className="pl-8">{acc.name}</TableCell><TableCell className="text-right">{formatCurrency(acc.activity)}</TableCell></TableRow>))}
                  <TableRow className="font-semibold"><TableCell>Total Expenses</TableCell><TableCell className="text-right">{formatCurrency(totalExpenses)}</TableCell></TableRow>
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold"><TableCell>Net Income</TableCell><TableCell className="text-right">{formatCurrency(netIncome)}</TableCell></TableRow></TableFooter>
              </Table>
            )}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance-sheet">
          <Card>
            <CardHeader><CardTitle>Balance Sheet</CardTitle><CardDescription>As of {format(toDate, "PPP")}</CardDescription></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-96 w-full" /> : (
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Assets</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>{assetAccounts.map(acc => (<TableRow key={acc.id}><TableCell>{acc.name}</TableCell><TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell></TableRow>))}</TableBody>
                    <TableFooter><TableRow className="text-lg font-bold"><TableCell>Total Assets</TableCell><TableCell className="text-right">{formatCurrency(totalAssets)}</TableCell></TableRow></TableFooter>
                  </Table>
                </div>
                <div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Liabilities & Equity</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <TableRow className="font-semibold bg-muted/50"><TableCell>Liabilities</TableCell><TableCell></TableCell></TableRow>
                      {liabilityAccounts.map(acc => (<TableRow key={acc.id}><TableCell className="pl-8">{acc.name}</TableCell><TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell></TableRow>))}
                      <TableRow className="font-semibold"><TableCell>Total Liabilities</TableCell><TableCell className="text-right">{formatCurrency(totalLiabilities)}</TableCell></TableRow>
                      <TableRow className="font-semibold bg-muted/50"><TableCell>Equity</TableCell><TableCell></TableCell></TableRow>
                      {equityAccounts.map(acc => (<TableRow key={acc.id}><TableCell className="pl-8">{acc.name}</TableCell><TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell></TableRow>))}
                      <TableRow className="font-semibold"><TableCell>Total Equity</TableCell><TableCell className="text-right">{formatCurrency(totalEquity)}</TableCell></TableRow>
                    </TableBody>
                    <TableFooter><TableRow className="text-lg font-bold"><TableCell>Total Liabilities & Equity</TableCell><TableCell className="text-right">{formatCurrency(totalLiabilitiesAndEquity)}</TableCell></TableRow></TableFooter>
                  </Table>
                </div>
              </div>
            )}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equity">
          <Card>
            <CardHeader><CardTitle>Statement of Changes in Equity</CardTitle><CardDescription>For the period from {format(fromDate, "PPP")} to {format(toDate, "PPP")}</CardDescription></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-40 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>Retained Earnings at start of period</TableCell><TableCell className="text-right">{formatCurrency(openingRetainedEarnings)}</TableCell></TableRow>
                  <TableRow><TableCell>Net Income for the period</TableCell><TableCell className="text-right">{formatCurrency(netIncome)}</TableCell></TableRow>
                  <TableRow><TableCell>Dividends or Drawings</TableCell><TableCell className="text-right">{formatCurrency(0)}</TableCell></TableRow>
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold"><TableCell>Retained Earnings at end of period</TableCell><TableCell className="text-right">{formatCurrency(closingRetainedEarnings)}</TableCell></TableRow></TableFooter>
              </Table>
            )}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial-balance">
          <Card>
            <CardHeader><CardTitle>Trial Balance</CardTitle><CardDescription>As of {format(toDate, "PPP")}</CardDescription></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-96 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {balancesAsOf?.map(acc => (
                    <TableRow key={acc.id}>
                      <TableCell>{acc.name}</TableCell>
                      <TableCell className="text-right font-mono">{['Asset', 'Expense'].includes(acc.type) && acc.balance >= 0 ? formatCurrency(acc.balance) : (['Liability', 'Equity', 'Income'].includes(acc.type) && acc.balance < 0 ? formatCurrency(-acc.balance) : '')}</TableCell>
                      <TableCell className="text-right font-mono">{['Liability', 'Equity', 'Income'].includes(acc.type) && acc.balance >= 0 ? formatCurrency(acc.balance) : (['Asset', 'Expense'].includes(acc.type) && acc.balance < 0 ? formatCurrency(-acc.balance) : '')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold"><TableCell>Totals</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalDebits)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalCredits)}</TableCell></TableRow></TableFooter>
              </Table>
            )}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialStatements;