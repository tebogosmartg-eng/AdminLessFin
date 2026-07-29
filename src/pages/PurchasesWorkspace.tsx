import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, formatDistanceToNow, addDays, isBefore, isWithinInterval } from 'date-fns';
import {
  Wallet,
  AlertTriangle,
  Receipt,
  ShoppingBag,
  Banknote,
  Store,
  Repeat,
  TicketMinus,
  Clock,
  ArrowRight,
  PlusCircle,
  Camera,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { purchasesWorkspaceQuery } from '../lib/queries';
import { formatCurrency } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';

type ApBalance = { vendor_id: string; vendor_name: string; balance: number };
type OpenBill = {
  id: string;
  due_date?: string;
  bill_number?: string | null;
  vendors?: { name: string }[] | null;
  total: number;
};

const PurchasesWorkspace = () => {
  useDocumentTitle('Purchases');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();

  const dateFrom = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const dateTo = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    ...purchasesWorkspaceQuery(activeCompany!.id, dateFrom, dateTo),
    enabled: !!activeCompany,
  });

  const apBalances: ApBalance[] = data?.apBalances || [];
  const openBills: OpenBill[] = data?.openBillsList || [];
  const purchaseOrders: { id: string; po_number: string; status: string; vendors?: { name: string } }[] =
    data?.purchaseOrders || [];
  const recurringBills: { id: string; profile_name: string; next_run_date: string; status: string }[] =
    data?.recurringBills || [];
  const topExpenses = data?.topExpenses || [];
  const cashFlowForecast = data?.cashFlowForecast || [];
  const actions = data?.actions || { openBills: 0 };

  const today = new Date();
  const weekEnd = addDays(today, 7);

  const metrics = useMemo(() => {
    const totalAp = apBalances.reduce((sum, item) => sum + item.balance, 0);

    const overdueBills = openBills.filter(
      (bill) => bill.due_date && isBefore(new Date(bill.due_date), today)
    );
    const overdueTotal = overdueBills.reduce((sum, bill) => sum + bill.total, 0);

    const dueToday = openBills.filter(
      (bill) => bill.due_date && format(new Date(bill.due_date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    );
    const dueThisWeek = openBills.filter(
      (bill) =>
        bill.due_date &&
        isWithinInterval(new Date(bill.due_date), { start: today, end: weekEnd })
    );
    const cashRequiredWeek = dueThisWeek.reduce((sum, bill) => sum + bill.total, 0);

    const cashOutflow30d = cashFlowForecast.reduce(
      (sum: number, point: { balance: number }, index: number) => {
        if (index === 0) return sum;
        const change = point.balance - cashFlowForecast[index - 1].balance;
        return sum + (change < 0 ? Math.abs(change) : 0);
      },
      0
    );

    const posAwaitingBilling = purchaseOrders.filter(
      (po) => po.status === 'sent' || po.status === 'draft'
    ).length;

    const upcomingRecurring = recurringBills.filter((p) => p.status === 'active').length;

    const topSuppliers = [...apBalances]
      .filter((v) => v.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    const spendThisMonth = topExpenses.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);

    return {
      totalAp,
      overdueTotal,
      overdueCount: overdueBills.length,
      overdueBills,
      dueTodayCount: dueToday.length,
      dueThisWeekCount: dueThisWeek.length,
      cashRequiredWeek,
      cashOutflow30d,
      posAwaitingBilling,
      upcomingRecurring,
      topSuppliers,
      spendThisMonth,
      openBillCount: actions.openBills || openBills.length,
    };
  }, [apBalances, openBills, purchaseOrders, recurringBills, cashFlowForecast, actions, today, weekEnd]);

  const workflowLinks = [
    { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingBag, description: 'Commit spend before billing' },
    { to: '/bills', label: 'Bills', icon: Receipt, description: 'Record supplier invoices' },
    { to: '/pay-bills', label: 'Pay Bills', icon: Banknote, description: 'Settle accounts payable' },
    { to: '/vendor-credits', label: 'Vendor Credits', icon: TicketMinus, description: 'Apply credits and adjustments' },
    { to: '/recurring-bills', label: 'Recurring Bills', icon: Repeat, description: 'Automate regular obligations' },
    { to: '/vendors', label: 'Vendors', icon: Store, description: 'Manage supplier relationships' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-8 w-8 text-primary" />
            Spend Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Control, understand, and forecast every Rand leaving your business.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/purchases/quick-capture')}>
            <Camera className="mr-2 h-4 w-4" />
            Quick Capture
          </Button>
          <Button onClick={() => navigate('/bills')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Record Bill
          </Button>
          <Button variant="outline" onClick={() => navigate('/purchase-orders')}>
            <ShoppingBag className="mr-2 h-4 w-4" />
            New Purchase Order
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding Payables</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(metrics.totalAp)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={metrics.overdueTotal > 0 ? 'border-destructive/50' : ''}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              {metrics.overdueTotal > 0 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              Overdue Bills
            </CardDescription>
            <CardTitle className={`text-2xl ${metrics.overdueTotal > 0 ? 'text-destructive' : ''}`}>
              {formatCurrency(metrics.overdueTotal)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash Required (7 days)</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(metrics.cashRequiredWeek)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Spend This Month</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(metrics.spendThisMonth)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Projected Outflow (30 days)</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(metrics.cashOutflow30d)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => navigate('/bills?status=open')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Bills Awaiting Payment</CardDescription>
            <CardTitle className="text-xl">{metrics.openBillCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => navigate('/bills?overdue=true')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Late Payments</CardDescription>
            <CardTitle className="text-xl flex items-center gap-2">
              {metrics.overdueCount}
              {metrics.overdueCount > 0 && <Badge variant="destructive">Overdue</Badge>}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => navigate('/purchase-orders')}
        >
          <CardHeader className="pb-2">
            <CardDescription>POs Awaiting Billing</CardDescription>
            <CardTitle className="text-xl flex items-center gap-2">
              {metrics.posAwaitingBilling}
              {metrics.posAwaitingBilling > 0 && <Badge variant="secondary">Action needed</Badge>}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => navigate('/recurring-bills')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Active Recurring Bills</CardDescription>
            <CardTitle className="text-xl flex items-center gap-2">
              {metrics.upcomingRecurring}
              <Repeat className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Overdue Bills</CardTitle>
            <CardDescription>Prioritise payments to protect supplier relationships.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.overdueBills.length > 0 ? (
              <ul className="space-y-3">
                {metrics.overdueBills.slice(0, 6).map((bill) => (
                  <li key={bill.id}>
                    <Link
                      to="/bills?status=open"
                      className="flex items-center justify-between p-3 -mx-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium">{bill.vendors?.[0]?.name ?? 'Unknown vendor'}</p>
                        <p className="text-sm text-muted-foreground">
                          #{bill.bill_number ?? '—'} · Due{' '}
                          {bill.due_date
                            ? formatDistanceToNow(new Date(bill.due_date), { addSuffix: true })
                            : '—'}
                        </p>
                      </div>
                      <span className="font-mono font-semibold text-destructive">
                        {formatCurrency(bill.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No overdue bills. Well managed!</p>
            )}
            {metrics.overdueBills.length > 0 && (
              <Button variant="link" className="mt-2 px-0" onClick={() => navigate('/pay-bills')}>
                Go to Pay Bills <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Suppliers</CardTitle>
            <CardDescription>Highest outstanding balances.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.topSuppliers.length > 0 ? (
              <ul className="space-y-3">
                {metrics.topSuppliers.map((vendor) => (
                  <li key={vendor.vendor_id}>
                    <Link
                      to={`/vendors/${vendor.vendor_id}`}
                      className="flex justify-between items-center p-2 -mx-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <span className="text-sm font-medium truncate pr-2">{vendor.vendor_name}</span>
                      <span className="font-mono text-sm text-destructive shrink-0">
                        {formatCurrency(vendor.balance)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No outstanding vendor balances.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Procurement Lifecycle</CardTitle>
          <CardDescription>Navigate the complete purchasing workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {workflowLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <link.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">{link.label}</p>
                  <p className="text-xs text-muted-foreground">{link.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.recentActivity || []).length > 0 ? (
            <ul className="space-y-2">
              {(data.recentActivity as { id: string; description: string; entry_date: string }[])
                .slice(0, 5)
                .map((entry) => (
                  <li key={entry.id} className="flex justify-between text-sm py-2 border-b last:border-0">
                    <span className="truncate pr-4">{entry.description}</span>
                    <span className="text-muted-foreground shrink-0">
                      {format(new Date(entry.entry_date), 'MMM d')}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No recent journal activity.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PurchasesWorkspace;
