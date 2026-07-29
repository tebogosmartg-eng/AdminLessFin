import { addDays, differenceInCalendarDays, format, isBefore, parseISO, startOfDay } from 'date-fns';
import { formatCurrency } from './utils';

export type ArBalance = { customer_id: string; customer_name: string; balance: number };

export type OverdueInvoice = {
  id: string;
  invoice_number: string;
  due_date: string;
  customer_name: string;
  total: number;
  customer_id?: string;
  email?: string | null;
};

export type TopCustomer = { name: string; amount: number };

export type CashFlowPoint = { date: string; balance: number; type?: string };

export type ExpectedPaymentRaw = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  due_date: string;
  amount: number;
  status: string;
  payment_terms: number | null;
  email: string | null;
};

export type ExpectedPaymentRow = ExpectedPaymentRaw & {
  daysRemaining: number;
};

export type RevenueMetrics = {
  totalAr: number;
  overdueTotal: number;
  revenueThisMonth: number;
  expectedPayments: number;
  collectionRate: number;
  customersAtRisk: ArBalance[];
};

export type AgingBucketId = 'current' | '31-60' | '61-90' | '90+';

export type AgingCustomer = {
  customer_id: string;
  customer_name: string;
  balance: number;
};

export type AgingBucket = {
  id: AgingBucketId;
  label: string;
  total: number;
  customers: AgingCustomer[];
};

export type SimpleInsight = {
  id: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  message: string;
  actionLabel?: string;
  drawerId?: string;
  actionTo?: string;
};

export function buildRevenueMetrics(input: {
  arBalances: ArBalance[];
  overdueInvoices: OverdueInvoice[];
  topCustomers: TopCustomer[];
  cashFlowForecast: CashFlowPoint[];
}): RevenueMetrics {
  const { arBalances, overdueInvoices, topCustomers, cashFlowForecast } = input;
  const totalAr = arBalances.reduce((sum, item) => sum + item.balance, 0);
  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + inv.total, 0);
  const revenueThisMonth = topCustomers.reduce((sum, c) => sum + c.amount, 0);

  const expectedPayments = cashFlowForecast.reduce((sum, point, index) => {
    if (index === 0) return sum;
    const change = point.balance - cashFlowForecast[index - 1].balance;
    return sum + (change > 0 ? change : 0);
  }, 0);

  const customersAtRisk = [...arBalances]
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  const collectionRate =
    totalAr + revenueThisMonth > 0
      ? Math.round((revenueThisMonth / (revenueThisMonth + totalAr)) * 100)
      : 100;

  return {
    totalAr,
    overdueTotal,
    revenueThisMonth,
    expectedPayments,
    collectionRate,
    customersAtRisk,
  };
}

export function buildExpectedPayments(
  rows: ExpectedPaymentRaw[],
  asOf: Date = new Date(),
): ExpectedPaymentRow[] {
  return rows
    .map((row) => ({
      ...row,
      daysRemaining: differenceInCalendarDays(parseISO(row.due_date), asOf),
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

function agingBucketForDaysOverdue(daysOverdue: number): AgingBucketId {
  if (daysOverdue <= 30) return 'current';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

/**
 * Group outstanding money by how late it is.
 * Current = not overdue (or overdue ≤ 30 days). Older buckets from overdue invoices.
 */
export function buildReceivablesAging(
  arBalances: ArBalance[],
  overdueInvoices: OverdueInvoice[],
  asOf: Date = new Date(),
): AgingBucket[] {
  const today = startOfDay(asOf);
  const buckets: Record<AgingBucketId, Map<string, AgingCustomer>> = {
    current: new Map(),
    '31-60': new Map(),
    '61-90': new Map(),
    '90+': new Map(),
  };

  const overdueByCustomer = new Map<string, number>();

  for (const inv of overdueInvoices) {
    const daysOverdue = Math.max(0, differenceInCalendarDays(today, parseISO(inv.due_date)));
    const bucketId = agingBucketForDaysOverdue(daysOverdue);
    const key = inv.customer_id || inv.customer_name;
    const existing = buckets[bucketId].get(key);
    buckets[bucketId].set(key, {
      customer_id: inv.customer_id || key,
      customer_name: inv.customer_name,
      balance: (existing?.balance ?? 0) + inv.total,
    });
    overdueByCustomer.set(key, (overdueByCustomer.get(key) ?? 0) + inv.total);
  }

  for (const cust of arBalances) {
    if (cust.balance <= 0) continue;
    const key = cust.customer_id;
    const overdueAmt = overdueByCustomer.get(key) ?? overdueByCustomer.get(cust.customer_name) ?? 0;
    const currentAmt = Math.max(0, cust.balance - overdueAmt);
    if (currentAmt <= 0) continue;
    const existing = buckets.current.get(key);
    buckets.current.set(key, {
      customer_id: cust.customer_id,
      customer_name: cust.customer_name,
      balance: (existing?.balance ?? 0) + currentAmt,
    });
  }

  const labels: Record<AgingBucketId, string> = {
    current: 'Current',
    '31-60': '31–60 Days',
    '61-90': '61–90 Days',
    '90+': '90+ Days',
  };

  return (Object.keys(labels) as AgingBucketId[]).map((id) => {
    const customers = [...buckets[id].values()].sort((a, b) => b.balance - a.balance);
    return {
      id,
      label: labels[id],
      total: customers.reduce((s, c) => s + c.balance, 0),
      customers,
    };
  });
}

export function collectionExplanation(rate: number, overdueCount: number): string {
  if (rate >= 100 && overdueCount === 0) {
    return '100% of invoices due this period have been paid.';
  }
  if (overdueCount === 0) {
    return `${rate}% collected so far this month. Nothing is overdue.`;
  }
  return `${rate}% collected so far this month. ${overdueCount} invoice${overdueCount === 1 ? '' : 's'} still unpaid past the due date.`;
}

export function collectionCalculationDetail(metrics: RevenueMetrics): string {
  return (
    `We compare money you’ve already earned this month (${formatCurrency(metrics.revenueThisMonth)}) ` +
    `with money customers still owe (${formatCurrency(metrics.totalAr)}). ` +
    `Collection rate = earned ÷ (earned + still owed).`
  );
}

/** Plain-language insights for owners and bookkeepers. */
export function buildSimpleRevenueInsights(input: {
  metrics: RevenueMetrics;
  overdueInvoices: OverdueInvoice[];
  expectedPaymentRows: ExpectedPaymentRow[];
  draftInvoices: number;
}): SimpleInsight[] {
  const { metrics, overdueInvoices, expectedPaymentRows, draftInvoices } = input;
  const insights: SimpleInsight[] = [];
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);

  const followUpToday = overdueInvoices.filter((inv) => {
    const days = differenceInCalendarDays(today, parseISO(inv.due_date));
    return days >= 1;
  });

  if (followUpToday.length > 0) {
    const count = Math.min(followUpToday.length, followUpToday.length);
    insights.push({
      id: 'follow-up-today',
      tone: 'danger',
      message: `${count} invoice${count === 1 ? '' : 's'} should be followed up today.`,
      actionLabel: 'See overdue',
      drawerId: 'overdue',
    });
  }

  if (metrics.customersAtRisk[0] && overdueInvoices.some((i) => i.customer_name === metrics.customersAtRisk[0].customer_name)) {
    insights.push({
      id: 'late-payer',
      tone: 'warning',
      message: `${metrics.customersAtRisk[0].customer_name} usually pays late — ${formatCurrency(metrics.customersAtRisk[0].balance)} still outstanding.`,
      actionLabel: 'View customer',
      actionTo: `/customers/${metrics.customersAtRisk[0].customer_id}`,
    });
  }

  const thisWeek = expectedPaymentRows.filter((r) => {
    const due = parseISO(r.due_date);
    return !isBefore(due, today) && !isBefore(weekEnd, due);
  });
  const weekTotal = thisWeek.reduce((s, r) => s + r.amount, 0);
  if (weekTotal > 0) {
    insights.push({
      id: 'week-collections',
      tone: 'info',
      message: `Expected collections this week: ${formatCurrency(weekTotal)}.`,
      actionLabel: 'See expected payments',
      drawerId: 'expected',
    });
  } else if (metrics.expectedPayments > 0) {
    insights.push({
      id: 'month-collections',
      tone: 'info',
      message: `Expected collections in the next 30 days: ${formatCurrency(metrics.expectedPayments)}.`,
      actionLabel: 'See expected payments',
      drawerId: 'expected',
    });
  }

  if (draftInvoices > 0) {
    insights.push({
      id: 'drafts',
      tone: 'warning',
      message: `${draftInvoices} draft invoice${draftInvoices === 1 ? '' : 's'} ready to send.`,
      actionLabel: 'Open drafts',
      actionTo: '/invoices?status=draft',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'all-clear',
      tone: 'success',
      message: 'No action required today.',
    });
  }

  return insights.slice(0, 4);
}

export function daysOverdueLabel(dueDate: string, asOf: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(startOfDay(asOf), parseISO(dueDate)));
}

export function formatShortDate(date: string): string {
  return format(parseISO(date), 'dd MMM yyyy');
}
