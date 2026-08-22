import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Download, Printer } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { downloadCSV, formatCurrency } from '../lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import FinancialRatios from '../components/FinancialRatios';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import ReportDrilldownDialog from '../components/ReportDrilldownDialog';
import { Badge } from '../components/ui/badge';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';
import { accountsQuery } from '../lib/queries';
import type { Account } from './ChartOfAccounts';
import { AnalyticsEvents, useFirstUsagePageView } from '../lib/analytics';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { accountingReadinessQuery } from '../lib/queries';

type AccountBalance = {
  id: string;
  account_number: number;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  balance: number;
  category?: string | null;
  subcategory?: string | null;
  account_role?: string | null;
  tax_treatment?: string | null;
  control_account?: boolean | null;
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
  // Advisory only — this page is deliberately not gated on readiness, so the
  // query result never blocks rendering.
  const { activeCompany: readinessCompany } = useAuth();
  const { data: readiness } = useQuery({
    ...accountingReadinessQuery(readinessCompany?.id ?? ''),
    enabled: !!readinessCompany?.id,
  });
  const { activeCompany } = useAuth();
  useFirstUsagePageView(AnalyticsEvents.USAGE_FIRST_FINANCIAL_STATEMENTS, 'financial_statements');
  const { dateFrom, dateTo, yearCode, isReady, currentReportingPeriod } = useReportingPeriod();
  
  // Drilldown state
  const [drilldownAccount, setDrilldownAccount] = useState<{ id: string; name: string } | null>(null);

  const fromDate = currentReportingPeriod?.from ?? (dateFrom ? parseISO(dateFrom) : undefined);
  const toDate = currentReportingPeriod?.to ?? (dateTo ? parseISO(dateTo) : undefined);
  const priorDate = fromDate ? subDays(fromDate, 1) : undefined;

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['financial_statements', dateFrom, dateTo, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany || !dateFrom || !dateTo || !priorDate) return null;
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          company_id: activeCompany.id,
          start_date: dateFrom,
          end_date: dateTo,
          prior_date: format(priorDate, 'yyyy-MM-dd'),
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany && isReady && !!priorDate,
  });

  const { data: coaMeta } = useQuery<Account[]>({
    ...accountsQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });
  const coaById = useMemo(() => new Map((coaMeta ?? []).map((a) => [a.id, a])), [coaMeta]);

  const enrichBalance = (acc: AccountBalance): AccountBalance => {
    const meta = coaById.get(acc.id);
    if (!meta) return acc;
    return {
      ...acc,
      category: meta.category ?? acc.category,
      subcategory: meta.subcategory ?? acc.subcategory,
      account_role: meta.account_role ?? acc.account_role,
      tax_treatment: meta.tax_treatment ?? acc.tax_treatment,
      control_account: meta.control_account ?? acc.control_account,
    };
  };

  const balancesAsOf: AccountBalance[] = (reportData?.balancesAsOf || []).map(enrichBalance);
  const periodActivity: AccountActivity[] = reportData?.periodActivity || [];
  const cashFlowData: CashFlowItem[] = reportData?.cashFlowData || [];
  const t = reportData?.statementTotals;

  // Line items for display only — money totals come from reports.statementTotals (edge).
  const incomeAccounts = periodActivity?.filter(acc => acc.type === 'Income') || [];
  const expenseAccounts = periodActivity?.filter(acc => acc.type === 'Expense') || [];
  const assetAccounts = balancesAsOf?.filter(acc => acc.type === 'Asset') || [];
  const liabilityAccounts = balancesAsOf?.filter(acc => acc.type === 'Liability') || [];
  const equityAccounts = balancesAsOf?.filter(acc => acc.type === 'Equity') || [];

  const totalIncome = Number(t?.totalIncome ?? 0);
  const totalExpenses = Number(t?.totalExpenses ?? 0);
  const netIncome = Number(t?.netIncome ?? 0);
  // Canonical P&L partition — display only; amounts from reports.statementTotals.
  const revenue = Number(t?.revenue ?? totalIncome);
  const costOfSales = Number(t?.costOfSales ?? 0);
  const grossProfit = Number(t?.grossProfit ?? revenue - costOfSales);
  const otherIncome = Number(t?.otherIncome ?? 0);
  const operatingExpenses = Number(t?.operatingExpenses ?? totalExpenses);
  const financeCosts = Number(t?.financeCosts ?? 0);
  const taxExpense = Number(t?.taxExpense ?? 0);
  const totalAssets = Number(t?.totalAssets ?? 0);
  const totalLiabilities = Number(t?.totalLiabilities ?? 0);
  const totalEquity = Number(t?.totalEquity ?? 0);
  const totalLiabilitiesAndEquity = Number(t?.totalLiabilitiesAndEquity ?? 0);
  const openingRetainedEarnings = Number(t?.openingRetainedEarnings ?? 0);
  const closingRetainedEarnings = Number(t?.closingRetainedEarningsPresented ?? 0);
  const otherEquityMovements = Number(t?.otherEquityMovements ?? 0);
  const totalDebits = Number(t?.totalDebits ?? 0);
  const totalCredits = Number(t?.totalCredits ?? 0);
  const totalOperating = Number(t?.cashOperating ?? 0);
  const totalInvesting = Number(t?.cashInvesting ?? 0);
  const totalFinancing = Number(t?.cashFinancing ?? 0);
  const netCashFlow = Number(t?.netCashFlow ?? 0);

  const operatingActivities = cashFlowData?.filter(i => i.section === 'Operating') || [];
  const investingActivities = cashFlowData?.filter(i => i.section === 'Investing') || [];
  const financingActivities = cashFlowData?.filter(i => i.section === 'Financing') || [];

  const currentAssets = Number(t?.cash ?? 0) + Number(t?.receivables ?? 0);
  const currentLiabilities = Number(t?.payables ?? 0) + Number(t?.vatPayable ?? 0);
  
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
        <div>
          <h1 className="text-3xl font-bold">Financial Statements</h1>
          <p className="text-sm text-muted-foreground">
            Live management view of the current ledger. Adjustments appear as soon as they are
            posted. Statutory annual financial statements are produced in the{' '}
            <Link className="underline" to="/financial-statements-workspace">AFS workspace</Link>,
            which keeps its own close, review and approval controls.
          </p>
        </div>
        {yearCode && (
          <Badge variant="outline" className="ml-2 align-middle">
            Current Financial Year
          </Badge>
        )}
        <div className="flex items-center gap-2">
          <ReportingPeriodPicker />
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
        </div>
      </div>

      {readiness && readiness.accountingReady === false && (
        <Alert className="print:hidden">
          <AlertTitle>Accounting setup is still in progress</AlertTitle>
          <AlertDescription>
            These figures are live and reflect everything posted so far, but the accounting
            foundation is not yet validated, so some balances may be incomplete. Final statutory
            statements require a completed setup and period close.{' '}
            <Link className="underline" to="/accounting-setup">Continue Accounting Setup</Link>
          </AlertDescription>
        </Alert>
      )}

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
                  {incomeAccounts.map(acc => (
                    <TableRow key={acc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrilldownAccount({ id: acc.id, name: acc.name })}>
                        <TableCell className="pl-8">{acc.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(acc.activity)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold"><TableCell>Revenue</TableCell><TableCell className="text-right">{formatCurrency(revenue)}</TableCell></TableRow>
                  <TableRow><TableCell>Cost of Sales</TableCell><TableCell className="text-right">{formatCurrency(costOfSales)}</TableCell></TableRow>
                  <TableRow className="font-semibold"><TableCell>Gross Profit</TableCell><TableCell className="text-right">{formatCurrency(grossProfit)}</TableCell></TableRow>
                  <TableRow><TableCell>Other Income</TableCell><TableCell className="text-right">{formatCurrency(otherIncome)}</TableCell></TableRow>
                  <TableRow className="font-semibold"><TableCell>Total Income</TableCell><TableCell className="text-right">{formatCurrency(totalIncome)}</TableCell></TableRow>
                  <TableRow className="font-semibold bg-muted/50"><TableCell>Expenses</TableCell><TableCell></TableCell></TableRow>
                  {expenseAccounts.map(acc => (
                    <TableRow key={acc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrilldownAccount({ id: acc.id, name: acc.name })}>
                        <TableCell className="pl-8">{acc.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(acc.activity)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow><TableCell>Operating Expenses</TableCell><TableCell className="text-right">{formatCurrency(operatingExpenses)}</TableCell></TableRow>
                  <TableRow><TableCell>Finance Costs</TableCell><TableCell className="text-right">{formatCurrency(financeCosts)}</TableCell></TableRow>
                  <TableRow><TableCell>Tax</TableCell><TableCell className="text-right">{formatCurrency(taxExpense)}</TableCell></TableRow>
                  <TableRow className="font-semibold"><TableCell>Total Expenses</TableCell><TableCell className="text-right">{formatCurrency(totalExpenses)}</TableCell></TableRow>
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold"><TableCell>Net Profit</TableCell><TableCell className="text-right">{formatCurrency(netIncome)}</TableCell></TableRow></TableFooter>
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
                    <TableBody>{assetAccounts.map(acc => (
                        <TableRow key={acc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrilldownAccount({ id: acc.id, name: acc.name })}>
                            <TableCell>{acc.name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell>
                        </TableRow>
                    ))}</TableBody>
                    <TableFooter><TableRow className="text-lg font-bold"><TableCell>Total Assets</TableCell><TableCell className="text-right">{formatCurrency(totalAssets)}</TableCell></TableRow></TableFooter>
                  </Table>
                </div>
                <div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Liabilities & Equity</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <TableRow className="font-semibold bg-muted/50"><TableCell>Liabilities</TableCell><TableCell></TableCell></TableRow>
                      {liabilityAccounts.map(acc => (
                        <TableRow key={acc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrilldownAccount({ id: acc.id, name: acc.name })}>
                            <TableCell className="pl-8">{acc.name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold"><TableCell>Total Liabilities</TableCell><TableCell className="text-right">{formatCurrency(totalLiabilities)}</TableCell></TableRow>
                      <TableRow className="font-semibold bg-muted/50"><TableCell>Equity</TableCell><TableCell></TableCell></TableRow>
                      {equityAccounts.map(acc => (
                        <TableRow key={acc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrilldownAccount({ id: acc.id, name: acc.name })}>
                            <TableCell className="pl-8">{acc.name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
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
                  <TableRow><TableCell>Opening equity (stored)</TableCell><TableCell className="text-right">{formatCurrency(Number(t?.openingStoredEquity ?? 0))}</TableCell></TableRow>
                  <TableRow><TableCell>Opening Retained Earnings (role)</TableCell><TableCell className="text-right">{formatCurrency(openingRetainedEarnings)}</TableCell></TableRow>
                  <TableRow><TableCell>Net Income / Current Year Earnings</TableCell><TableCell className="text-right">{formatCurrency(netIncome)}</TableCell></TableRow>
                  <TableRow><TableCell>Capital movements − drawings (net, non-P&amp;L equity)</TableCell><TableCell className="text-right">{formatCurrency(otherEquityMovements)}</TableCell></TableRow>
                  <TableRow><TableCell>Retained Earnings at end (presented close)</TableCell><TableCell className="text-right">{formatCurrency(closingRetainedEarnings)}</TableCell></TableRow>
                </TableBody>
                <TableFooter><TableRow className="text-lg font-bold"><TableCell>Closing equity (stored + CYE)</TableCell><TableCell className="text-right">{formatCurrency(totalEquity)}</TableCell></TableRow></TableFooter>
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
                    <TableRow key={acc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrilldownAccount({ id: acc.id, name: acc.name })}>
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

      <ReportDrilldownDialog
        isOpen={!!drilldownAccount}
        setIsOpen={() => setDrilldownAccount(null)}
        accountId={drilldownAccount?.id || null}
        accountName={drilldownAccount?.name || ''}
        dateFrom={fromDate}
        dateTo={toDate}
      />
    </div>
  );
};

export default FinancialStatements;