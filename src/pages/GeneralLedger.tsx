import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format, startOfYear, endOfYear } from 'date-fns';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  BookOpen, Download, Pin, PinOff, Save, Keyboard, ChevronDown,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Info, ExternalLink,
  AlertCircle, RefreshCw,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { accountActivityQuery } from '../lib/accountingQueries';
import { accountsQuery } from '../lib/queries';
import { accountingApi } from '../lib/accountingWorkspace';
import { financialCalendarService } from '@/governance/domains/financialCalendar/service';
import type { FinancialYearDomainModel, AccountingPeriodDomainModel } from '@/governance/domains/financialCalendar/model';
import { accountantPrefs, moduleColorClass } from '../lib/accountantProductivity';
import { formatCurrency, downloadCSV, cn } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import AccountingSearch from '../components/accounting/AccountingSearch';
import TraceabilityDrawer from '../components/accounting/TraceabilityDrawer';
import EnterpriseAccountCard from '../components/accounting/EnterpriseAccountCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { Calendar as CalendarIcon } from 'lucide-react';
import { showSuccess } from '../utils/toast';

const PAGE_SIZE = 80;

const GeneralLedger = () => {
  useDocumentTitle('Account Activity');
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const accountId = searchParams.get('account_id') || '';

  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'period' | 'year'>('day');
  const [page, setPage] = useState(1);
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [cardOpen, setCardOpen] = useState(false);
  const [trace, setTrace] = useState<{
    journal_entry_id?: string | null;
    posting_request_id?: string | null;
    account_id?: string | null;
  } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!companyId) return;
    setPinned(accountantPrefs.getPinnedAccounts(companyId));
    setRecent(accountantPrefs.getRecentAccounts(companyId));
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !accountId) return;
    setRecent(accountantPrefs.touchRecentAccount(companyId, accountId));
    setPage(1);
  }, [companyId, accountId]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-accounting-search]')?.click();
      }
      if (e.key === 'p' && accountId && companyId) {
        setPinned(accountantPrefs.togglePinnedAccount(companyId, accountId));
      }
      if (e.key === 'c' && accountId) setCardOpen(true);
      if (e.key === 'Escape') setTrace(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accountId, companyId]);

  const startDate = date?.from ? format(date.from, 'yyyy-MM-dd') : format(startOfYear(new Date()), 'yyyy-MM-dd');
  const endDate = date?.to ? format(date.to, 'yyyy-MM-dd') : format(endOfYear(new Date()), 'yyyy-MM-dd');

  const { data: accounts } = useQuery({
    ...accountsQuery(companyId!),
    enabled: !!companyId,
  });

  const activityOpts = useMemo(() => ({
    page, page_size: PAGE_SIZE, start_date: startDate, end_date: endDate, group_by: groupBy,
  }), [page, startDate, endDate, groupBy]);

  const { data, isLoading, isFetching, isError: activityIsError, error: activityError, refetch: refetchActivity } = useQuery({
    ...accountActivityQuery(companyId!, accountId, activityOpts),
    enabled: !!companyId && !!accountId,
    placeholderData: (prev) => prev,
  });

  const { data: explainer, isLoading: explainerLoading, isError: explainerIsError, error: explainerError, refetch: refetchExplainer } = useQuery({
    queryKey: ['account-explainer', companyId, accountId, endDate],
    queryFn: () => accountingApi.accountExplainer(companyId!, accountId, endDate),
    enabled: !!companyId && !!accountId,
  });

  const { data: analytics, isLoading: analyticsLoading, isError: analyticsIsError, error: analyticsError, refetch: refetchAnalytics } = useQuery({
    queryKey: ['account-analytics', companyId, accountId, startDate, endDate],
    queryFn: () => accountingApi.accountAnalytics(companyId!, accountId, startDate, endDate),
    enabled: !!companyId && !!accountId,
  });

  const { data: sourceAnalysis, isLoading: sourceLoading, isError: sourceIsError, error: sourceError, refetch: refetchSource } = useQuery({
    queryKey: ['account-source', companyId, accountId, startDate, endDate],
    queryFn: () => accountingApi.accountSourceAnalysis(companyId!, accountId, startDate, endDate),
    enabled: !!companyId && !!accountId,
  });

  // Phase 4C Part 1/7: Intelligence tabs, all backed by the certified
  // server-side RPCs (get_account_movement_*) — no client-side aggregation.
  const { data: variance, isLoading: varianceLoading, isError: varianceIsError, error: varianceError, refetch: refetchVariance } = useQuery({
    queryKey: ['account-variance', companyId, accountId, endDate],
    queryFn: () => accountingApi.accountVariance(companyId!, accountId, endDate),
    enabled: !!companyId && !!accountId,
  });
  const { data: drivers, isLoading: driversLoading, isError: driversIsError, error: driversError, refetch: refetchDrivers } = useQuery({
    queryKey: ['account-drivers', companyId, accountId, startDate, endDate],
    queryFn: () => accountingApi.accountDrivers(companyId!, accountId, startDate, endDate),
    enabled: !!companyId && !!accountId,
  });
  const { data: insights, isLoading: insightsLoading, isError: insightsIsError, error: insightsError, refetch: refetchInsights } = useQuery({
    queryKey: ['account-insights', companyId, accountId, startDate, endDate],
    queryFn: () => accountingApi.accountInsights(companyId!, accountId, startDate, endDate),
    enabled: !!companyId && !!accountId,
  });
  const { data: comparison, isLoading: comparisonLoading, isError: comparisonIsError, error: comparisonError, refetch: refetchComparison } = useQuery({
    queryKey: ['account-comparison', companyId, accountId, endDate],
    queryFn: () => accountingApi.accountComparison(companyId!, accountId, endDate),
    enabled: !!companyId && !!accountId,
  });

  // Phase 4C Part 8: Financial Year / Financial Period filter — resolves to
  // a concrete date range fed into the same server-side queries every other
  // filter already uses, so it stays server-driven rather than adding a
  // separate client-side filtering path.
  // Phase G3.2 — repointed onto Governance's FinancialCalendarService; the
  // underlying edge function calls are unchanged, only the access path and
  // the resulting field names (camelCase domain model) changed.
  const { data: financialYears } = useQuery({
    queryKey: ['financial-years', companyId],
    queryFn: () => financialCalendarService.getFinancialYears(companyId!),
    enabled: !!companyId,
  });
  const { data: financialPeriods } = useQuery({
    queryKey: ['financial-periods', companyId],
    queryFn: () => financialCalendarService.getAccountingPeriods(companyId!),
    enabled: !!companyId,
  });
  const [periodFilter, setPeriodFilter] = useState<string>('custom');
  const handlePeriodFilterChange = (value: string) => {
    setPeriodFilter(value);
    if (value === 'custom') return;
    const [kind, id] = value.split(':');
    const source = kind === 'fy' ? financialYears : financialPeriods;
    const row = (source || []).find(
      (r: FinancialYearDomainModel | AccountingPeriodDomainModel) => r.id === id
    );
    if (row?.startDate && row?.endDate) {
      setDate({ from: new Date(`${row.startDate}T00:00:00`), to: new Date(`${row.endDate}T00:00:00`) });
    }
  };

  // Phase 4C Part 8: contribution name filter (module/vendor/customer/
  // project/document type) — the underlying RPCs already return the full,
  // small, pre-aggregated bucket list for the account, so filtering which
  // buckets are displayed is a client-side operation over that small result
  // set, not a re-scan of the ledger — not the large-dataset anti-pattern
  // the blueprint warns against.
  const [contributionFilter, setContributionFilter] = useState('');

  const header = (data as any)?.header;
  const activities: any[] = (data as any)?.activities || [];
  const total = (data as any)?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const groupCounts: Record<string, number> = (data as any)?.group_counts || {};

  const feedItems = useMemo(() => {
    const items: { type: 'group' | 'activity'; key: string; activity?: any; label?: string; count?: number }[] = [];
    let lastGroup = '';
    for (const a of activities) {
      let g = a.entry_date;
      if (groupBy === 'month') g = a.entry_date?.slice(0, 7);
      else if (groupBy === 'week') {
        const d = new Date(`${a.entry_date}T00:00:00Z`);
        const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getUTCDay() + 1) / 7);
        g = `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
      } else if (groupBy === 'period') g = a.period_number != null ? `P${a.period_number}` : 'Unassigned';
      else if (groupBy === 'year') g = a.year_code || a.entry_date?.slice(0, 4);
      if (g !== lastGroup) {
        items.push({ type: 'group', key: `g-${g}`, label: g, count: groupCounts[g] });
        lastGroup = g;
      }
      if (!collapsedGroups[g || '']) {
        items.push({ type: 'activity', key: a.id, activity: a });
      }
    }
    return items;
  }, [activities, groupBy, groupCounts, collapsedGroups]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: feedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (feedItems[i]?.type === 'group' ? 36 : 88),
    overscan: 10,
  });

  const selectAccount = useCallback((id: string) => {
    setSearchParams({ account_id: id });
  }, [setSearchParams]);

  const isPinned = accountId && pinned.includes(accountId);

  const handleExport = () => {
    downloadCSV(activities.map((a) => ({
      Date: a.entry_date, Module: a.module, Document: a.document_type, Reference: a.reference,
      Description: a.description, Debit: a.debit, Credit: a.credit, RunningBalance: a.running_balance,
      Journal: a.journal_number, Status: a.posting_status, User: a.created_by, Source: a.source,
    })), `account-activity-${accountId}-${endDate}.csv`);
  };

  const saveView = () => {
    if (!companyId || !accountId) return;
    accountantPrefs.saveLedgerView(companyId, {
      name: `${header?.account_number || 'Account'} · ${groupBy}`,
      accountId,
      groupBy,
      filters: { startDate, endDate },
    });
    showSuccess('Ledger view saved');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7" /> Account Activity Workspace
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every balance explains itself — shortcuts: <kbd className="px-1 border rounded text-xs">/</kbd> search · <kbd className="px-1 border rounded text-xs">p</kbd> pin · <kbd className="px-1 border rounded text-xs">c</kbd> card
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div data-accounting-search><AccountingSearch onSelectTrace={(r) => {
            if (r.account_id) selectAccount(r.account_id);
            else setTrace(r);
          }} /></div>
          {accountId && (
            <>
              <Button variant="outline" size="sm" onClick={() => companyId && setPinned(accountantPrefs.togglePinnedAccount(companyId, accountId))}>
                {isPinned ? <PinOff className="mr-1 h-4 w-4" /> : <Pin className="mr-1 h-4 w-4" />} {isPinned ? 'Unpin' : 'Pin'}
              </Button>
              <Button variant="outline" size="sm" onClick={saveView}><Save className="mr-1 h-4 w-4" /> Save view</Button>
              <Button variant="outline" size="sm" onClick={() => setCardOpen(true)}>Account card</Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!activities.length}><Download className="mr-1 h-4 w-4" /> Export</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-4">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Accounts</CardTitle>
            <CardDescription>Pinned & recent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={accountId || undefined} onValueChange={selectAccount}>
              <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(accounts || []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.account_number} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pinned.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Pinned</div>
                <div className="space-y-1">
                  {pinned.map((id) => {
                    const a = (accounts || []).find((x: any) => x.id === id);
                    if (!a) return null;
                    return (
                      <button key={id} type="button" onClick={() => selectAccount(id)}
                        className={cn('w-full text-left text-xs rounded px-2 py-1.5 hover:bg-accent', accountId === id && 'bg-accent font-medium')}>
                        {a.account_number} {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {recent.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Recently viewed</div>
                <div className="space-y-1">
                  {recent.slice(0, 8).map((id) => {
                    const a = (accounts || []).find((x: any) => x.id === id);
                    if (!a) return null;
                    return (
                      <button key={id} type="button" onClick={() => selectAccount(id)}
                        className={cn('w-full text-left text-xs rounded px-2 py-1.5 hover:bg-accent', accountId === id && 'bg-accent font-medium')}>
                        {a.account_number} {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Button asChild variant="link" className="px-0 h-auto text-xs"><Link to="/trial-balance">Open Trial Balance</Link></Button>
          </CardContent>
        </Card>

        <div className="space-y-4 min-w-0">
          {!accountId ? (
            <Card><CardContent className="py-16 text-center text-muted-foreground">Select an account to open the Account Activity Workspace.</CardContent></Card>
          ) : isLoading || !header ? (
            <Skeleton className="h-[520px] w-full" />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">{header.account_number} — {header.account_name}</CardTitle>
                      <CardDescription className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="outline">{header.account_type}</Badge>
                        <Badge variant="secondary" className="capitalize">Normal: {header.normal_balance}</Badge>
                        <Badge variant={header.status === 'active' ? 'outline' : 'destructive'} className="capitalize">{header.status}</Badge>
                        {(header.linked_modules || []).map((m: string) => <Badge key={m} variant="outline">{m}</Badge>)}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select value={periodFilter} onValueChange={handlePeriodFilterChange}>
                        <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Financial Year/Period" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom range</SelectItem>
                          {(financialYears || []).map((fy) => (
                            <SelectItem key={fy.id} value={`fy:${fy.id}`}>FY {fy.yearCode}</SelectItem>
                          ))}
                          {(financialPeriods || []).map((p) => (
                            <SelectItem key={p.id} value={`period:${p.id}`}>
                              P{p.periodNumber} · {p.financialYearCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (date.to ? `${format(date.from, 'LLL dd, y')} – ${format(date.to, 'LLL dd, y')}` : format(date.from, 'LLL dd, y')) : 'Dates'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar mode="range" selected={date} onSelect={(r) => { setDate(r); setPage(1); setPeriodFilter('custom'); }} numberOfMonths={2} />
                        </PopoverContent>
                      </Popover>
                      <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                        <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Group: Day</SelectItem>
                          <SelectItem value="week">Group: Week</SelectItem>
                          <SelectItem value="month">Group: Month</SelectItem>
                          <SelectItem value="period">Group: Period</SelectItem>
                          <SelectItem value="year">Group: Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
                    <Stat label="Current Balance" value={formatCurrency(header.current_balance)} />
                    <Stat label="Opening Balance" value={formatCurrency(header.opening_balance)} />
                    <Stat label="Period Movement" value={formatCurrency(header.period_movement)} />
                    <Stat label="YTD Movement" value={formatCurrency(header.ytd_movement)} />
                    <Stat label="Last Posting" value={header.last_posting_date || '—'} />
                    <Stat label="Transactions" value={String(header.transaction_count)} />
                    <Stat label="Avg Monthly Activity" value={header.average_monthly_activity?.toFixed(1)} />
                    <Stat label="Largest Txn" value={formatCurrency(header.largest_transaction)} />
                    <Stat label="Largest Debit" value={formatCurrency(header.largest_debit)} />
                    <Stat label="Largest Credit" value={formatCurrency(header.largest_credit)} />
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="activity">
                <TabsList className="flex flex-wrap h-auto">
                  <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
                  <TabsTrigger value="explainer">Explainability</TabsTrigger>
                  <TabsTrigger value="variance">Variance</TabsTrigger>
                  <TabsTrigger value="drivers">Drivers</TabsTrigger>
                  <TabsTrigger value="insights">Insights</TabsTrigger>
                  <TabsTrigger value="comparison">Comparison</TabsTrigger>
                  <TabsTrigger value="analytics">Analytics</TabsTrigger>
                  <TabsTrigger value="source">Contributions</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="mt-3">
                  <QueryState
                    isLoading={isLoading}
                    isError={activityIsError}
                    error={activityError}
                    onRetry={() => refetchActivity()}
                    isEmpty={total === 0}
                    emptyMessage="No activity for this account in the selected period."
                  >
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Activity feed</CardTitle>
                      <CardDescription>
                        {isFetching ? 'Refreshing…' : `${total.toLocaleString()} transactions · page ${page}/${totalPages}`}
                        <span className="ml-2 inline-flex items-center gap-1 text-xs"><Keyboard className="h-3 w-3" /> colour-coded by module</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div ref={parentRef} className="h-[560px] overflow-auto border rounded-md">
                        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                          {virtualizer.getVirtualItems().map((v) => {
                            const item = feedItems[v.index];
                            if (item.type === 'group') {
                              const collapsed = !!collapsedGroups[item.label || ''];
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  className="absolute left-0 right-0 px-3 py-2 bg-muted/60 text-xs font-semibold flex items-center gap-2 border-b"
                                  style={{ transform: `translateY(${v.start}px)`, height: v.size }}
                                  onClick={() => setCollapsedGroups((s) => ({ ...s, [item.label || '']: !collapsed }))}
                                >
                                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', collapsed && '-rotate-90')} />
                                  {item.label} {item.count != null ? `(${item.count})` : ''}
                                </button>
                              );
                            }
                            const a = item.activity!;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                className={cn(
                                  'absolute left-0 right-0 border-b border-l-4 px-3 py-2 text-left hover:bg-accent/40',
                                  moduleColorClass(a.module)
                                )}
                                style={{ transform: `translateY(${v.start}px)`, height: v.size }}
                                onClick={() => setTrace({
                                  journal_entry_id: a.journal_entry_id,
                                  posting_request_id: a.posting_request_id,
                                  account_id: accountId,
                                })}
                              >
                                <div className="flex justify-between gap-3 text-sm">
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{a.description || a.reference || 'Activity'}</div>
                                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                                      <span>{a.entry_date}</span>
                                      <span>{a.module}</span>
                                      <span>{a.document_type || '—'}</span>
                                      <span className="font-semibold text-foreground">{a.journal_number || '—'}</span>
                                      <Badge variant="outline" className="capitalize text-[10px] h-5">{a.posting_status}</Badge>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      By {a.created_by?.slice(0, 8) || '—'} · Source {a.source || '—'}
                                      {a.vendor_name ? ` · Vendor ${a.vendor_name}` : ''}
                                      {a.customer_name ? ` · Customer ${a.customer_name}` : ''}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 font-mono text-xs space-y-0.5">
                                    <div className="text-emerald-700 dark:text-emerald-400">{a.debit ? `Dr ${formatCurrency(a.debit)}` : ''}</div>
                                    <div className="text-rose-700 dark:text-rose-400">{a.credit ? `Cr ${formatCurrency(a.credit)}` : ''}</div>
                                    <div className="text-muted-foreground">Bal {formatCurrency(a.running_balance)}</div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-between mt-3">
                        <div className="text-xs text-muted-foreground">Server-side pagination · virtual scrolling</div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  </QueryState>
                </TabsContent>

                <TabsContent value="explainer" className="mt-3">
                  <QueryState
                    isLoading={explainerLoading}
                    isError={explainerIsError}
                    error={explainerError}
                    onRetry={() => refetchExplainer()}
                    isEmpty={!!explainer && (explainer as any).top_transactions?.length === 0 && (explainer as any).top_modules?.length === 0}
                    emptyMessage="No contributing transactions in this period."
                  >
                    <ExplainerPanel data={explainer as any} />
                  </QueryState>
                </TabsContent>

                <TabsContent value="analytics" className="mt-3">
                  <QueryState
                    isLoading={analyticsLoading}
                    isError={analyticsIsError}
                    error={analyticsError}
                    onRetry={() => refetchAnalytics()}
                    isEmpty={!!analytics && (analytics as any).monthly_movement?.length === 0}
                    emptyMessage="No posting activity in the selected range."
                  >
                    <AnalyticsPanel data={analytics as any} />
                  </QueryState>
                </TabsContent>

                <TabsContent value="variance" className="mt-3">
                  <QueryState
                    isLoading={varianceLoading}
                    isError={varianceIsError}
                    error={varianceError}
                    onRetry={() => refetchVariance()}
                    isEmpty={false}
                  >
                    <VariancePanel data={variance as any} />
                  </QueryState>
                </TabsContent>

                <TabsContent value="drivers" className="mt-3">
                  <QueryState
                    isLoading={driversLoading || insightsLoading}
                    isError={driversIsError}
                    error={driversError}
                    onRetry={() => { refetchDrivers(); refetchInsights(); }}
                    isEmpty={!!drivers && (drivers as any).drivers?.length === 0 && !(insights as any)?.largest_journal}
                    emptyMessage="No posting activity to derive drivers from in this period."
                  >
                    <DriversPanel
                      drivers={drivers as any}
                      insights={insights as any}
                      onOpenJournal={(journalEntryId) => setTrace({ journal_entry_id: journalEntryId, account_id: accountId })}
                    />
                  </QueryState>
                </TabsContent>

                <TabsContent value="insights" className="mt-3">
                  <QueryState
                    isLoading={insightsLoading}
                    isError={insightsIsError}
                    error={insightsError}
                    onRetry={() => refetchInsights()}
                    isEmpty={false}
                  >
                    <InsightsPanel data={insights as any} />
                  </QueryState>
                </TabsContent>

                <TabsContent value="comparison" className="mt-3">
                  <QueryState
                    isLoading={comparisonLoading}
                    isError={comparisonIsError}
                    error={comparisonError}
                    onRetry={() => refetchComparison()}
                    isEmpty={!!comparison && (comparison as any).monthly_series?.length === 0}
                    emptyMessage="No monthly history available yet for this account."
                  >
                    <ComparisonPanel data={comparison as any} />
                  </QueryState>
                </TabsContent>

                <TabsContent value="source" className="mt-3">
                  <div className="mb-3">
                    <Input
                      placeholder="Filter contributions by name…"
                      value={contributionFilter}
                      onChange={(e) => setContributionFilter(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                  <QueryState
                    isLoading={sourceLoading}
                    isError={sourceIsError}
                    error={sourceError}
                    onRetry={() => refetchSource()}
                    isEmpty={!!sourceAnalysis && ['by_module', 'by_vendor', 'by_customer', 'by_project', 'by_document_type'].every((k) => ((sourceAnalysis as any)[k] || []).length === 0)}
                    emptyMessage="No contribution data for this account in the selected period."
                  >
                    <SourcePanel data={sourceAnalysis as any} nameFilter={contributionFilter} />
                  </QueryState>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>

      <TraceabilityDrawer
        open={!!trace}
        onOpenChange={(o) => !o && setTrace(null)}
        journalEntryId={trace?.journal_entry_id}
        postingRequestId={trace?.posting_request_id}
        accountId={trace?.account_id}
      />
      <EnterpriseAccountCard accountId={accountId || null} open={cardOpen} onOpenChange={setCardOpen} />
    </div>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold font-mono mt-1 truncate">{value}</div>
    </div>
  );
}

// Blocker 2 fix: a single reusable loading/error/empty wrapper for every
// query-backed tab in this workspace, so a failed request always surfaces
// a message + retry action instead of leaving the Skeleton up forever.
function QueryState({
  isLoading, isError, error, onRetry, isEmpty, emptyMessage, children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) {
    const message = error instanceof Error ? error.message : 'Something went wrong loading this data.';
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-6 flex flex-col items-center text-center gap-3 py-10">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="font-medium">Couldn't load this view</p>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (isEmpty) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground py-10">
          {emptyMessage || 'No data for this period.'}
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}

function ExplainerPanel({ data }: { data: any }) {
  if (!data) return <Skeleton className="h-64 w-full" />;
  const c = data.contributions || {};
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Why did this balance change?</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Current balance</span><span className="font-mono">{formatCurrency(data.current_balance)}</span></div>
          <div className="flex justify-between"><span>Change this month</span><span className="font-mono">{formatCurrency(data.month_change)}</span></div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {Object.entries(c).map(([k, v]) => (
              <div key={k} className="rounded border p-2"><div className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</div><div className="font-mono text-sm">{formatCurrency(Number(v))}</div></div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 contributing transactions</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm max-h-80 overflow-y-auto">
          {(data.top_transactions || []).map((t: any, i: number) => (
            <div key={i} className="flex justify-between gap-2 border-b py-1">
              <span className="truncate">{t.journal_number || '—'} · {t.module}</span>
              <span className="font-mono shrink-0">{formatCurrency(t.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <ContribList title="Top modules" items={data.top_modules} />
      <ContribList title="Top vendors" items={data.top_vendors} />
      <ContribList title="Top customers" items={data.top_customers} />
    </div>
  );
}

function ContribList({ title, items }: { title: string; items: { name: string; amount: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {(!items || items.length === 0) && <p className="text-muted-foreground text-xs">No contributions</p>}
        {(items || []).map((x, i) => (
          <div key={i} className="flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="font-mono">{formatCurrency(x.amount)}</span></div>
        ))}
      </CardContent>
    </Card>
  );
}

function AnalyticsPanel({ data }: { data: any }) {
  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Monthly movement</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.monthly_movement || []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">YTD movement</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.ytd_movement || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="net" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Debit vs Credit trend</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.debit_credit_trend || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="debit" fill="#059669" />
              <Bar dataKey="credit" fill="#e11d48" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Volume & size</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Transaction volume</span><span className="font-mono">{data.transaction_volume}</span></div>
          <div className="flex justify-between"><span>Average transaction size</span><span className="font-mono">{formatCurrency(data.average_transaction_size)}</span></div>
          <div className="pt-2">
            <div className="text-xs font-medium mb-1">Most active posting days</div>
            {(data.most_active_posting_days || []).map((d: any) => (
              <div key={d.day} className="flex justify-between text-xs"><span>{d.day}</span><span>{d.count}</span></div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-base">Largest transaction history</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm max-h-48 overflow-y-auto">
          {(data.largest_transaction_history || []).map((t: any, i: number) => (
            <div key={i} className="flex justify-between border-b py-1">
              <span>{t.date} · {t.type}</span>
              <span className="font-mono">{formatCurrency(t.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SourcePanel({ data, nameFilter }: { data: any; nameFilter?: string }) {
  if (!data) return <Skeleton className="h-64 w-full" />;
  const sections = [
    ['by_module', 'Contribution by Module'],
    ['by_vendor', 'Contribution by Vendor'],
    ['by_customer', 'Contribution by Customer'],
    ['by_project', 'Contribution by Project'],
    ['by_document_type', 'Contribution by Document Type'],
    ['by_month', 'Contribution by Month'],
    ['by_category', 'Contribution by Category'],
  ] as const;
  // Phase 4C Part 6: journal_entry_items has no employee/asset/product FK and
  // no RPC buckets the dimensions jsonb column yet — these are declared here
  // (extensible: adding a real implementation later is a drop-in swap for
  // the "unavailable" entry) rather than fabricated as empty contributions.
  const unavailable = [
    { key: 'employee', label: 'Contribution by Employee', reason: 'journal lines carry no employee reference yet' },
    { key: 'asset', label: 'Contribution by Asset', reason: 'fixed-asset postings are not broken out per asset yet' },
    { key: 'inventory', label: 'Contribution by Inventory', reason: 'inventory postings are not broken out per product yet' },
    { key: 'dimension', label: 'Contribution by Dimension', reason: 'cost centre / department / business unit tagging is not bucketed yet' },
  ];
  const filterItems = (items: { name: string; amount: number }[]) => {
    if (!nameFilter) return items;
    const term = nameFilter.toLowerCase();
    return items.filter((x) => x.name.toLowerCase().includes(term));
  };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {sections.map(([key, title]) => (
        <ContribList key={key} title={title} items={filterItems(data[key] || [])} />
      ))}
      {unavailable.map((u) => (
        <Card key={u.key} className="border-dashed">
          <CardHeader className="pb-2"><CardTitle className="text-base text-muted-foreground">{u.label}</CardTitle></CardHeader>
          <CardContent>
            <Badge variant="outline" className="mb-2">Not yet available</Badge>
            <p className="text-xs text-muted-foreground">{u.reason}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TrendBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-muted-foreground text-xs">—</span>;
  const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus;
  const tone = pct > 0.5 ? 'text-emerald-700 dark:text-emerald-400' : pct < -0.5 ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-mono', tone)}>
      <Icon className="h-3.5 w-3.5" /> {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function VarianceRow({ label, v }: { label: string; v: any }) {
  if (!v) return null;
  if (v.available === false) {
    return (
      <div className="flex items-center justify-between border-b py-2 text-sm">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">{v.reason || 'Not available'}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm gap-3">
      <span className="shrink-0">{label}</span>
      <div className="flex items-center gap-3 font-mono text-xs">
        <span>{formatCurrency(v.current)}</span>
        <span className="text-muted-foreground">vs {v.prior != null ? formatCurrency(v.prior) : '—'}</span>
        <span>{v.absolute_variance != null ? formatCurrency(v.absolute_variance) : '—'}</span>
        <TrendBadge pct={v.percentage_variance} />
        {v.is_material && <Badge variant="secondary" className="text-[10px]">Material</Badge>}
      </div>
    </div>
  );
}

function VariancePanel({ data }: { data: any }) {
  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Variance Analysis — {data.account_name}</CardTitle>
        <CardDescription>Materiality: ±{data.materiality?.percentage_threshold}% or {formatCurrency(data.materiality?.absolute_threshold)}</CardDescription>
      </CardHeader>
      <CardContent>
        <VarianceRow label="Month vs Month" v={data.month_vs_month} />
        <VarianceRow label="Year vs Year (YTD)" v={data.year_vs_year} />
        <VarianceRow label="Opening vs Closing" v={data.opening_vs_closing} />
        <VarianceRow label="Budget vs Actual" v={data.budget_vs_actual} />
      </CardContent>
    </Card>
  );
}

function DriversPanel({ drivers, insights, onOpenJournal }: { drivers: any; insights: any; onOpenJournal: (journalEntryId: string) => void }) {
  if (!drivers) return <Skeleton className="h-64 w-full" />;
  const directionLabel = drivers.direction === 'increase' ? 'increased' : drivers.direction === 'decrease' ? 'decreased' : 'stayed flat';
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {drivers.account_name} {directionLabel} by {formatCurrency(Math.abs(drivers.net_movement))}
            {drivers.is_material_movement && <Badge variant="secondary">Material</Badge>}
          </CardTitle>
          <CardDescription>
            {drivers.period?.start_date} → {drivers.period?.end_date} · driven by <span className="capitalize">{drivers.driver_lens}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {(drivers.drivers || []).length === 0 && <p className="text-sm text-muted-foreground">No posting activity in this period.</p>}
          {(drivers.drivers || []).map((d: any, i: number) => (
            <div key={i} className="flex items-center justify-between border-b py-1.5 text-sm">
              <span className="truncate">{d.label}</span>
              <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                <span>{formatCurrency(d.amount)}</span>
                <span className="text-muted-foreground">{d.share_pct.toFixed(0)}%</span>
                {d.is_material && <Badge variant="secondary" className="text-[10px]">Material</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Largest Journal</CardTitle></CardHeader>
        <CardContent>
          {insights?.largest_journal ? (
            <button
              type="button"
              className="w-full text-left rounded border p-2 hover:bg-accent/40 flex items-center justify-between gap-2"
              onClick={() => onOpenJournal(insights.largest_journal.journal_entry_id)}
            >
              <div>
                <div className="font-medium text-sm">{insights.largest_journal.journal_number || '—'}</div>
                <div className="text-xs text-muted-foreground">{insights.largest_journal.entry_date} · {insights.largest_journal.description || '—'}</div>
              </div>
              <div className="flex items-center gap-1 font-mono text-sm shrink-0">
                {formatCurrency(insights.largest_journal.total_amount)} <ExternalLink className="h-3.5 w-3.5" />
              </div>
            </button>
          ) : <p className="text-sm text-muted-foreground">No journals in this period.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Highest Posting Day / Most Active Month</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Highest posting day</span><span className="font-mono">{insights?.highest_posting_day?.date || '—'}</span></div>
          <div className="flex justify-between"><span>Most active month</span><span className="font-mono">{insights?.most_active_month?.month || '—'} ({insights?.most_active_month?.txn_count ?? 0} txns)</span></div>
        </CardContent>
      </Card>
    </div>
  );
}

function WarningBadge({ active, material, label }: { active: boolean; material?: boolean; label: string }) {
  return (
    <div className={cn('flex items-center justify-between rounded border p-2 text-sm', active ? 'border-amber-400/60 bg-amber-50 dark:bg-amber-950/30' : '')}>
      <span className="flex items-center gap-2">
        {active ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Info className="h-4 w-4 text-muted-foreground" />}
        {label}
      </span>
      {active ? (
        <Badge variant={material ? 'destructive' : 'secondary'}>{material ? 'Material' : 'Flagged'}</Badge>
      ) : (
        <Badge variant="outline">Clear</Badge>
      )}
    </div>
  );
}

function InsightsPanel({ data }: { data: any }) {
  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Warnings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <WarningBadge active={data.negative_balance_warning} material={data.balance_warning_is_material} label="Negative balance" />
          <WarningBadge active={data.abnormal_balance_warning} material={data.balance_warning_is_material} label="Abnormal balance" />
          <WarningBadge active={data.unexpected_posting_direction} label="Unexpected posting direction" />
          <WarningBadge active={data.dormant_account} label="Dormant account" />
          <WarningBadge active={data.high_transaction_frequency} label="High transaction frequency" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Activity Signals</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Days since last posting</span><span className="font-mono">{data.days_since_last_posting ?? '—'}</span></div>
          <div className="flex justify-between"><span>Transactions this period</span><span className="font-mono">{data.transaction_count_period}</span></div>
          <div className="flex justify-between"><span>Company average</span><span className="font-mono">{data.company_average_transaction_count}</span></div>
          <div className="flex justify-between"><span>Highest posting day</span><span className="font-mono">{data.highest_posting_day?.date || '—'}</span></div>
          <div className="flex justify-between"><span>Most active month</span><span className="font-mono">{data.most_active_month?.month || '—'}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComparisonPanel({ data }: { data: any }) {
  if (!data) return <Skeleton className="h-64 w-full" />;
  const p = data.points || {};
  const rows = [
    ['Current Month', p.current_month],
    ['Previous Month', p.previous_month],
    ['Same Month Last Year', p.same_month_last_year],
    ['Current Year', p.current_year],
    ['Previous Year', p.previous_year],
  ] as const;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Account Comparison — {data.account_name}</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {rows.map(([label, point]) => (
            <div key={label} className="flex justify-between border-b py-1.5 text-sm">
              <span>{label} <span className="text-muted-foreground text-xs">({point?.label})</span></span>
              <span className="font-mono">{formatCurrency(point?.net_movement || 0)}</span>
            </div>
          ))}
          <div className="pt-3 space-y-1.5">
            <div className="flex justify-between text-sm"><span>vs Previous Month</span><TrendBadge pct={data.trends?.vs_previous_month} /></div>
            <div className="flex justify-between text-sm"><span>vs Same Month Last Year</span><TrendBadge pct={data.trends?.vs_same_month_last_year} /></div>
            <div className="flex justify-between text-sm"><span>vs Previous Year</span><TrendBadge pct={data.trends?.vs_previous_year} /></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Trend</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.monthly_series || []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="net_movement" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export default GeneralLedger;
