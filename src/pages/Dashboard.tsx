import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Account } from './ChartOfAccounts';
import { Landmark, TrendingUp, TrendingDown, Wallet, DollarSign, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
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

type OverdueInvoice = {
  id: string;
  invoice_number: string;
  due_date: string;
  customer_name: string;
  total: number;
};

type LowStockItem = {
  id: string;
  name: string;
  quantity_on_hand: number;
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

  const { data: dashboardData, isLoading } = useQuery({
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
  });

  const {
    accounts,
    monthlySummary,
    arBalances,
    apBalances,
    overdueInvoices,
    topExpenses,
    topCustomers,
    cashFlowForecast,
    lowStockItems,
  } = dashboardData || {};

  const calculateTotals = (accounts: Account[] | undefined) => {
    if (!accounts) return { assets: 0, liabilities: 0, netIncome: 0, cash: 0 };
    
    const bankAccountKeywords = ['cash', 'bank', 'checking', 'savings'];

    const totals = accounts.reduce((acc, account) => {
      const type = account.type.toLowerCase() as keyof typeof acc;
      acc[type] = (acc[type] || 0) + account.balance;

      if (account.type === 'Asset' && bankAccountKeywords.some(keyword => account.name.toLowerCase().includes(keyword))) {
          acc.cash = (acc.cash || 0) + account.balance;
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

  return (
    <div>
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date range</span>
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
      </header>
      
      <main className="space-y-6">
        {lowStockItems && lowStockItems.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Low Stock Alert</AlertTitle>
            <AlertDescription className="mt-2">
              The following items are running low on stock:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {lowStockItems.map((item: LowStockItem) => (
                  <li key={item.id}>
                    <span className="font-medium">{item.name}</span>: {item.quantity_on_hand} remaining
                  </li>
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
            <Card 
              key={index} 
              className="cursor-pointer transition-colors hover:bg-muted/50" 
              onClick={() => navigate(card.link)}
            >
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

        {/* Charts Row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cash Flow Forecast (30 Days)</CardTitle>
              <CardDescription>Projected balance based on due invoices and bills.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-[300px] w-full" /> : <CashFlowForecastChart data={cashFlowForecast} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Income vs Expenses Trend</CardTitle>
              <CardDescription>6-month trend analysis.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-[300px] w-full" /> : monthlySummary && monthlySummary.length > 0 ? <IncomeExpenseChart data={monthlySummary} /> : <p className="text-md text-gray-600 dark:text-gray-400">Not enough data to display a chart.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/invoices?status=unpaid')}>
            <CardHeader>
              <CardTitle>Accounts Receivable</CardTitle>
              <CardDescription>Money owed to you by customers.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-24 w-full" /> : (
                <>
                  <div className="text-2xl font-bold">{formatCurrency(totalAr)}</div>
                  <p className="text-xs text-muted-foreground">Total outstanding balance</p>
                  <div className="mt-4 space-y-2">
                    {arBalances && arBalances.length > 0 ? (
                      arBalances.slice(0, 3).map((item: { customer_id: string, customer_name: string, balance: number }) => (
                        <div key={item.customer_id} className="flex justify-between items-center text-sm"><span>{item.customer_name}</span><span className="font-mono">{formatCurrency(item.balance)}</span></div>
                      ))
                    ) : <p className="text-sm text-muted-foreground">No outstanding invoices.</p>}
                  </div>
                  {arBalances && arBalances.length > 0 && <Button asChild variant="link" className="px-0 mt-2 h-auto py-0"><Link to="/receive-payments">View all and receive payments</Link></Button>}
                </>
              )}
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/bills?status=open')}>
            <CardHeader>
              <CardTitle>Accounts Payable</CardTitle>
              <CardDescription>Money you owe to vendors.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-24 w-full" /> : (
                <>
                  <div className="text-2xl font-bold">{formatCurrency(totalAp)}</div>
                  <p className="text-xs text-muted-foreground">Total outstanding balance</p>
                  <div className="mt-4 space-y-2">
                    {apBalances && apBalances.length > 0 ? (
                      apBalances.slice(0, 3).map((item: { vendor_id: string, vendor_name: string, balance: number }) => (
                        <div key={item.vendor_id} className="flex justify-between items-center text-sm"><span>{item.vendor_name}</span><span className="font-mono">{formatCurrency(item.balance)}</span></div>
                      ))
                    ) : <p className="text-sm text-muted-foreground">No outstanding bills.</p>}
                  </div>
                  {apBalances && apBalances.length > 0 && <Button asChild variant="link" className="px-0 mt-2 h-auto py-0"><Link to="/pay-bills">View all and pay bills</Link></Button>}
                </>
              )}
            </CardContent>
          </Card>
          <BankAccountsSummary accounts={accounts} isLoading={isLoading} />
          
          <Card>
            <CardHeader>
              <CardTitle>Overdue Invoices</CardTitle>
              <CardDescription>Invoices past their due date.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-24 w-full" /> : (
                overdueInvoices && overdueInvoices.length > 0 ? (
                  <ul className="space-y-3">
                    {overdueInvoices.map((invoice: OverdueInvoice) => (
                      <li key={invoice.id}>
                        <Link to={`/invoices/${invoice.id}`} className="block p-2 -m-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-medium">{invoice.customer_name}</span>
                            <span className="font-mono">{formatCurrency(invoice.total)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-muted-foreground">
                            <span>#{invoice.invoice_number}</span>
                            <span className="text-red-500">Due {formatDistanceToNow(new Date(invoice.due_date), { addSuffix: true })}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No overdue invoices. Great job!</p>
                )
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Top Expenses</CardTitle>
              <CardDescription>
                {fromDate && toDate ? (
                  <>Spending from {format(fromDate, 'MMM d')} to {format(toDate, 'MMM d')}</>
                ) : 'Top spending categories'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-[300px] w-full" /> : <TopExpensesChart data={topExpenses} />}
            </CardContent>
          </Card>
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Top Customers</CardTitle>
              <CardDescription>
                Highest revenue by customer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-[300px] w-full" /> : <TopCustomersChart data={topCustomers} />}
            </CardContent>
          </Card>
        </div>
        <BudgetStatus />
      </main>
    </div>
  );
};

export default Dashboard;