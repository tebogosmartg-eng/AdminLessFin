import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Account } from './ChartOfAccounts';
import { Landmark, TrendingUp, TrendingDown, Wallet, DollarSign, Calendar as CalendarIcon, AlertTriangle, ListChecks, History, FileText, Receipt, Coins, MessageSquare } from 'lucide-react';
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

type OverdueInvoice = {
  id: string;
  invoice_number: string;
  due_date: string;
  customer_name: string;
  total: number;
};

const Dashboard = () => {
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
    accounts = [],
    monthlySummary = [],
    arBalances = [],
    apBalances = [],
    overdueInvoices = [],
    topExpenses = [],
    topCustomers = [],
    cashFlowForecast = [],
    lowStockItems = [],
    actions = { pendingClaims: 0, draftInvoices: 0, openBills: 0, expiringQuotes: 0 },
    recentActivity = []
  } = dashboardData || {};

  const calculateTotals = (accList: Account[]) => {
    if (!accList || accList.length === 0) return { assets: 0, liabilities: 0, netIncome: 0, cash: 0 };
    
    const bankAccountKeywords = ['cash', 'bank', 'checking', 'savings'];

    const totals = accList.reduce((acc, account) => {
      const type = account.type.toLowerCase() as keyof typeof acc;
      acc[type] = (acc[type] || 0) + (account.balance || 0);

      if (account.type === 'Asset' && bankAccountKeywords.some(keyword => account.name?.toLowerCase().includes(keyword))) {
          acc.cash = (acc.cash || 0) + (account.balance || 0);
      }

      return acc;
    }, { asset: 0, liability: 0, equity: 0, income: 0, expense: 0, cash: 0 });

    return { 
        assets: totals.asset, 
        liabilities: totals.liability, 
        netIncome: totals.income - totals.expense,
        cash: totals.cash
    };
  };

  const totals = calculateTotals(accounts);
  const totalAr = arBalances?.reduce((sum: number, item: { balance: number }) => sum + item.balance, 0) || 0;
  const totalAp = apBalances?.reduce((sum: number, item: { balance: number }) => sum + item.balance, 0) || 0;

  const summaryCards = [
    { title: 'Cash Balance', value: totals.cash, icon: DollarSign, link: '/chart-of-accounts' },
    { title: 'Total Assets', value: totals.assets, icon: Wallet, link: '/financial-statements' },
    { title: 'Total Liabilities', value: totals.liabilities, icon: Landmark, link: '/financial-statements' },
    { title: 'Net Income (YTD)', value: totals.netIncome, icon: totals.netIncome >= 0 ? TrendingUp : TrendingDown, color: totals.netIncome >= 0 ? 'text-green-600' : 'text-red-600', link: '/reports' },
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
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Welcome back, {profile?.full_name || user?.email}!</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn(
                "w-[260px] justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
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

      <QuickActions />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card, index) => (
          <Card key={index} className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => navigate(card.link)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-3/4" /> : <div className={`text-2xl font-bold ${card.color || ''}`}>{formatCurrency(card.value)}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-blue-500" /> Action Required</CardTitle>
            <CardDescription>Items waiting for your review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : (
              <div className="grid gap-2">
                {actions.pendingClaims > 0 && (
                   <Button variant="outline" className="justify-between" onClick={() => navigate('/expense-claims')}>
                       <span className="flex items-center gap-2"><Coins className="h-4 w-4" /> Expense Claims</span>
                       <Badge variant="destructive">{actions.pendingClaims}</Badge>
                   </Button>
                )}
                {actions.draftInvoices > 0 && (
                   <Button variant="outline" className="justify-between" onClick={() => navigate('/invoices?status=draft')}>
                       <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Draft Invoices</span>
                       <Badge variant="secondary">{actions.draftInvoices}</Badge>
                   </Button>
                )}
                {actions.openBills > 0 && (
                   <Button variant="outline" className="justify-between" onClick={() => navigate('/bills')}>
                       <span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Unpaid Bills</span>
                       <Badge variant="secondary">{actions.openBills}</Badge>
                   </Button>
                )}
                {actions.expiringQuotes > 0 && (
                   <Button variant="outline" className="justify-between" onClick={() => navigate('/quotes')}>
                       <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Expiring Quotes</span>
                       <Badge variant="destructive">{actions.expiringQuotes}</Badge>
                   </Button>
                )}
                {Object.values(actions).every(v => v === 0) && <p className="text-sm text-muted-foreground text-center py-4">No pending actions. You're all caught up!</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-orange-500" /> Recent Activity</CardTitle>
            <CardDescription>The latest transactions and entries across your company.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : (
              <div className="space-y-4">
                {recentActivity.length > 0 ? recentActivity.map((activity: any) => (
                  <div key={activity.id} className="flex items-start justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium leading-none">{activity.description || 'Journal Entry'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(activity.entry_date), 'MMM d, yyyy')}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">recorded {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}</p>
                  </div>
                )) : <p className="text-sm text-muted-foreground text-center py-4">No recent activity recorded.</p>}
                <Button asChild variant="ghost" className="w-full text-xs h-8"><Link to="/journal-entries">View All Transactions</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
        <BankAccountsSummary accounts={accounts} isLoading={isLoading} />
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Overdue Invoices</CardTitle><CardDescription>Invoices past their due date.</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              overdueInvoices && overdueInvoices.length > 0 ? (
                <ul className="space-y-3">
                  {overdueInvoices.map((invoice: OverdueInvoice) => (
                    <li key={invoice.id}>
                      <Link to={`/invoices/${invoice.id}`} className="block p-2 -m-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                        <div className="flex justify-between items-center text-sm"><span className="font-medium">{invoice.customer_name}</span><span className="font-mono">{formatCurrency(invoice.total)}</span></div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground"><span>#{invoice.invoice_number}</span><span className="text-red-500">Due {formatDistanceToNow(new Date(invoice.due_date), { addSuffix: true })}</span></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (<p className="text-sm text-muted-foreground text-center py-8">No overdue invoices.</p>)
            )}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Top Expenses</CardTitle><CardDescription>Spending for the current period.</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[300px] w-full" /> : <TopExpensesChart data={topExpenses} />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Top Customers</CardTitle><CardDescription>Highest revenue by customer.</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[300px] w-full" /> : <TopCustomersChart data={topCustomers} />}</CardContent></Card>
      </div>
      <BudgetStatus />
    </div>
  );
};

export default Dashboard;