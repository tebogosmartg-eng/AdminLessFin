import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { formatCurrency, cn } from '../lib/utils';
import {
  Sparkles,
  AlertTriangle,
  PackageOpen,
  FileText,
  Receipt,
  Coins,
  TrendingDown,
  CheckCircle2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

type Tone = 'danger' | 'warning' | 'info' | 'success';

interface Insight {
  id: string;
  icon: LucideIcon;
  tone: Tone;
  text: React.ReactNode;
  cta?: { label: string; to: string };
}

interface DashboardInsightsProps {
  isLoading: boolean;
  overdueInvoices: { total: number }[];
  lowStockItems: unknown[];
  actions: { pendingClaims: number; draftPayrollRuns?: number; draftInvoices: number; openBills: number; expiringQuotes: number };
  totalAr: number;
  totalAp: number;
  netIncome: number;
}

const TONE_STYLES: Record<Tone, string> = {
  danger: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-warning-foreground',
  info: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
};

const SEVERITY: Record<Tone, number> = { danger: 0, warning: 1, info: 2, success: 3 };

/**
 * Surfaces the most important things needing attention, derived entirely from
 * data already on the dashboard — no fabricated numbers, no extra fetches.
 * This is the "intelligent" layer: it reads the books and tells you what matters.
 */
function buildInsights({
  overdueInvoices,
  lowStockItems,
  actions,
  totalAr,
  totalAp,
  netIncome,
}: Omit<DashboardInsightsProps, 'isLoading'>): Insight[] {
  const insights: Insight[] = [];

  if (overdueInvoices.length > 0) {
    // Money figure = CFA receivables (totalAr), not invoice-row reduce.
    insights.push({
      id: 'overdue',
      icon: AlertTriangle,
      tone: 'danger',
      text: (
        <>
          <strong>{overdueInvoices.length}</strong> overdue {overdueInvoices.length === 1 ? 'invoice' : 'invoices'}
          {totalAr > 0 ? (
            <>
              {' '}
              (AR <strong>{formatCurrency(totalAr)}</strong>)
            </>
          ) : null}{' '}
          {overdueInvoices.length === 1 ? 'needs' : 'need'} following up.
        </>
      ),
      cta: { label: 'Collect', to: '/receive-payments' },
    });
  }

  if (netIncome < 0) {
    insights.push({
      id: 'net-income',
      icon: TrendingDown,
      tone: 'warning',
      text: <>Expenses are outpacing income by <strong>{formatCurrency(Math.abs(netIncome))}</strong> this period.</>,
      cta: { label: 'Review', to: '/reports' },
    });
  }

  if (Array.isArray(lowStockItems) && lowStockItems.length > 0) {
    insights.push({
      id: 'low-stock',
      icon: PackageOpen,
      tone: 'warning',
      text: (
        <>
          <strong>{lowStockItems.length}</strong> {lowStockItems.length === 1 ? 'item is' : 'items are'} running low on stock.
        </>
      ),
      cta: { label: 'Restock', to: '/products' },
    });
  }

  if ((actions.draftPayrollRuns || 0) > 0) {
    insights.push({
      id: 'payroll',
      icon: Coins,
      tone: 'info',
      text: <><strong>{actions.draftPayrollRuns}</strong> payroll {actions.draftPayrollRuns === 1 ? 'run is' : 'runs are'} in draft and ready to process.</>,
      cta: { label: 'Process', to: '/payroll' },
    });
  }

  if (actions.pendingClaims > 0) {
    insights.push({
      id: 'claims',
      icon: Coins,
      tone: 'warning',
      text: <><strong>{actions.pendingClaims}</strong> expense {actions.pendingClaims === 1 ? 'claim is' : 'claims are'} awaiting your approval.</>,
      cta: { label: 'Approve', to: '/expense-claims' },
    });
  }

  if (actions.openBills > 0) {
    insights.push({
      id: 'open-bills',
      icon: Receipt,
      tone: 'warning',
      text: (
        <>
          <strong>{actions.openBills}</strong> open {actions.openBills === 1 ? 'bill is' : 'bills are'} awaiting payment.
        </>
      ),
      cta: { label: 'Pay', to: '/pay-bills' },
    });
  }

  if (totalAp > 0) {
    insights.push({
      id: 'ap',
      icon: Receipt,
      tone: 'info',
      text: <>You owe suppliers <strong>{formatCurrency(totalAp)}</strong> across open payables.</>,
      cta: { label: 'View', to: '/purchases' },
    });
  }

  if (actions.draftInvoices > 0) {
    insights.push({
      id: 'drafts',
      icon: FileText,
      tone: 'info',
      text: <><strong>{actions.draftInvoices}</strong> draft {actions.draftInvoices === 1 ? 'invoice hasn’t' : 'invoices haven’t'} been sent yet.</>,
      cta: { label: 'Send', to: '/invoices?status=draft' },
    });
  }

  if (totalAr > 0 && overdueInvoices.length === 0) {
    insights.push({
      id: 'ar',
      icon: FileText,
      tone: 'info',
      text: <>Customers owe you <strong>{formatCurrency(totalAr)}</strong> across open invoices.</>,
      cta: { label: 'View', to: '/receive-payments' },
    });
  }

  insights.sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone]);
  return insights.slice(0, 4);
}

const DashboardInsights = (props: DashboardInsightsProps) => {
  const { isLoading } = props;

  const insights = isLoading ? [] : buildInsights(props);
  const allClear = !isLoading && insights.length === 0;

  return (
    <Card className="overflow-hidden border-primary/20 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b bg-primary/[0.03] pb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <CardTitle className="text-base">Smart Insights</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : allClear ? (
          <div className="flex items-center gap-3 py-2">
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', TONE_STYLES.success)}>
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="text-sm text-muted-foreground">You’re all caught up — nothing needs your attention right now.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {insights.map((insight) => (
              <li
                key={insight.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_STYLES[insight.tone])}>
                  <insight.icon className="h-5 w-5" />
                </span>
                <p className="flex-1 text-sm text-foreground">{insight.text}</p>
                {insight.cta && (
                  <Button asChild variant="ghost" size="sm" className="shrink-0 text-primary hover:text-primary">
                    <Link to={insight.cta.to}>
                      {insight.cta.label}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default DashboardInsights;
