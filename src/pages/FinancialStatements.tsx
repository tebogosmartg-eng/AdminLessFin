import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Calendar as CalendarIcon, Download, Printer } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, startOfYear, endOfYear, subDays, getYear, set, isBefore } from 'date-fns';
import { cn, downloadCSV } from '../lib/utils';
import { formatCurrency } from '../lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import FinancialRatios from '../components/FinancialRatios';
import { useAuth } from '../contexts/AuthContext';

type AccountBalance = {
  id: string;
  account_number: number;
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

type CashFlowItem = {
  section: 'Operating' | 'Investing' | 'Financing';
  category: string;
  amount: number;
};

const FinancialStatements = () => {
  const { profile, activeCompany } = useAuth();
  const [date, setDate] = useState<DateRange | undefined>();

  useEffect(() => {
    if (profile?.current_financial_year_start && !date) {
      const start = new Date(profile.current_financial_year_start);
      const startYear = getYear(start);
      const endMonth = (profile.financial_year_end_month || 12) - 1;
      const endDay = profile.financial_year_end_day || 31;
      const tempStartDate = set(new Date(0), { month: start.getMonth(), date: start.getDate() });
      const tempEndDate = set(new Date(0), { month: endMonth, date: endDay });
      const endYear = isBefore(tempEndDate, tempStartDate) ? startYear + 1 : startYear;
      const end = set(new Date(0), { year: endYear, month: endMonth, date: endDay });
      setDate({ from: start, to: end });
    }
  }, [profile, date]);

  const fromDate = date?.from;
  const toDate = date?.to;
  const priorDate = fromDate ? subDays(fromDate, 1) : undefined;

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['financial_statements', fromDate, toDate, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany || !fromDate || !toDate || !priorDate) return null;
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          company_id: activeCompany.id,
          start_date: format(fromDate, 'yyyy-MM-dd'),
          end_date: format(toDate, 'yyyy-MM-dd'),
          prior_date: format(priorDate, 'yyyy-MM-dd'),
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany && !!fromDate && !!toDate && !!priorDate,
  });

  const balancesAsOf: AccountBalance[] = reportData?.balancesAsOf || [];
  const openingBalances: AccountBalance[] = reportData?.openingBalances || [];
  const periodActivity: AccountActivity[] = reportData?.periodActivity || [];
  const cashFlowData: CashFlowItem[] = reportData?.cashFlowData || [];

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
  const totalStoredEquity = equityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  
  // IMPORTANT: For the Balance Sheet to balance, we must include the current period's Net Income in Equity
  const totalEquity = totalStoredEquity + netIncome;
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

  // Cash Flow Calculations
  const operatingActivities = cashFlowData?.filter(i => i.section === 'Operating') || [];
  const investingActivities = cashFlowData?.filter(i => i.section === 'Investing') || [];
  const financingActivities = cashFlowData?.filter(i => i.section === 'Financing') || [];
  const totalOperating = operatingActivities.reduce((sum, i) => sum + i.amount, 0);
  const totalInvesting = investingActivities.reduce((sum, i) => sum + i.amount, 0);
  const totalFinancing = financingActivities.reduce((sum, i) => sum + i.amount, 0);
  const netCashFlow = totalOperating + totalInvesting + totalFinancing;

  // Ratio Calculations
  const currentAssetKeywords = ['cash', 'bank', 'checking', 'receivable', 'inventory'];
  const currentLiabilityKeywords = ['payable', 'credit card'];
  const currentAssets = assetAccounts.filter(a => currentAssetKeywords.some(k => a.name.toLowerCase().includes(k))).reduce((sum, a) => sum + a.balance, 0);
  const currentLiabilities = liabilityAccounts.filter(l => currentLiabilityKeywords.some(k => l.name.toLowerCase().includes(k))).reduce((sum, l) => sum + l.balance, 0);
  
  const ratios = {
    currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : null,
    netProfitMargin: totalIncome > 0 ? netIncome / totalIncome : null,
    debtToEquity: totalEquity > 0 ? totalLiabilities / totalEquity : null,
    returnOnEquity: totalEquity > 0 ? netIncome / totalEquity : null,
    returnOnAssets: totalAssets > 0 ? netIncome / totalAssets : null,
  };

  const handleDownload = (type: string) => {
    if (!fromDate || !toDate) return;
    let data: any[] = [];
    let filename = '';

    switch (type) {
      case 'income-statement':
        data.push({ Section: 'Income', Account: '', Amount: '' });
        incomeAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.activity.toFixed(2) }));
        data.push({ Section: 'Total Income', Account: '', Amount: totalIncome.toFixed(2) });
        data.push({ Section: 'Expenses', Account: '', Amount: '' });
        expenseAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.activity.toFixed(2) }));
        data.push({ Section: 'Total Expenses', Account: '', Amount: totalExpenses.toFixed(2) });
        data.push({ Section: 'Net Income', Account: '', Amount: netIncome.toFixed(2) });
        filename = `income-statement-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.csv`;
        break;
      case 'balance-sheet':
        data.push({ Section: 'Assets', Account: '', Amount: '' });
        assetAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.balance.toFixed(2) }));
        data.push({ Section: 'Total Assets', Account: '', Amount: totalAssets.toFixed(2) });
        data.push({ Section: 'Liabilities', Account: '', Amount: '' });
        liabilityAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.balance.toFixed(2) }));
        data.push({ Section: 'Total Liabilities', Account: '', Amount: totalLiabilities.toFixed(2) });
        data.push({ Section: 'Equity', Account: '', Amount: '' });
        equityAccounts.forEach(acc => data.push({ Section: '', Account: acc.name, Amount: acc.balance.toFixed(2) }));
        data.push({ Section: '', Account: 'Current Year Earnings', Amount: netIncome.toFixed(2) });
        data.push({ Section: 'Total Equity', Account: '', Amount: totalEquity.toFixed(2) });
        data.push({ Section: 'Total Liabilities & Equity', Account: '', Amount: totalLiabilitiesAndEquity.toFixed(2) });
        filename = `balance-sheet-${format(toDate, 'yyyy-MM-dd')}.csv`;
        break;
      case 'trial-balance':
        data = balancesAsOf?.map(account => ({
          'Account Number': account.account_number.toString(),
          'Account Name': account.name,
          'Debit': ['Asset', 'Expense'].includes(account.type) && account.balance >= 0 ? account.balance.toFixed(2) : (['Liability', 'Equity', 'Income'].includes(account.type) && account.balance < 0 ? (-account.balance).toFixed(2) : ''),
          'Credit': ['Liability', 'Equity', 'Income'].includes(account.type) && account.balance >= 0 ? account.balance.toFixed(2) : (['Asset', 'Expense'].includes(account.type) && account.balance < 0 ? (-account.balance).toFixed(2) : ''),
        })) || [];
        data.push({ 'Account Number': '', 'Account Name': 'Totals', Debit: totalDebits.toFixed(2), Credit: totalCredits.toFixed(2) });
        filename = `trial-balance-${format(toDate, 'yyyy-MM-dd')}.csv`;
        break;
    }
    downloadCSV(data, filename);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <h1 className="text-3xl font-bold">Financial Statements</h1>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button id="date" variant={"outline"} className={cn("w-[300px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (date.to ? (<>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</>) : (format(date.from, "LLL dd, y"))) : (<span>Pick a date range</span>)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
        </div>
      </div>

      <Tabs defaultValue="income-statement">
        <TabsList className="print:hidden">
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="equity">Changes in Equity</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="ratio-analysis">Ratio Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="income-statement">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Income Statement</CardTitle><CardDescription>{fromDate && toDate ? `For the period from ${format(fromDate, "PPP")} to ${format(toDate, "PPP")}` : 'Select a date range'}</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => handleDownload('income-statement')} className="print:hidden"><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
            </CardHeader>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Balance Sheet</CardTitle><CardDescription>{toDate ? `As of ${format(toDate, "PPP")}` : 'Select an end date'}</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => handleDownload('balance-sheet')} className="print:hidden"><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
            </CardHeader>
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
                      <TableRow><TableCell className="pl-8 italic">Current Year Earnings</TableCell><TableCell className="text-right">{formatCurrency(netIncome)}</TableCell></TableRow>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Statement of Changes in Equity</CardTitle><CardDescription>{fromDate && toDate ? `For the period from ${format(fromDate, "PPP")} to ${format(toDate, "PPP")}` : 'Select a date range'}</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => {}} className="print:hidden"><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
            </CardHeader>
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

        <TabsContent value="cash-flow">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Statement of Cash Flows</CardTitle><CardDescription>{fromDate && toDate ? `For the period from ${format(fromDate, "PPP")} to ${format(toDate, "PPP")}` : 'Select a date range'}</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => {}} className="print:hidden"><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
            </CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow className="font-semibold bg-muted/50"><TableCell>Cash Flow from Operating Activities</TableCell><TableCell></TableCell></TableRow>
                  {operatingActivities.map(item => (<TableRow key={item.category}><TableCell className="pl-8">{item.category}</TableCell><TableCell className="text-right">{formatCurrency(item.amount)}</TableCell></TableRow>))}
                  <TableRow className="font-semibold"><TableCell>Net Cash from Operating Activities</TableCell><TableCell className="text-right">{formatCurrency(totalOperating)}</TableCell></TableRow>
                  
                  <TableRow className="font-semibold bg-muted/50"><TableCell>Cash Flow from Investing Activities</TableCell><TableCell></TableCell></TableRow>
                  {investingActivities.map(item => (<TableRow key={item.category}><TableCell className="pl-8">{item.category}</TableCell><TableCell className="text-right">{formatCurrency(item.amount)}</TableCell></TableRow>))}
                  <TableRow className="font-semibold"><TableCell>Net Cash from Investing Activities</TableCell><TableCell className="text-right">{formatCurrency(totalInvesting)}</TableCell></TableRow>

                  <TableRow className="font-semibold bg-muted/50"><TableCell>Cash Flow from Financing Activities</TableCell><TableCell></TableCell></TableRow>
                  {financingActivities.map(item => (<TableRow key={item.category}><TableCell className="pl-8">{item.category}</TableCell><TableCell className="text-right">{formatCurrency(item.amount)}</TableCell></TableRow>))}
                  <TableRow className="font-semibold"><TableCell>Net Cash from Financing Activities</TableCell><TableCell className="text-right">{formatCurrency(totalFinancing)}</TableCell></TableRow>
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold"><TableCell>Net Change in Cash</TableCell><TableCell className="text-right">{formatCurrency(netCashFlow)}</TableCell></TableRow></TableFooter>
              </Table>
            )}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial-balance">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Trial Balance</CardTitle><CardDescription>{toDate ? `As of ${format(toDate, "PPP")}` : 'Select an end date'}</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => handleDownload('trial-balance')} className="print:hidden"><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
            </CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-96 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Acc. No.</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {balancesAsOf?.sort((a, b) => a.account_number - b.account_number).map(acc => (
                    <TableRow key={acc.id}>
                      <TableCell>{acc.account_number}</TableCell>
                      <TableCell>{acc.name}</TableCell>
                      <TableCell className="text-right font-mono">{['Asset', 'Expense'].includes(acc.type) && acc.balance >= 0 ? formatCurrency(acc.balance) : (['Liability', 'Equity', 'Income'].includes(acc.type) && acc.balance < 0 ? formatCurrency(-acc.balance) : '')}</TableCell>
                      <TableCell className="text-right font-mono">{['Liability', 'Equity', 'Income'].includes(acc.type) && acc.balance >= 0 ? formatCurrency(acc.balance) : (['Asset', 'Expense'].includes(acc.type) && acc.balance < 0 ? formatCurrency(-acc.balance) : '')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold"><TableCell colSpan={2}>Totals</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalDebits)}</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalCredits)}</TableCell></TableRow></TableFooter>
              </Table>
            )}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ratio-analysis">
          <Card>
            <CardHeader>
              <CardTitle>Ratio Analysis</CardTitle>
              <CardDescription>{toDate ? `Key performance indicators for the period ending ${format(toDate, "PPP")}` : 'Select an end date'}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-64 w-full" /> : <FinancialRatios ratios={ratios} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialStatements;