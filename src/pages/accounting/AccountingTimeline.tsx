import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingTimelineQuery } from '../../lib/accountingQueries';
import { type AccountingFilters } from '../../lib/accountingWorkspace';
import { moduleColorClass } from '../../lib/accountantProductivity';
import { formatCurrency, cn } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import AccountingFiltersBar from '../../components/accounting/AccountingFiltersBar';
import AccountingSearch from '../../components/accounting/AccountingSearch';
import TraceabilityDrawer from '../../components/accounting/TraceabilityDrawer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';

const PAGE_SIZE = 50;

const AccountingTimeline = () => {
  useDocumentTitle('Accounting Timeline');
  const { activeCompany } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AccountingFilters>({ module: 'all' });
  const [trace, setTrace] = useState<{ posting_request_id?: string; journal_entry_id?: string } | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    ...accountingTimelineQuery(activeCompany!.id, page, PAGE_SIZE, filters),
    enabled: !!activeCompany,
    placeholderData: (prev) => prev,
  });

  const rows = (data as any)?.rows || [];
  const total = (data as any)?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7" /> Accounting Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified feed of every successful posting — Sales, Purchases, Banking, Inventory, Payroll, Assets, Manual Journals.
          </p>
        </div>
        <AccountingSearch onSelectTrace={(r) => setTrace(r)} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Posting feed</CardTitle>
          <CardDescription>{total.toLocaleString()} committed postings {isFetching ? '· refreshing…' : ''}</CardDescription>
          <AccountingFiltersBar value={filters} onChange={(n) => { setFilters(n); setPage(1); }} showAccount={false} />
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-80 w-full" /> : (
            <>
              <div className="space-y-2">
                {rows.map((r: any) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setTrace({ posting_request_id: r.id, journal_entry_id: r.journal_entry_id })}
                    className={cn('w-full text-left rounded-md border border-l-4 p-3 hover:bg-accent/40', moduleColorClass(r.module || r.activity_class))}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.description || r.reference || r.journal_number || 'Posting'}</div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-1">
                          <span>{r.time ? new Date(r.time).toLocaleString() : '—'}</span>
                          <span className="capitalize">{r.activity_class || r.module}</span>
                          <span className="font-semibold text-foreground">{r.journal_number || '—'}</span>
                          <span>{r.reference || '—'}</span>
                          <span>P{r.period_number ?? '—'} · {r.year_code || '—'}</span>
                          <span className="font-mono">{r.created_by?.slice(0, 8) || '—'}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-semibold">{formatCurrency(r.amount)}</div>
                        <Badge variant="outline" className="capitalize mt-1">{r.status}</Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-between mt-3">
                <div className="text-xs text-muted-foreground">Page {page}/{totalPages}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <TraceabilityDrawer
        open={!!trace}
        onOpenChange={(o) => !o && setTrace(null)}
        postingRequestId={trace?.posting_request_id}
        journalEntryId={trace?.journal_entry_id}
      />
    </div>
  );
};

export default AccountingTimeline;
