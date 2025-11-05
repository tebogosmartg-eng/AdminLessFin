import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Account } from './ChartOfAccounts';
import { Landmark, TrendingUp, TrendingDown, Scale, Wallet } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';

const Dashboard = () => {
  const { user, profile } = useAuth();

  const fetchAccounts = async () => {
    const { data, error } = await supabase.from('chart_of_accounts').select('*');
    if (error) throw new Error(error.message);
    return data as Account[];
  };

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  const calculateTotals = (accounts: Account[] | undefined) => {
    if (!accounts) {
      return { assets: 0, liabilities: 0, equity: 0, income: 0, expenses: 0, netIncome: 0 };
    }

    const totals = accounts.reduce((acc, account) => {
      const type = account.type.toLowerCase() as keyof typeof acc;
      acc[type] = (acc[type] || 0) + account.balance;
      return acc;
    }, { asset: 0, liability: 0, equity: 0, income: 0, expense: 0 });

    const netIncome = totals.income - totals.expense;

    return { 
      assets: totals.asset, 
      liabilities: totals.liability, 
      equity: totals.equity, 
      netIncome 
    };
  };

  const totals = calculateTotals(accounts);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

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
      <main>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-3/4" />
                ) : (
                  <div className={`text-2xl font-bold ${card.color || ''}`}>
                    {formatCurrency(card.value)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-md text-gray-600 dark:text-gray-400">Here's a quick look at your company's financial health. More detailed reports are coming soon!</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;