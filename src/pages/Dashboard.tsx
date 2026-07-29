import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Account } from './ChartOfAccounts';
import { Landmark, TrendingUp, TrendingDown, Wallet, DollarSign, Calendar as CalendarIcon, AlertTriangle, ListChecks, History, FileText, Receipt, Coins, MessageSquare, Briefcase } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import IncomeExpenseChart from '../components/IncomeExpenseChart';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import QuickActions from '../components/QuickActions';
import { formatDistanceToNow, startOfMonth, endOfMonth, format } from 'date-fns';
import { formatCurrency, cn } from '../lib/utils';
import BudgetStatus from '../components/BudgetStatus';
import TopExpensesChart from '../components/TopExpensesChart';
import TopCustomersChart from '../components/TopCustomersChart';
import CashFlowForecastChart from '../components/CashFlowForecastChart';
import BankAccountsSummary from '../components/BankAccountsSummary';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import SetupChecklist from '../components/SetupChecklist';
import AccountingSetupProgressCard from '../components/accounting/AccountingSetupProgressCard';
import AccountingHealthCard from '../components/accounting/AccountingHealthCard';
import AccountingPolicyCard from '../components/accounting/AccountingPolicyCard';
import AccountingRulesCard from '../components/accounting/AccountingRulesCard';
import BusinessEventsCard from '../components/accounting/BusinessEventsCard';
import DashboardInsights from '../components/DashboardInsights';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import OperationsActionPanel from '../components/boe/OperationsActionPanel';
import ActivityFeed from '../components/boe/ActivityFeed';
import { accountsQuery as glAccountsQuery, bankAccountsQuery, bankTransactionsQuery, bankOutstandingLinesQuery, accountingReadinessQuery, accountingHealthQuery, accountingPolicyDashboardQuery, accountingRulesDashboardQuery, businessEventsDashboardQuery } from '../lib/queries';
import { BANK_TRANSACTION_LABELS } from '../lib/banking/types';
import { isCashEquivalentAccount } from '../lib/accounting/accountRoles';
import { FileCheck2 } from 'lucide-react';

type OverdueInvoice = {
  id: string;
  invoice_number: string;
  due_date: string;
  customer_name: string;
  total: number;
};

const Dashboard = () => {
  useDocumentTitle('Dashboard');
  const { user, profile, activeCompany } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const fromDate = date?.from;
  const toDate = date?.to;

  const { data: dashboardData, isLoading, error: queryError } = useQuery({
    queryKey: ['dashboardData', activeCompany?.id, fromDate, toDate],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('dashboard-data', {
        body: { 
          company_id: activeCompany.id,
          date_from: fromDate ? format(fromDate, 'yyyy-MM-dd') : undefined,
          date_to: toDate ? format(toDate, 'yyyy-MM-dd') : undefined,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
    retry: 1,
  });

  const {
    role = 'member',
    accounts = [],
    monthlySummary = [],
    arBalances = [],
    apBalances = [],
    overdueInvoices = [],
    topExpenses = [],
    topCustomers = [],
    cashFlowForecast = [],
    lowStockItems = [],
    actions = { pendingClaims: 0, draftPayrollRuns: 0, draftInvoices: 0, openBills: 0, expiringQuotes: 0 },
    recentActivity = [],
    setupStatus = { isComplete: true },
    payrollKpis = null,
  } = dashboardData || {};

  const isAdmin = role === 'owner' || role === 'admin';

  // Banking widgets: dashboard-data is frozen this phase, so these compose
  // from the existing `banking` edge function's own GET_* methods rather
  // than extending that response.
  const { data: bankAccounts, isLoading: loadingBankAccounts } = useQuery({ ...bankAccountsQuery(activeCompany?.id ?? ''), enabled: !!activeCompany && isAdmin });
  const { data: glAccountsForBanking } = useQuery<Account[]>({ ...glAccountsQuery(activeCompany?.id ?? ''), enabled: !!activeCompany && isAdmin });
  const { data: bankTransactions, isLoading: loadingBankTxns } = useQuery({ ...bankTransactionsQuery(activeCompany?.id ?? ''), enabled: !!activeCompany && isAdmin });
  const { data: outstandingLines, isLoading: loadingOutstanding } = useQuery({ ...bankOutstandingLinesQuery(activeCompany?.id ?? ''), enabled: !!activeCompany && isAdmin });
  const bankingLoading = loadingBankAccounts || loadingBankTxns || loadingOutstanding;

  const { data: accountingReadiness } = useQuery({
    ...accountingReadinessQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  const { data: accountingHealth } = useQuery({
    ...accountingHealthQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  const { data: accountingPolicyDashboard } = useQuery({
    ...accountingPolicyDashboardQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  const { data: accountingRulesDashboard } = useQuery({
    ...accountingRulesDashboardQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  const { data: businessEventsDashboard } = useQuery({
    ...businessEventsDashboardQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  const bankGlBalanceByCoaId = new Map((glAccountsForBanking ?? []).map((a) => [a.id, a.balance]));
  const cashPosition = (bankAccounts ?? []).reduce((sum, a) => sum + (bankGlBalanceByCoaId.get(a.chart_of_account_id) ?? 0), 0);
  const recentBankingActivity = (bankTransactions ?? []).slice().sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1)).slice(0, 5);
  const pendingReconciliationCount = (outstandingLines ?? []).length;

  const calculateTotals = (accList: Account[]) => {
    if (!accList || accList.length === 0) return { assets: 0, liabilities: 0, netIncome: 0, cash: 0 };
    const totals = accList.reduce((acc, account) => {
      const type = account.type.toLowerCase() as keyof typeof acc;
      acc[type] = (acc[type] || 0) + (account.balance || 0);
      if (account.type === 'Asset' && isCashEquivalentAccount(account)) {
          acc.cash = (acc.cash || 0) + (account.balance || 0);
      }
      return acc;
    }, { asset: 0, liability: 0, equity: 0, income: 0, expense: 0, cash: 0 });
    return { assets: totals.asset, liabilities: totals.liability, netIncome: totals.income - totals.expense, cash: totals.cash };
  };

  const totals = calculateTotals(accounts);
  const totalAr = arBalances?.reduce((sum: number, item: { balance: number }) => sum + item.balance, 0) || 0;
  const totalAp = apBalances?.reduce((sum: number, item: { balance: number }) => sum + item.balance, 0) || 0;

  const summaryCards = [
    { title: 'Cash Balance', value: totals.cash, icon: DollarSign, link: '/chart-of-accounts', hidden: !isAdmin },
    { title: 'Total Assets', value: totals.assets, icon: Wallet, link: '/reports/live-financial-statements', hidden: !isAdmin },
    { title: 'Total Liabilities', value: totals.liabilities, icon: Landmark, link: '/reports/live-financial-statements', hidden: !isAdmin },
    { title: 'Net Income (YTD)', value: totals.netIncome, icon: totals.netIncome >= 0 ? TrendingUp : TrendingDown, color: totals.netIncome >= 0 ? 'text-success' : 'text-destructive', link: '/reports', hidden: !isAdmin },
  ];

  if (queryError) {
    return (
        <div className="p-6">
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error loading dashboard</AlertTitle>
                <AlertDescription>We couldn't load your financial summary. {queryError.message}</AlertDescription>
            </Alert>
            <Button className="mt-4" onClick={() => window.location.reload()}>Try Again</Button>
        </div>
    );
  }

  return (
    <div className="section-stack">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Operations Command Centre</h1>
          <p className="text-muted-foreground">Welcome back, {profile?.full_name || user?.email}! What needs your attention today?</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn("w-full justify-start text-left font-normal sm:w-[260px]", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (<>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</>) : (format(date.from, "LLL dd, y"))
              ) : (<span>Pick a date range</span>)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
          </PopoverContent>
        </Popover>
      </header>
      
      {accountingReadiness && !accountingReadiness.accountingReady && (
        <AccountingSetupProgressCard readiness={accountingReadiness} />
      )}

      {!isLoading &&
        accountingReadiness?.accountingReady &&
        !setupStatus.isComplete && <SetupChecklist status={setupStatus} />}

      {accountingHealth && (
        <AccountingHealthCard health={accountingHealth} />
      )}

      {accountingPolicyDashboard && (
        <AccountingPolicyCard dashboard={accountingPolicyDashboard} />
      )}

      {accountingRulesDashboard && (
        <AccountingRulesCard dashboard={accountingRulesDashboard} />
      )}

      {businessEventsDashboard && (
        <BusinessEventsCard dashboard={businessEventsDashboard} />
      )}

      {lowStockItems && lowStockItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Low Stock Alert</AlertTitle>
          <AlertDescription className="mt-2">
            The following items are running low on stock:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {lowStockItems.map((item: any) => (
                <li key={item.id}><span className="font-medium">{item.name}</span>: {item.quantity_on_hand} remaining</li>
              ))}
            </ul>
            <Button asChild variant="link" className="px-0 h-auto mt-2 text-destructive">
              <Link to="/products">Manage Inventory &rarr;</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3" aria-label="Quick actions">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Quick actions</h2>
          <p className="text-sm text-muted-foreground">Jump into common workflows quickly.</p>
        </div>
        <QuickActions />
      </section>

      {isAdmin && (
        <DashboardInsights
          isLoading={isLoading}
          overdueInvoices={overdueInvoices}
          lowStockItems={lowStockItems}
          actions={actions}
          totalAr={totalAr}
          totalAp={totalAp}
          netIncome={totals.netIncome}
        />
      )}

      {isAdmin && (
        <section className="space-y-3" aria-label="Financial health KPIs">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Financial health</h2>
            <p className="text-sm text-muted-foreground">A concise overview of your current position.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {summaryCards.filter(c => !c.hidden).map((card, index) => (
            <Card key={index} className="cursor-pointer transition-all duration-base ease-smooth hover:shadow-md hover:-translate-y-0.5" onClick={() => navigate(card.link)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <card.icon className="h-5 w-5" />
                </div>
                </CardHeader>
                <CardContent>
                {isLoading ? <Skeleton className="h-9 w-3/4" /> : <div className={`text-3xl font-semibold tracking-tight tabular-nums ${card.color || ''}`}>{formatCurrency(card.value)}</div>}
                </CardContent>
            </Card>
            ))}
          </div>
        </section>
      )}

      {isAdmin && payrollKpis && (
        <section className="space-y-3" aria-label="Payroll KPIs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" /> Payroll
              </h2>
              <p className="text-sm text-muted-foreground">Upcoming run status, statutory totals and output lifecycle.</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/payroll">Payroll Command Centre</Link>
            </Button>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardDescription className="text-xs">Upcoming Payroll</CardDescription>
                <CardTitle className="text-sm">
                  {payrollKpis.upcomingPayDate ? format(new Date(payrollKpis.upcomingPayDate), 'dd MMM yyyy') : '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardDescription className="text-xs">Run Status</CardDescription>
                <CardTitle className="text-sm capitalize">{payrollKpis.runStatus}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardDescription className="text-xs">Draft Runs</CardDescription>
                <CardTitle className="text-sm">{payrollKpis.draftRunCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardDescription className="text-xs">Bank Batch</CardDescription>
                <CardTitle className="text-sm capitalize">{(payrollKpis.bankBatchStatus ?? 'none').replace(/_/g, ' ')}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardDescription className="text-xs">Payslips</CardDescription>
                <CardTitle className="text-sm">{payrollKpis.payslipStatus}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="cursor-pointer hover:bg-muted/50" onClick={() => navigate('/payroll-reports')}>
              <CardHeader className="p-3 pb-1">
                <CardDescription className="text-xs">Reports</CardDescription>
                <CardTitle className="text-sm flex items-center gap-1">View <FileText className="h-3 w-3" /></CardTitle>
              </CardHeader>
            </Card>
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" /> Action Required</CardTitle>
            <CardDescription>Grouped by business lifecycle — items waiting for your review.</CardDescription>
          </CardHeader>
          <CardContent>
            <OperationsActionPanel actions={actions} isLoading={isLoading} isAdmin={isAdmin} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-muted-foreground" /> Business Activity</CardTitle>
            <CardDescription>Recent events across all lifecycles — enriched from journal entries.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityFeed entries={recentActivity} isLoading={isLoading} />
            {isAdmin && !isLoading && (
              <Button asChild variant="ghost" className="w-full text-xs h-8 mt-2">
                <Link to="/journal-entries">View All Transactions</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
            <CardHeader><CardTitle>Cash Flow Forecast (30 Days)</CardTitle><CardDescription>Projected balance based on due invoices and bills.</CardDescription></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-[300px] w-full" /> : <CashFlowForecastChart data={cashFlowForecast} />}</CardContent>
            </Card>
            <Card>
            <CardHeader><CardTitle>Income vs Expenses Trend</CardTitle><CardDescription>6-month trend analysis.</CardDescription></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-[300px] w-full" /> : monthlySummary && monthlySummary.length > 0 ? <IncomeExpenseChart data={monthlySummary} /> : <p className="text-md text-muted-foreground text-center py-8">Not enough data to display a chart.</p>}</CardContent>
            </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/receive-payments')}>
          <CardHeader><CardTitle>Accounts Receivable</CardTitle><CardDescription>Money owed to you by customers.</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(totalAr)}</div>
                <p className="text-xs text-muted-foreground">Total outstanding balance</p>
                <div className="mt-4 space-y-2">
                  {arBalances && arBalances.length > 0 ? arBalances.slice(0, 3).map((item: any) => (<div key={item.customer_id} className="flex justify-between items-center text-sm"><span>{item.customer_name}</span><span className="font-mono">{formatCurrency(item.balance)}</span></div>)) : <p className="text-sm text-muted-foreground">No outstanding invoices.</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/pay-bills')}>
          <CardHeader><CardTitle>Accounts Payable</CardTitle><CardDescription>Money you owe to vendors.</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(totalAp)}</div>
                <p className="text-xs text-muted-foreground">Total outstanding balance</p>
                <div className="mt-4 space-y-2">
                  {apBalances && apBalances.length > 0 ? apBalances.slice(0, 3).map((item: any) => (<div key={item.vendor_id} className="flex justify-between items-center text-sm"><span>{item.vendor_name}</span><span className="font-mono">{formatCurrency(item.balance)}</span></div>)) : <p className="text-sm text-muted-foreground">No outstanding bills.</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        {isAdmin && <BankAccountsSummary />}
      </div>

      {isAdmin && (
        <section className="space-y-3" aria-label="Banking">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" /> Banking
              </h2>
              <p className="text-sm text-muted-foreground">Cash position and reconciliation status.</p>
            </div>
            <Button variant="outline" size="sm" asChild><Link to="/banking">Banking Command Centre</Link></Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/banking/accounts')}>
              <CardHeader><CardTitle>Cash Position</CardTitle><CardDescription>Across all bank, cash, and petty cash accounts.</CardDescription></CardHeader>
              <CardContent>{bankingLoading ? <Skeleton className="h-9 w-2/3" /> : <div className="text-3xl font-semibold tabular-nums">{formatCurrency(cashPosition)}</div>}</CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/banking/reconciliation')}>
              <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-4 w-4" />Pending Reconciliation</CardTitle><CardDescription>Unmatched statement lines.</CardDescription></CardHeader>
              <CardContent>
                {bankingLoading ? <Skeleton className="h-9 w-1/3" /> : (
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-semibold tabular-nums">{pendingReconciliationCount}</span>
                    {pendingReconciliationCount > 0 && <Badge variant="warning">Needs review</Badge>}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent Banking Activity</CardTitle></CardHeader>
              <CardContent>
                {bankingLoading ? <Skeleton className="h-24 w-full" /> : recentBankingActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent banking activity.</p>
                ) : (
                  <ul className="space-y-2">
                    {recentBankingActivity.map((t) => (
                      <li key={t.id} className="flex justify-between items-center text-sm">
                        <span className="truncate pr-2">{BANK_TRANSACTION_LABELS[t.transaction_type] ?? t.transaction_type} · {t.bank_accounts?.name}</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Overdue Invoices</CardTitle><CardDescription>Invoices past their due date.</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              overdueInvoices && overdueInvoices.length > 0 ? (
                <ul className="space-y-3">
                  {overdueInvoices.map((invoice: OverdueInvoice) => (
                    <li key={invoice.id}>
                      <Link to={`/invoices/${invoice.id}`} className="block p-2 -m-2 rounded-md transition-colors hover:bg-muted">
                        <div className="flex justify-between items-center text-sm"><span className="font-medium">{invoice.customer_name}</span><span className="font-mono">{formatCurrency(invoice.total)}</span></div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground"><span>#{invoice.invoice_number}</span><span className="text-destructive">Due {formatDistanceToNow(new Date(invoice.due_date), { addSuffix: true })}</span></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (<p className="text-sm text-muted-foreground text-center py-8">No overdue invoices.</p>)
            )}
          </CardContent>
        </Card>
        {isAdmin && <Card><CardHeader><CardTitle>Top Expenses</CardTitle><CardDescription>Spending for the current period.</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[300px] w-full" /> : <TopExpensesChart data={topExpenses} />}</CardContent></Card>}
        {isAdmin && <Card><CardHeader><CardTitle>Top Customers</CardTitle><CardDescription>Highest revenue by customer.</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[300px] w-full" /> : <TopCustomersChart data={topCustomers} />}</CardContent></Card>}
      </div>
      {isAdmin && <BudgetStatus />}
    </div>
  );
};

export default Dashboard;