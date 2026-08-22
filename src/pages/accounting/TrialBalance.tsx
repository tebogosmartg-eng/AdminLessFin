import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Scale, ChevronRight, ChevronDown, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import { hierarchicalTrialBalanceQuery } from '../../lib/accountingQueries';
import { accountingApi } from '../../lib/accountingWorkspace';
import { accountantPrefs } from '../../lib/accountantProductivity';
import { cn, formatCurrency, downloadCSV } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { AnalyticsEvents, useFirstUsagePageView } from '../../lib/analytics';
import AccountingSearch from '../../components/accounting/AccountingSearch';
import EnterpriseAccountCard from '../../components/accounting/EnterpriseAccountCard';
import TraceabilityDrawer from '../../components/accounting/TraceabilityDrawer';
import ReportingPeriodPicker from '../../components/ReportingPeriodPicker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { EmptyState } from '../../components/EmptyState';

type TbRow = {
  account_id: string;
  account_number: number;
  account_name: string;
  account_type: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
  net_movement: number;
  current_balance: number;
  opening_balance: number;
  hierarchy_l1: string;
  hierarchy_l2: string;
  hierarchy_l3: string;
  classification_required?: boolean;
  normal_balance: string;
};

const TrialBalance = () => {
  useDocumentTitle('Trial Balance');
  const { activeCompany } = useAuth();
  useFirstUsagePageView(AnalyticsEvents.USAGE_FIRST_TRIAL_BALANCE, 'trial_balance');
  const companyId = activeCompany?.id;
  const { dateFrom, dateTo, isReady } = useReportingPeriod();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const [cardAccountId, setCardAccountId] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ journal_entry_id?: string; posting_request_id?: string; account_id?: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    setExpanded(accountantPrefs.getTbExpansion(companyId));
  }, [companyId]);

  const persistExpansion = (next: Record<string, boolean>) => {
    setExpanded(next);
    if (companyId) accountantPrefs.setTbExpansion(companyId, next);
  };

  const startDate = dateFrom ?? '';
  const endDate = dateTo ?? '';

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    ...hierarchicalTrialBalanceQuery(companyId!, startDate, endDate),
    enabled: !!companyId && isReady,
    refetchInterval: 60_000,
  });

  const { data: expandData, isLoading: expandLoading } = useQuery({
    queryKey: ['tb-expand', companyId, openAccountId, startDate, endDate],
    queryFn: () => accountingApi.trialBalanceExpand(companyId!, openAccountId!, startDate, endDate),
    enabled: !!companyId && !!openAccountId,
  });

  const rows: TbRow[] = (data as any)?.rows || [];
  const totals = (data as any)?.totals;

  const tree = useMemo(() => {
    const map: Record<string, Record<string, Record<string, TbRow[]>>> = {};
    for (const r of rows) {
      if (!map[r.hierarchy_l1]) map[r.hierarchy_l1] = {};
      if (!map[r.hierarchy_l1][r.hierarchy_l2]) map[r.hierarchy_l1][r.hierarchy_l2] = {};
      if (!map[r.hierarchy_l1][r.hierarchy_l2][r.hierarchy_l3]) map[r.hierarchy_l1][r.hierarchy_l2][r.hierarchy_l3] = [];
      map[r.hierarchy_l1][r.hierarchy_l2][r.hierarchy_l3].push(r);
    }
    return map;
  }, [rows]);

  const toggle = (key: string) => {
    persistExpansion({ ...expanded, [key]: !(expanded[key] ?? true) });
  };
  const isOpen = (key: string) => expanded[key] ?? true;

  const handleExport = () => {
    downloadCSV(rows.map((r) => ({
      L1: r.hierarchy_l1, L2: r.hierarchy_l2, L3: r.hierarchy_l3,
      ClassificationRequired: r.classification_required ? 'Yes' : 'No',
      AccountNumber: r.account_number, AccountName: r.account_name,
      OpeningDebit: r.opening_debit, OpeningCredit: r.opening_credit,
      PeriodDebit: r.period_debit, PeriodCredit: r.period_credit,
      ClosingDebit: r.closing_debit, ClosingCredit: r.closing_credit,
      NetMovement: r.net_movement,
    })), `trial-balance-hierarchical-${endDate}.csv`);
  };

  const unclassifiedCount = useMemo(
    () => rows.filter((r) => r.classification_required).length,
    [rows],
  );

  // Visual group subtotals only — presentation of displayed TB rows (not accounting authority).
  // Accounting totals (balanced / closing DR/CR) come from response.totals + CFA on the edge.
  const sumClosing = (list: TbRow[]) => list.reduce((s, r) => s + r.closing_debit - r.closing_credit, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Scale className="h-7 w-7" /> Trial Balance Explorer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Interactive hierarchical inquiry — expand any account without leaving this screen.
          </p>
        </div>
        <div className="flex gap-2">
          <AccountingSearch />
          <Button variant="outline" onClick={handleExport} disabled={!rows.length}><Download className="mr-2 h-4 w-4" /> Export</Button>
        </div>
      </div>

      {unclassifiedCount > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1">
            <strong>{unclassifiedCount}</strong> {unclassifiedCount === 1 ? 'account has' : 'accounts have'} no
            classification, so {unclassifiedCount === 1 ? 'it groups' : 'they group'} under &ldquo;Classification
            Required&rdquo; rather than under a current or non-current heading. Balances are unaffected.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to="/chart-of-accounts?classification=required">Classify in Chart of Accounts</Link>
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Hierarchical Trial Balance</CardTitle>
              <CardDescription>
                {isFetching ? 'Updating…' : `Live · ${dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}`}
                {(data as any) && (
                  <Badge className="ml-2" variant={(data as any).balanced ? 'outline' : 'destructive'}>
                    {(data as any).balanced ? 'Balanced' : 'Out of balance'}
                  </Badge>
                )}
              </CardDescription>
            </div>
            <ReportingPeriodPicker showLabel={false} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No balances to show yet"
              description="The trial balance populates once you post invoices, bills, or journal entries. Complete Accounting Setup first, then record your first transaction."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild variant="outline">
                    <Link to="/accounting-setup">Accounting Setup</Link>
                  </Button>
                  <Button asChild>
                    <Link to="/invoices">Create an invoice</Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_repeat(6,minmax(80px,100px))] gap-2 text-xs font-medium text-muted-foreground px-2 py-2 border-b sticky top-0 bg-background z-10">
                <div>Account / Hierarchy</div>
                <div className="text-right">Open Dr</div>
                <div className="text-right">Open Cr</div>
                <div className="text-right">Period Dr</div>
                <div className="text-right">Period Cr</div>
                <div className="text-right">Close Dr</div>
                <div className="text-right">Close Cr</div>
              </div>

              {Object.entries(tree).map(([l1, l2map]) => {
                const l1Rows = Object.values(l2map).flatMap((l3) => Object.values(l3).flat());
                return (
                  <div key={l1}>
                    <button type="button" onClick={() => toggle(l1)} className="w-full flex items-center gap-2 px-2 py-2 font-semibold bg-muted/50 hover:bg-muted rounded-md">
                      {isOpen(l1) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="flex-1 text-left">{l1}</span>
                      <span className="font-mono text-xs">{formatCurrency(Math.abs(sumClosing(l1Rows)))}</span>
                    </button>
                    {isOpen(l1) && Object.entries(l2map).map(([l2, l3map]) => {
                      const l2Key = `${l1}/${l2}`;
                      const l2Rows = Object.values(l3map).flat();
                      return (
                        <div key={l2Key} className="ml-3">
                          <button type="button" onClick={() => toggle(l2Key)} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium hover:bg-accent/50 rounded">
                            {isOpen(l2Key) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <span className="flex-1 text-left">{l2}</span>
                            <span className="font-mono text-xs text-muted-foreground">{formatCurrency(Math.abs(sumClosing(l2Rows)))}</span>
                          </button>
                          {isOpen(l2Key) && Object.entries(l3map).map(([l3, accounts]) => {
                            const l3Key = `${l2Key}/${l3}`;
                            // The classification appears exactly once. When an
                            // account carries no statement line the edge returns
                            // l3 === l2, and we render the accounts directly
                            // rather than repeating the heading under itself.
                            const isRedundantLevel = l3 === l2;
                            return (
                              <div key={l3Key} className="ml-4">
                                {!isRedundantLevel && (
                                  <button type="button" onClick={() => toggle(l3Key)} className="w-full flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:bg-accent/40 rounded">
                                    {isOpen(l3Key) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    <span className="flex-1 text-left">{l3}</span>
                                  </button>
                                )}
                                {(isRedundantLevel || isOpen(l3Key)) && accounts.map((r) => (
                                  <div key={r.account_id}>
                                    <button
                                      type="button"
                                      className={cn(
                                        'w-full grid grid-cols-[1fr_repeat(6,minmax(80px,100px))] gap-2 px-2 py-2 text-sm hover:bg-accent/50 border-b text-left',
                                        openAccountId === r.account_id && 'bg-accent/40'
                                      )}
                                      onClick={() => setOpenAccountId((id) => id === r.account_id ? null : r.account_id)}
                                      onDoubleClick={() => setCardAccountId(r.account_id)}
                                    >
                                      <div>
                                        <span className="font-mono text-xs mr-2">{r.account_number}</span>
                                        <span className="font-medium">{r.account_name}</span>
                                        {r.classification_required && (
                                          <Badge variant="destructive" className="ml-2 text-[10px]">Classification required</Badge>
                                        )}
                                      </div>
                                      <div className="text-right font-mono text-xs">{r.opening_debit ? formatCurrency(r.opening_debit) : ''}</div>
                                      <div className="text-right font-mono text-xs">{r.opening_credit ? formatCurrency(r.opening_credit) : ''}</div>
                                      <div className="text-right font-mono text-xs">{r.period_debit ? formatCurrency(r.period_debit) : ''}</div>
                                      <div className="text-right font-mono text-xs">{r.period_credit ? formatCurrency(r.period_credit) : ''}</div>
                                      <div className="text-right font-mono text-xs">{r.closing_debit ? formatCurrency(r.closing_debit) : ''}</div>
                                      <div className="text-right font-mono text-xs">{r.closing_credit ? formatCurrency(r.closing_credit) : ''}</div>
                                    </button>
                                    {openAccountId === r.account_id && (
                                      <div className="mx-2 mb-3 rounded-md border bg-muted/20 p-3 space-y-3">
                                        {expandLoading ? <Skeleton className="h-24 w-full" /> : expandData ? (
                                          <>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                                              <Mini label="Current" value={formatCurrency((expandData as any).current_balance)} />
                                              <Mini label="Opening" value={formatCurrency((expandData as any).opening_balance)} />
                                              <Mini label="Movement" value={formatCurrency((expandData as any).movement)} />
                                              <Mini label="Last Posting" value={(expandData as any).last_posting || '—'} />
                                              <Mini label="Txn Count" value={String((expandData as any).transaction_count || 0)} />
                                            </div>
                                            <div className="grid md:grid-cols-2 gap-3 text-sm">
                                              <div>
                                                <div className="font-medium mb-1">Recent Activity</div>
                                                {((expandData as any).recent_activity || []).slice(0, 5).map((a: any) => (
                                                  <button key={a.id} type="button" className="w-full flex justify-between border-b py-1 text-left hover:bg-accent/40"
                                                    onClick={() => setTrace({ journal_entry_id: a.journal_entry_id, account_id: r.account_id })}>
                                                    <span className="truncate">{a.journal_number || '—'} · {a.entry_date}</span>
                                                    <span className="font-mono text-xs">{a.debit ? formatCurrency(a.debit) : formatCurrency(a.credit)}</span>
                                                  </button>
                                                ))}
                                              </div>
                                              <div className="space-y-2">
                                                <div>
                                                  <div className="font-medium mb-1">Linked Journals</div>
                                                  <div className="flex flex-wrap gap-1">
                                                    {((expandData as any).linked_journals || []).map((j: any) => (
                                                      <Badge key={j.id} variant="outline">{j.journal_number || j.id?.slice(0, 8)}</Badge>
                                                    ))}
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="font-medium mb-1">Linked Documents</div>
                                                  <div className="flex flex-wrap gap-1">
                                                    {((expandData as any).linked_documents || []).map((d: any, i: number) => (
                                                      d.route ? <Button key={i} asChild size="sm" variant="outline"><Link to={d.route}>{d.document_type || d.module}</Link></Button>
                                                        : <Badge key={i} variant="secondary">{d.document_type || d.module}</Badge>
                                                    ))}
                                                    {((expandData as any).linked_documents || []).length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="font-medium mb-1">Linked Posting Requests</div>
                                                  <div className="flex flex-wrap gap-1">
                                                    {((expandData as any).linked_posting_requests || []).map((p: any) => (
                                                      <Badge key={p.id} variant="outline" className="cursor-pointer" onClick={() => setTrace({ posting_request_id: p.id, account_id: r.account_id })}>
                                                        {p.journal_number || p.id.slice(0, 8)}
                                                      </Badge>
                                                    ))}
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="font-medium mb-1">Attachments</div>
                                                  {((expandData as any).linked_attachments || []).length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                                                  {((expandData as any).linked_attachments || []).map((a: any, i: number) => (
                                                    <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-primary underline text-xs block">{a.journal_number || 'Attachment'}</a>
                                                  ))}
                                                </div>
                                                <div className="flex gap-2 pt-1">
                                                  <Button asChild size="sm" variant="outline"><Link to={`/general-ledger?account_id=${r.account_id}`}>Open Activity</Link></Button>
                                                  <Button size="sm" variant="outline" onClick={() => setCardAccountId(r.account_id)}>Account Card</Button>
                                                </div>
                                              </div>
                                            </div>
                                          </>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {totals && (
                <div className="grid grid-cols-[1fr_repeat(6,minmax(80px,100px))] gap-2 px-2 py-3 font-semibold border-t mt-2">
                  <div>Totals</div>
                  <div className="text-right font-mono text-xs">{formatCurrency(totals.opening_debit)}</div>
                  <div className="text-right font-mono text-xs">{formatCurrency(totals.opening_credit)}</div>
                  <div className="text-right font-mono text-xs">{formatCurrency(totals.period_debit)}</div>
                  <div className="text-right font-mono text-xs">{formatCurrency(totals.period_credit)}</div>
                  <div className="text-right font-mono text-xs">{formatCurrency(totals.closing_debit)}</div>
                  <div className="text-right font-mono text-xs">{formatCurrency(totals.closing_credit)}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <EnterpriseAccountCard accountId={cardAccountId} open={!!cardAccountId} onOpenChange={(o) => !o && setCardAccountId(null)} />
      <TraceabilityDrawer
        open={!!trace}
        onOpenChange={(o) => !o && setTrace(null)}
        journalEntryId={trace?.journal_entry_id}
        postingRequestId={trace?.posting_request_id}
        accountId={trace?.account_id}
      />
    </div>
  );
};

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

export default TrialBalance;
