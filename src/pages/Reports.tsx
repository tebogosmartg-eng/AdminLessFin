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
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn, downloadCSV } from '../lib/utils';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

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

type AgedReceivable = {
  customer_id: string;
  customer_name: string;
  total_due: number;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
};

type AgedPayable = {
  vendor_id: string;
  vendor_name: string;
  total_due: number;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
};

const Reports = () => {
  const { activeCompany } = useAuth();
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const fromDate = date?.from ?? new Date();
  const toDate = date?.to ?? new Date();

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['reports', fromDate, toDate, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          company_id: activeCompany.id,
          start_date: format(fromDate, 'yyyy-MM-dd'),
          end_date: format(toDate, 'yyyy-MM-dd'),
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const pointInTimeAccounts: AccountBalance[] = reportData?.balancesAsOf || [];
  const periodActivityAccounts: AccountActivity[] = reportData?.periodActivity || [];
  const agedReceivables: AgedReceivable[] = reportData?.agedReceivables || [];
  const agedPayables: AgedPayable[] = reportData?.agedPayables || [];

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

  const handleDownloadTrialBalance = () => {
    const data = pointInTimeAccounts?.map(account => ({
      Account: account.name,
      Debit: ['Asset', 'Expense'].includes(account.type) && account.balance >= 0 ? account.balance.toFixed(2) : (['Liability', 'Equity', 'Income'].includes(account.type) && account.balance < 0 ? (-account.balance).toFixed(2) : ''),
      Credit: ['Liability', 'Equity', 'Income'].includes(account.type) && account.balance >= 0 ? account.balance.toFixed(2) : (['Asset', 'Expense'].includes(account.type) && account.balance < 0 ? (-account.balance).toFixed(2) : ''),
    })) || [];
    data.push({ Account: 'Totals', Debit: totalDebits.toFixed(2), Credit: totalCredits.toFixed(2) });
    downloadCSV(data, `trial-balance-${format(toDate, 'yyyy-MM-dd')}.csv`);
  };

  const handleDownloadIncomeStatement = () => {
    const data: { Section: string, Account: string, Amount: string }[] = [];
    data.push({ Section: 'Income', Account: '', Amount: '' });
    incomeAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.activity.toFixed(2) }));
    data.push({ Section: 'Total Income', Account: '', Amount: totalIncome.toFixed(2) });
    data.push({ Section: 'Expenses', Account: '', Amount: '' });
    expenseAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.activity.toFixed(2) }));
    data.push({ Section: 'Total Expenses', Account: '', Amount: totalExpenses.toFixed(2) });
    data.push({ Section: 'Net Income', Account: '', Amount: netIncome.toFixed(2) });
    downloadCSV(data, `income-statement-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.csv`);
  };

  const handleDownloadBalanceSheet = () => {
    const data: { Section: string, Account: string, Amount: string }[] = [];
    data.push({ Section: 'Assets', Account: '', Amount: '' });
    assetAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.balance.toFixed(2) }));
    data.push({ Section: 'Total Assets', Account: '', Amount: totalAssets.toFixed(2) });
    data.push({ Section: '', Account: '', Amount: '' });
    data.push({ Section: 'Liabilities', Account: '', Amount: '' });
    liabilityAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.balance.toFixed(2) }));
    data.push({ Section: 'Total Liabilities', Account: '', Amount: totalLiabilities.toFixed(2) });
    data.push({ Section: 'Equity', Account: '', Amount: '' });
    equityAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.balance.toFixed(2) }));
    data.push({ Section: 'Total Equity', Account: '', Amount: totalEquity.toFixed(2) });
    data.push({ Section: 'Total Liabilities & Equity', Account: '', Amount: totalLiabilitiesAndEquity.toFixed(2) });
    downloadCSV(data, `balance-sheet-${format(toDate, 'yyyy-MM-dd')}.csv`);
  };

  const handleDownloadAgedReceivables = () => {
    const data = agedReceivables?.map(row => ({
      Customer: row.customer_name,
      Current: row.current.toFixed(2),
      '1-30 Days': row.days_1_30.toFixed(2),
      '31-60 Days': row.days_31_60.toFixed(2),
      '61-90 Days': row.days_61_90.toFixed(2),
      '90+ Days': row.days_90_plus.toFixed(2),
      Total: row.total_due.toFixed(2),
    })) || [];
    downloadCSV(data, `aged-receivables-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const handleDownloadAgedPayables = () => {
    const data = agedPayables?.map(row => ({
      Vendor: row.vendor_name,
      Current: row.current.toFixed(2),
      '1-30 Days': row.days_1_30.toFixed(2),
      '31-60 Days': row.days_31_60.toFixed(2),
      '61-90 Days': row.days_61_90.toFixed(2),
      '90+ Days': row.days_90_plus.toFixed(2),
      Total: row.total_due.toFixed(2),
    })) || [];
    downloadCSV(data, `aged-payables-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

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
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Trial Balance</CardTitle>
                <CardDescription>As of {format(toDate, "PPP")}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTrialBalance}><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Income Statement</CardTitle>
                <CardDescription>For the period from {format(fromDate, "PPP")} to {format(toDate, "PPP")}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadIncomeStatement}><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Balance Sheet</CardTitle>
                <CardDescription>As of {format(toDate, "PPP")}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadBalanceSheet}><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Aged Receivables Summary</CardTitle>
                <CardDescription>Outstanding customer balances by aging period as of today.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadAgedReceivables}><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
            </CardHeader>
            <CardContent>
              {agedReceivables && agedReceivables.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">1-30 Days</TableHead>
                      <TableHead className="text-right">31-60 Days</TableHead>
                      <TableHead className="text-right">61-90 Days</TableHead>
                      <TableHead className="text-right">90+ Days</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agedReceivables?.map(row => (
                      <TableRow key={row.customer_id}>
                        <TableCell>{row.customer_name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.current)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_1_30)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_31_60)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_61_90)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_90_plus)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatCurrency(row.total_due)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700">
                      <TableCell>Totals</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedReceivables?.reduce((sum, r) => sum + r.current, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedReceivables?.reduce((sum, r) => sum + r.days_1_30, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedReceivables?.reduce((sum, r) => sum + r.days_31_60, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedReceivables?.reduce((sum, r) => sum + r.days_61_90, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedReceivables?.reduce((sum, r) => sum + r.days_90_plus, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedReceivables?.reduce((sum, r) => sum + r.total_due, 0) || 0)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-4">No outstanding receivables found.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Aged Payables Summary</CardTitle>
                <CardDescription>Outstanding vendor balances by aging period as of today.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadAgedPayables}><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
            </CardHeader>
            <CardContent>
              {agedPayables && agedPayables.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">1-30 Days</TableHead>
                      <TableHead className="text-right">31-60 Days</TableHead>
                      <TableHead className="text-right">61-90 Days</TableHead>
                      <TableHead className="text-right">90+ Days</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agedPayables?.map(row => (
                      <TableRow key={row.vendor_id}>
                        <TableCell>{row.vendor_name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.current)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_1_30)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_31_60)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_61_90)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.days_90_plus)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatCurrency(row.total_due)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700">
                      <TableCell>Totals</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedPayables?.reduce((sum, r) => sum + r.current, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedPayables?.reduce((sum, r) => sum + r.days_1_30, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedPayables?.reduce((sum, r) => sum + r.days_31_60, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedPayables?.reduce((sum, r) => sum + r.days_61_90, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedPayables?.reduce((sum, r) => sum + r.days_90_plus, 0) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(agedPayables?.reduce((sum, r) => sum + r.total_due, 0) || 0)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-4">No outstanding payables found.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Reports;