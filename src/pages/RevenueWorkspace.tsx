import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  TrendingUp,
  FileText,
  Quote,
  HandCoins,
  Users,
  Repeat,
  ReceiptText,
  Clock,
  ArrowRight,
  PlusCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { revenueWorkspaceQuery } from '../lib/queries';
import { formatCurrency } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import TopCustomersChart from '../components/TopCustomersChart';
import MetricCard from '../components/metrics/MetricCard';
import MetricDrawer from '../components/metrics/MetricDrawer';
import InsightCard from '../components/metrics/InsightCard';
import ActionPanel from '../components/metrics/ActionPanel';
import RelatedRecords from '../components/metrics/RelatedRecords';
import {
  buildExpectedPayments,
  buildReceivablesAging,
  buildRevenueMetrics,
  buildSimpleRevenueInsights,
  collectionCalculationDetail,
  collectionExplanation,
  daysOverdueLabel,
  formatShortDate,
  type ArBalance,
  type ExpectedPaymentRaw,
  type OverdueInvoice,
  type TopCustomer,
} from '../lib/revenueIntelligence';
import { moduleDeepLinks } from '../lib/moduleDeepLinks';
import { showError, showSuccess } from '../utils/toast';

type DrawerId = 'revenue' | 'receivables' | 'overdue' | 'expected' | 'collection' | null;

const VALID: Set<string> = new Set(['revenue', 'receivables', 'overdue', 'expected', 'collection']);

function sendReminder(opts: {
  email?: string | null;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
}) {
  if (!opts.email) {
    showError('No email on file for this customer.');
    return;
  }
  const subject = encodeURIComponent(`Payment reminder — Invoice ${opts.invoiceNumber}`);
  const body = encodeURIComponent(
    `Hi ${opts.customerName},\n\nFriendly reminder that invoice ${opts.invoiceNumber} for ${formatCurrency(opts.amount)} was due on ${opts.dueDate}.\n\nThank you.`,
  );
  window.location.href = `mailto:${opts.email}?subject=${subject}&body=${body}`;
  showSuccess('Opening your email…');
}

const RevenueWorkspace = () => {
  useDocumentTitle('Revenue');
  const { activeCompany } = useAuth();
  const { dateFrom, dateTo, isReady } = useReportingPeriod();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCalc, setShowCalc] = useState(false);

  const { data, isLoading } = useQuery({
    ...revenueWorkspaceQuery(activeCompany!.id, dateFrom ?? '', dateTo ?? ''),
    enabled: !!activeCompany && isReady,
  });

  const drawerParam = searchParams.get('drawer') || searchParams.get('drilldown');
  const activeDrawer: DrawerId =
    drawerParam && VALID.has(drawerParam) ? (drawerParam as Exclude<DrawerId, null>) : null;

  const setDrawer = useCallback(
    (id: DrawerId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('drilldown');
          if (id) next.set('drawer', id);
          else next.delete('drawer');
          return next;
        },
        { replace: true },
      );
      if (id !== 'collection') setShowCalc(false);
    },
    [setSearchParams],
  );

  const arBalances: ArBalance[] = data?.arBalances || [];
  const overdueInvoices: OverdueInvoice[] = data?.overdueInvoices || [];
  const topCustomers: TopCustomer[] = data?.topCustomers || [];
  const cashFlowForecast = data?.cashFlowForecast || [];
  const actions = data?.actions || { draftInvoices: 0, expiringQuotes: 0 };
  const expectedRaw: ExpectedPaymentRaw[] = data?.expectedPayments || [];

  const cfaReceivables = Number(data?.canonicalAggregation?.receivables ?? data?.statementTotals?.receivables ?? 0);
  const cfaIncome = Number(
    typeof data?.periodRevenue === 'number'
      ? data.periodRevenue
      : (data?.canonicalAggregation?.totalIncome ?? data?.statementTotals?.totalIncome ?? 0),
  );
  const cfaNetCash = Number(data?.canonicalAggregation?.netCashFlow ?? data?.statementTotals?.netCashFlow ?? 0);
  const metrics = useMemo(
    () =>
      buildRevenueMetrics({
        arBalances,
        overdueInvoices,
        periodRevenue: cfaIncome,
        cashFlowForecast,
        receivables: cfaReceivables,
        expectedReceipts: Math.max(0, cfaNetCash),
      }),
    [arBalances, overdueInvoices, cfaIncome, cashFlowForecast, cfaReceivables, cfaNetCash],
  );

  const expectedRows = useMemo(() => buildExpectedPayments(expectedRaw), [expectedRaw]);
  const aging = useMemo(
    () => buildReceivablesAging(arBalances, overdueInvoices),
    [arBalances, overdueInvoices],
  );

  const insights = useMemo(
    () =>
      buildSimpleRevenueInsights({
        metrics,
        overdueInvoices,
        expectedPaymentRows: expectedRows,
        draftInvoices: actions.draftInvoices || 0,
      }).map((insight) => ({
        ...insight,
        onAction: insight.drawerId
          ? () => setDrawer(insight.drawerId as Exclude<DrawerId, null>)
          : undefined,
      })),
    [metrics, overdueInvoices, expectedRows, actions.draftInvoices, setDrawer],
  );

  const workflowLinks = [
    { to: '/quotes', label: 'Quotes', icon: Quote, description: 'Send a proposal' },
    { to: '/invoices', label: 'Invoices', icon: FileText, description: 'Bill a customer' },
    { to: '/receive-payments', label: 'Get paid', icon: HandCoins, description: 'Record a payment' },
    { to: '/credit-notes', label: 'Credit notes', icon: ReceiptText, description: 'Issue a credit' },
    { to: '/recurring-invoices', label: 'Recurring', icon: Repeat, description: 'Automate billing' },
    { to: '/customers', label: 'Customers', icon: Users, description: 'Manage contacts' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Expected receipts KPI = CFA only (no expected-row money sum).
  const expectedTotal = metrics.expectedPayments;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <TrendingUp className="h-8 w-8 text-primary" />
            Revenue
          </h1>
          <p className="mt-1 text-muted-foreground">
            See what you’ve earned, who’s owed you, and what to do next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/invoices')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New invoice
          </Button>
          <Button variant="outline" onClick={() => navigate('/quotes')}>
            <Quote className="mr-2 h-4 w-4" />
            New quote
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Revenue (period)"
          value={formatCurrency(metrics.revenueThisMonth)}
          hint="Same Income Statement total as Reports"
          onClick={() => setDrawer('revenue')}
        />
        <MetricCard
          label="Outstanding receivables"
          value={formatCurrency(metrics.totalAr)}
          hint="Money customers still owe"
          onClick={() => setDrawer('receivables')}
        />
        <MetricCard
          label="Overdue amount"
          value={formatCurrency(metrics.overdueTotal)}
          hint={metrics.overdueTotal > 0 ? 'Needs follow-up' : 'All clear'}
          destructive={metrics.overdueTotal > 0}
          onClick={() => setDrawer('overdue')}
        />
        <MetricCard
          label="Expected payments"
          value={formatCurrency(expectedTotal)}
          hint="Due in the next 30 days"
          onClick={() => setDrawer('expected')}
        />
        <MetricCard
          label="Collection rate"
          value={`${metrics.collectionRate}%`}
          hint="How much you’ve collected"
          onClick={() => setDrawer('collection')}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => setDrawer('overdue')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Awaiting payment</CardDescription>
            <CardTitle className="text-xl">
              {overdueInvoices.length + arBalances.filter((c) => c.balance > 0).length} accounts
            </CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => navigate('/invoices?status=draft')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Draft invoices</CardDescription>
            <CardTitle className="flex items-center gap-2 text-xl">
              {actions.draftInvoices}
              {actions.draftInvoices > 0 && <Badge variant="secondary">Send these</Badge>}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => navigate('/quotes')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Quotes expiring soon</CardDescription>
            <CardTitle className="flex items-center gap-2 text-xl">
              {actions.expiringQuotes}
              {actions.expiringQuotes > 0 && <Badge variant="destructive">Expiring</Badge>}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => navigate('/recurring-invoices')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Recurring revenue</CardDescription>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              Manage
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <InsightCard insights={insights} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Overdue invoices</CardTitle>
              <CardDescription>These customers are past their due date.</CardDescription>
            </div>
            {overdueInvoices.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setDrawer('overdue')}>
                View all
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {overdueInvoices.length > 0 ? (
              <ul className="space-y-3">
                {overdueInvoices.slice(0, 5).map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      to={moduleDeepLinks.invoice(invoice.id)}
                      className="-mx-3 flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted"
                    >
                      <div>
                        <p className="font-medium">{invoice.customer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          #{invoice.invoice_number} · Due{' '}
                          {formatDistanceToNow(new Date(invoice.due_date), { addSuffix: true })}
                        </p>
                      </div>
                      <span className="font-mono font-semibold text-destructive">
                        {formatCurrency(invoice.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No overdue invoices — nice work.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customers to watch</CardTitle>
            <CardDescription>Highest amounts still owed.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.customersAtRisk.length > 0 ? (
              <ul className="space-y-3">
                {metrics.customersAtRisk.map((customer) => (
                  <li key={customer.customer_id}>
                    <Link
                      to={moduleDeepLinks.customer(customer.customer_id)}
                      className="-mx-2 flex items-center justify-between rounded-md p-2 transition-colors hover:bg-muted"
                    >
                      <span className="truncate pr-2 text-sm font-medium">{customer.customer_name}</span>
                      <span className="shrink-0 font-mono text-sm text-destructive">
                        {formatCurrency(customer.balance)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Everyone is paid up.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {topCustomers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top customers</CardTitle>
              <CardDescription>Who earned you the most this month.</CardDescription>
            </CardHeader>
            <CardContent>
              <TopCustomersChart data={topCustomers} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
            <CardDescription>Jump to the next step in your sales workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {workflowLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <link.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                </Link>
              ))}
            </div>
            <RelatedRecords
              label="Also useful"
              records={[
                { id: 'ar', label: 'All unpaid invoices', to: moduleDeepLinks.accountsReceivable() },
                { id: 'pay', label: 'Record a payment', to: moduleDeepLinks.receivePayments() },
                { id: 'bank', label: 'Bank reconciliation', to: moduleDeepLinks.bankAllocation() },
                { id: 'reports', label: 'Reports', to: '/reports' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.recentActivity || []).length > 0 ? (
            <ul className="space-y-2">
              {(data.recentActivity as { id: string; description: string; entry_date: string }[])
                .slice(0, 5)
                .map((entry) => (
                  <li key={entry.id} className="flex justify-between border-b py-2 text-sm last:border-0">
                    <span className="truncate pr-4">{entry.description}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {format(new Date(entry.entry_date), 'MMM d')}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing recent yet.</p>
          )}
        </CardContent>
      </Card>

      {/* —— Drawers —— */}
      <MetricDrawer
        open={activeDrawer === 'revenue'}
        onOpenChange={(open) => !open && setDrawer(null)}
        title="Revenue (period)"
        description="Period revenue matches the Income Statement. Top customers below are a subset for drill-down."
        footer={
          <Button variant="outline" className="w-full" onClick={() => navigate('/invoices')}>
            View all invoices
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      >
        {topCustomers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customer-tagged sales in this period yet.</p>
        ) : (
          <ul className="space-y-2">
            {topCustomers.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
              >
                <span className="font-medium">{c.name}</span>
                <span className="font-mono text-sm">{formatCurrency(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </MetricDrawer>

      <MetricDrawer
        open={activeDrawer === 'receivables'}
        onOpenChange={(open) => !open && setDrawer(null)}
        title="Outstanding receivables"
        description="Who owes you, grouped by how late the balance is."
        footer={
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(moduleDeepLinks.receivePayments())}
          >
            Record a payment
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      >
        <p className="mb-4 text-2xl font-semibold">{formatCurrency(metrics.totalAr)}</p>
        <div className="space-y-5">
          {aging.map((bucket) => (
            <div key={bucket.id}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">{bucket.label}</p>
                <p className="font-mono text-sm text-muted-foreground">
                  {formatCurrency(bucket.total)}
                </p>
              </div>
              {bucket.customers.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-1">
                  {bucket.customers.map((cust) => (
                    <li key={`${bucket.id}-${cust.customer_id}`}>
                      <Link
                        to={moduleDeepLinks.customer(cust.customer_id)}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span>{cust.customer_name}</span>
                        <span className="font-mono">{formatCurrency(cust.balance)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </MetricDrawer>

      <MetricDrawer
        open={activeDrawer === 'overdue'}
        onOpenChange={(open) => !open && setDrawer(null)}
        title="Overdue amount"
        description="Invoices past their due date."
        footer={
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(moduleDeepLinks.invoices({ status: 'sent' }))}
          >
            View all invoices
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      >
        <p className="mb-1 text-2xl font-semibold text-destructive">
          {formatCurrency(metrics.overdueTotal)}
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          {overdueInvoices.length} invoice{overdueInvoices.length === 1 ? '' : 's'} overdue
        </p>
        {overdueInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing overdue.</p>
        ) : (
          <ul className="space-y-3">
            {overdueInvoices.map((inv) => {
              const days = daysOverdueLabel(inv.due_date);
              return (
                <li key={inv.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{inv.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        #{inv.invoice_number} · {days} day{days === 1 ? '' : 's'} overdue
                      </p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-destructive">
                      {formatCurrency(inv.total)}
                    </span>
                  </div>
                  <ActionPanel
                    className="mt-2"
                    actions={[
                      {
                        id: 'open',
                        label: 'Open invoice',
                        onClick: () => navigate(moduleDeepLinks.invoice(inv.id)),
                      },
                      {
                        id: 'remind',
                        label: 'Send reminder',
                        onClick: () =>
                          sendReminder({
                            email: inv.email,
                            customerName: inv.customer_name,
                            invoiceNumber: inv.invoice_number,
                            amount: inv.total,
                            dueDate: formatShortDate(inv.due_date),
                          }),
                      },
                      {
                        id: 'pay',
                        label: 'Record payment',
                        variant: 'default',
                        onClick: () => navigate(moduleDeepLinks.receivePayments()),
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </MetricDrawer>

      <MetricDrawer
        open={activeDrawer === 'expected'}
        onOpenChange={(open) => !open && setDrawer(null)}
        title="Expected payments"
        description="Invoices due in the next 30 days."
        footer={
          <Button variant="outline" className="w-full" onClick={() => navigate('/invoices')}>
            View all invoices
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      >
        <p className="mb-4 text-2xl font-semibold">{formatCurrency(expectedTotal)}</p>
        {expectedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invoices due in the next 30 days.
          </p>
        ) : (
          <ul className="space-y-3">
            {expectedRows.map((row) => (
              <li key={row.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      #{row.invoice_number} · Due {formatShortDate(row.due_date)}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold">
                    {formatCurrency(row.amount)}
                  </span>
                </div>
                <ActionPanel
                  className="mt-2"
                  actions={[
                    {
                      id: 'open',
                      label: 'Open invoice',
                      onClick: () => navigate(moduleDeepLinks.invoice(row.id)),
                    },
                    {
                      id: 'pay',
                      label: 'Record payment',
                      variant: 'default',
                      onClick: () => navigate(moduleDeepLinks.receivePayments()),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </MetricDrawer>

      <MetricDrawer
        open={activeDrawer === 'collection'}
        onOpenChange={(open) => !open && setDrawer(null)}
        title="Collection rate"
        description="How much of this month’s sales you’ve collected."
        footer={
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(moduleDeepLinks.receivePayments())}
          >
            Record a payment
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      >
        <p className="mb-2 text-3xl font-semibold">{metrics.collectionRate}%</p>
        <p className="text-sm text-foreground">
          {collectionExplanation(metrics.collectionRate, overdueInvoices.length)}
        </p>
        <button
          type="button"
          className="mt-4 flex items-center gap-1 text-sm text-primary hover:underline"
          onClick={() => setShowCalc((v) => !v)}
        >
          How is this calculated?
          {showCalc ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showCalc && (
          <p className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            {collectionCalculationDetail(metrics)}
          </p>
        )}
      </MetricDrawer>
    </div>
  );
};

export default RevenueWorkspace;
