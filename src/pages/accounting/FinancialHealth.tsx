import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HeartPulse, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { financialHealthQuery } from '../../lib/accountingQueries';
import { formatCurrency } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import AccountingSearch from '../../components/accounting/AccountingSearch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

const FinancialHealth = () => {
  useDocumentTitle('Financial Health');
  const { activeCompany } = useAuth();
  const { data, isLoading } = useQuery({
    ...financialHealthQuery(activeCompany!.id),
    enabled: !!activeCompany,
    refetchInterval: 30_000,
  });

  const d = data as any;

  if (isLoading || !d) {
    return <div className="space-y-4"><Skeleton className="h-10 w-72" /><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></div>;
  }

  const cards = [
    { label: 'Debits Today', value: formatCurrency(d.debits_today), to: '/accounting/timeline' },
    { label: 'Credits Today', value: formatCurrency(d.credits_today), to: '/accounting/timeline' },
    { label: 'Balanced Journals', value: String(d.balanced_journals), to: '/journal-entries' },
    { label: 'Pending Posting Requests', value: String(d.pending_posting_requests), to: '/accounting/posting-requests', warn: d.pending_posting_requests > 0 },
    { label: 'Failed Posting Requests', value: String(d.failed_posting_requests), to: '/accounting/exceptions', danger: d.failed_posting_requests > 0 },
    { label: 'Draft Journals', value: String(d.draft_journals), to: '/journal-entries' },
    { label: 'Open Accounting Periods', value: String(d.open_accounting_periods), to: '/accounting/periods' },
    { label: 'Closed Accounting Periods', value: String(d.closed_accounting_periods), to: '/accounting/periods' },
    { label: 'Suspense Balance', value: formatCurrency(d.suspense_balance), to: '/accounting/exceptions', warn: d.suspense_balance > 0 },
    { label: 'Unmapped Categories', value: String(d.unmapped_categories), to: '/accounting/exceptions', warn: d.unmapped_categories > 0 },
    { label: 'Duplicate Posting Attempts', value: String(d.duplicate_posting_attempts), to: '/accounting/exceptions', warn: d.duplicate_posting_attempts > 0 },
    { label: 'Bank Reconciliation Status', value: String(d.bank_reconciliation_status).replace(/_/g, ' '), to: '/accounting/reconciliation' },
    { label: 'Quick Capture Awaiting Review', value: String(d.quick_capture_awaiting_review), to: '/purchases/quick-capture' },
    { label: 'Outstanding Attachments', value: String(d.outstanding_attachments), to: '/journal-entries' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HeartPulse className="h-7 w-7" /> Financial Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Enterprise KPI cards — as of {d.as_of}</p>
        </div>
        <div className="flex gap-2">
          <AccountingSearch />
          <Button asChild variant="outline"><Link to="/accounting/period-close">Period Close Readiness</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className={c.danger ? 'border-destructive/50' : c.warn ? 'border-amber-500/40' : ''}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between gap-2">
                <span>{c.label}</span>
                {(c.danger || c.warn) && <Badge variant={c.danger ? 'destructive' : 'secondary'}>Attention</Badge>}
              </CardDescription>
              <CardTitle className="text-xl font-mono">{c.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="px-0 h-auto text-xs">
                <Link to={c.to}>Investigate <ArrowRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FinancialHealth;
