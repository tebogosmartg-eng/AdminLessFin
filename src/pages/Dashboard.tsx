import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Account } from './ChartOfAccounts';
import { Landmark, TrendingUp, TrendingDown, Scale, Wallet } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import IncomeExpenseChart from '../components/IncomeExpenseChart';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';

const Dashboard = () => {
  const { user, profile } = useAuth();

  const { data: accounts, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*');
      if (error) throw new Error(error.message);
      return data as Account[];
    },
  });

  const { data: monthlySummary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['monthlySummary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_monthly_summary', { p_months: 6 });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: arBalances, isLoading: isLoadingAr } = useQuery({
    queryKey: ['customer_ar_balances'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_ar_balances');
      if (error) throw new Error(error.message);
      return data;
    }
  });

  const { data: apBalances, isLoading: isLoadingAp } = useQuery({
    queryKey: ['vendor_ap_balances'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_vendor_ap_balances');
      if (error) throw new Error(error.message);
      return data;
    }
  });

  const calculateTotals = (accounts: Account[] | undefined) => {
    if (!accounts) return { assets: 0, liabilities: 0, equity: 0, netIncome: 0 };
    const totals = accounts.reduce((acc, account) => {
      const type = account.type.toLowerCase() as keyof typeof acc;
      acc[type] = (acc[type] || 0) + account.balance;
      return acc;
    }, { asset: 0, liability: 0, equity: 0, income: 0, expense: 0 });
    return { assets: totals.asset, liabilities: totals.liability, equity: totals.equity, netIncome: totals.income - totals.expense };
  };

  const totals = calculateTotals(accounts);
  const totalAr = arBalances?.reduce((sum, item) => sum + item.balance, 0) || 0;
  const totalAp = apBalances?.reduce((sum, item) => sum + item.balance, 0) || 0;

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const summaryCards = [
    { title: 'Total Assets', value: totals.assets, icon: Wallet },
    { title: 'Total Liabilities', value: totals.liabilities, icon: Landmark },
    { title: 'Total Equity', value: totals.equity, icon: Scale },
    { title: 'Net Income', value: totals.netIncome, icon: totals.netIncome >= 0 ? TrendingUp : TrendingDown, color: totals.netIncome >= 0 ? 'text-green-600' : 'text-red-600' },
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Welcome back, {profile?.full_name || user?.email}!</p>
      </header>
      <main className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoadingAccounts ? <Skeleton className="h-8 w-3/4" /> : <div className={`text-2xl font-bold ${card.color || ''}`}>{formatCurrency(card.value)}</div>}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Accounts Receivable</CardTitle>
              <CardDescription>Money owed to you by customers.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAr ? <Skeleton className="h-24 w-full" /> : (
                <>
                  <div className="text-2xl font-bold">{formatCurrency(totalAr)}</div>
                  <p className="text-xs text-muted-foreground">Total outstanding balance</p>
                  <div className="mt-4 space-y-2">
                    {arBalances && arBalances.length > 0 ? (
                      arBalances.slice(0, 3).map(item => (
                        <div key={item.customer_id} className="flex justify-between items-center text-sm"><span>{item.customer_name}</span><span className="font-mono">{formatCurrency(item.balance)}</span></div>
                      ))
                    ) : <p className="text-sm text-muted-foreground">No outstanding invoices.</p>}
                  </div>
                  {arBalances && arBalances.length > 0 && <Button asChild variant="link" className="px-0 mt-2 h-auto py-0"><Link to="/receive-payments">View all and receive payments</Link></Button>}
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accounts Payable</CardTitle>
              <CardDescription>Money you owe to vendors.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAp ? <Skeleton className="h-24 w-full" /> : (
                <>
                  <div className="text-2xl font-bold">{formatCurrency(totalAp)}</div>
                  <p className="text-xs text-muted-foreground">Total outstanding balance</p>
                  <div className="mt-4 space-y-2">
                    {apBalances && apBalances.length > 0 ? (
                      apBalances.slice(0, 3).map(item => (
                        <div key={item.vendor_id} className="flex justify-between items-center text-sm"><span>{item.vendor_name}</span><span className="font-mono">{formatCurrency(item.balance)}</span></div>
                      ))
                    ) : <p className="text-sm text-muted-foreground">No outstanding bills.</p>}
                  </div>
                  {apBalances && apBalances.length > 0 && <Button asChild variant="link" className="px-0 mt-2 h-auto py-0"><Link to="/pay-bills">View all and pay bills</Link></Button>}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
            <CardDescription>Income vs. Expenses for the last 6 months.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-[300px] w-full" /> : monthlySummary && monthlySummary.length > 0 ? <IncomeExpenseChart data={monthlySummary} /> : <p className="text-md text-gray-600 dark:text-gray-400">Not enough data to display a chart. Create some income and expense journal entries to get started.</p>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;