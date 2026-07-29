import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, BookOpen, Scale, ClipboardList, Book, PlusCircle,
  AlertTriangle, CheckCircle2, Clock, ArrowRight, Settings2, TrendingUp, TrendingDown,
  Moon, Activity, Landmark, ShieldCheck, BookOpenCheck, Radio,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingDashboardQuery } from '../../lib/accountingQueries';
import { accountingPolicyDashboardQuery, accountingRulesDashboardQuery, businessEventsDashboardQuery } from '../../lib/queries';
import { accountingApi } from '../../lib/accountingWorkspace';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatCurrency, cn } from '../../lib/utils';
import AccountingSearch from '../../components/accounting/AccountingSearch';
import MaterialitySettingsDialog from '../../components/accounting/MaterialitySettingsDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';

const AccountingDashboard = () => {
  useDocumentTitle('Accounting Dashboard');
  const { activeCompany, role } = useAuth();
  const isAdmin = role === 'owner' || role === 'admin';
  const [materialityOpen, setMaterialityOpen] = useState(false);
  const { data, isLoading } = useQuery({
    ...accountingDashboardQuery(activeCompany!.id),
    enabled: !!activeCompany,
    refetchInterval: 30_000,
  });

  // Phase 4C Part 3: Dashboard Intelligence, backed by GET_INTELLIGENCE_DASHBOARD.
  const { data: intelligence, isLoading: intelligenceLoading } = useQuery({
    queryKey: ['intelligence-dashboard', activeCompany?.id],
    queryFn: () => accountingApi.intelligenceDashboard(activeCompany!.id),
    enabled: !!activeCompany,
    refetchInterval: 60_000,
  });

  const { data: policyDashboard } = useQuery({
    ...accountingPolicyDashboardQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
    refetchInterval: 60_000,
  });

  const { data: rulesDashboard } = useQuery({
    ...accountingRulesDashboardQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
    refetchInterval: 60_000,
  });

  const { data: eventsDashboard } = useQuery({
    ...businessEventsDashboardQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
    refetchInterval: 60_000,
  });

  const d = data as any;

  if (isLoading || !d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={`dash-skel-${i}`} className="h-24" />)}
        </div>
      </div>
    );
  }

  const fy = d.current_financial_year;
  const period = d.current_accounting_period;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-7 w-7" /> Accounting Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Operational control centre — every posting is traceable to the ledger.
          </p>
        </div>
        <AccountingSearch />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Financial Year" value={fy?.year_code || '—'} hint={fy?.status} />
        <Stat label="Accounting Period" value={period ? `P${period.period_number}` : '—'} hint={d.period_status} />
        <Stat label="Open Periods" value={String(d.open_periods ?? '—')} />
        <Stat label="Closed Periods" value={String(d.closed_periods ?? '—')} />
        <Stat label="Pending Postings" value={String(d.pending_posting_requests ?? '—')} tone={d.pending_posting_requests ? 'warn' : 'ok'} />
        <Stat label="Failed / Stuck" value={String(d.failed_posting_requests ?? '—')} tone={d.failed_posting_requests ? 'danger' : 'ok'} />
        <Stat label="Posted Journals Today" value={String(d.posted_journals_today ?? '—')} />
        <Stat label="Transactions Today" value={String(d.transactions_today ?? '—')} />
      </div>

      {policyDashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Accounting Policies" value={String(policyDashboard.totalPolicies)} hint={`${policyDashboard.enabledPolicies} active`} />
          <Stat label="Passed (30d)" value={String(policyDashboard.passedCount)} tone="ok" />
          <Stat label="Violations (30d)" value={String(policyDashboard.violationCount)} tone={policyDashboard.violationCount ? 'warn' : 'ok'} />
          <Stat label="Overrides (30d)" value={String(policyDashboard.overrideCount)} />
        </div>
      )}

      {rulesDashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Accounting Rules" value={String(rulesDashboard.totalRules)} hint="total catalog" />
          <Stat label="System Rules" value={String(rulesDashboard.systemRules)} />
          <Stat label="Company Rules" value={String(rulesDashboard.companyRules)} />
          <Stat label="Industry Rules" value={String(rulesDashboard.industryRules)} />
        </div>
      )}

      {eventsDashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Events Today" value={String(eventsDashboard.eventsToday)} />
          <Stat label="Failed Events" value={String(eventsDashboard.failedEvents)} tone={eventsDashboard.failedEvents ? 'danger' : 'ok'} />
          <Stat label="Retries (30d)" value={String(eventsDashboard.retries)} />
          <Stat label="Dead Letter" value={String(eventsDashboard.deadLetterCount)} tone={eventsDashboard.deadLetterCount ? 'warn' : 'ok'} />
        </div>
      )}

      {eventsDashboard && eventsDashboard.recentEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Recent Business Events
            </CardTitle>
            <CardDescription>Published events and orchestrator delivery status.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {eventsDashboard.recentEvents.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{e.businessEvent}</div>
                    <div className="text-muted-foreground">{e.sourceModule} · {e.eventType}</div>
                    <div className="text-xs text-muted-foreground font-mono">{e.correlationId}</div>
                  </div>
                  <Badge variant="outline" className="capitalize shrink-0">{e.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {eventsDashboard && eventsDashboard.slowestSubscribers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Slowest Subscribers (30d)</CardTitle>
            <CardDescription>Average delivery duration per subscriber.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {eventsDashboard.slowestSubscribers.map((s) => (
                <li key={s.subscriberId} className="flex justify-between gap-2 border-b pb-2 last:border-0">
                  <span>{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">{s.avgDurationMs}ms · {s.deliveryCount} deliveries</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {rulesDashboard && rulesDashboard.recentlyExecuted.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpenCheck className="h-4 w-4" />
              Recently Executed Rules
            </CardTitle>
            <CardDescription>Business events converted to journal entries by the Rules Engine.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {rulesDashboard.recentlyExecuted.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{r.ruleName}</div>
                    <div className="text-muted-foreground">{r.businessEvent} · {r.module}</div>
                  </div>
                  <Badge variant="outline" className="capitalize shrink-0">{r.result}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {policyDashboard && policyDashboard.recentViolations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Recent Policy Violations
            </CardTitle>
            <CardDescription>Preventive rules blocked or flagged these postings.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {policyDashboard.recentViolations.slice(0, 5).map((v) => (
                <li key={v.id} className="flex items-start gap-2 border-b pb-2 last:border-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">{v.policyName}</div>
                    <div className="text-muted-foreground">{v.message}</div>
                    <div className="text-xs text-muted-foreground">{v.module ?? '—'} · {new Date(v.createdAt).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Last Posting</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {d.last_posting ? (
              <>
                <div className="font-semibold">{d.last_posting?.journal_number || '—'}</div>
                <div className="text-muted-foreground">{d.last_posting?.module ?? '—'} · {d.last_posting?.document_type || '—'}</div>
                <div className="text-xs text-muted-foreground">
                  {d.last_posting?.committed_at ? new Date(d.last_posting.committed_at).toLocaleString() : '—'}
                </div>
              </>
            ) : <p className="text-muted-foreground">No postings yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Journal Balance Status
              {d.journal_balance_status?.unbalanced ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
            </CardTitle>
            <CardDescription>Sample of {d.journal_balance_status?.sample_size ?? 0} recent journals</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <div>Balanced: {d.journal_balance_status?.balanced ?? 0}</div>
            <div>Unbalanced: {d.journal_balance_status?.unbalanced ?? 0}</div>
            <div className="text-muted-foreground mt-1">Unposted documents: {d.unposted_documents ?? '—'}</div>
            <div className="text-muted-foreground">Draft journals: {d.draft_journals ?? '—'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild size="sm"><Link to="/journal-entries"><PlusCircle className="mr-2 h-4 w-4" /> New Manual Journal</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/trial-balance"><Scale className="mr-2 h-4 w-4" /> Open Trial Balance</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/general-ledger"><BookOpen className="mr-2 h-4 w-4" /> Account Activity</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/accounting/posting-requests"><ClipboardList className="mr-2 h-4 w-4" /> Open Posting Requests</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/chart-of-accounts"><Book className="mr-2 h-4 w-4" /> Open Chart of Accounts</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/accounting/health">Financial Health</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/accounting/timeline">Accounting Timeline</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/accounting/period-close">Period Close Readiness</Link></Button>
          </CardContent>
        </Card>
      </div>

      <IntelligenceSection data={intelligence as any} isLoading={intelligenceLoading} isAdmin={isAdmin} onOpenMateriality={() => setMaterialityOpen(true)} />
      <MaterialitySettingsDialog open={materialityOpen} onOpenChange={setMaterialityOpen} />

      <div className="grid md:grid-cols-2 gap-4">
        <ActivityList title="Recent Activity" items={d.recent_activity} />
        <ActivityList title="Recent Manual Journals" items={d.recent_manual_journals} />
        <ActivityList title="Recent Bank Postings" items={d.recent_bank_postings} />
        <ActivityList title="Recent Purchase Postings" items={d.recent_purchase_postings} />
        <ActivityList title="Recent Sales Postings" items={d.recent_sales_postings} />
        <ActivityList title="Recent Payroll Postings" items={d.recent_payroll_postings} />
        <ActivityList title="Recent Fixed Asset Postings" items={d.recent_fixed_asset_postings} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Exceptions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/accounting/exceptions">
                Open Suspense & Exceptions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {hint && (
          <Badge
            variant={tone === 'danger' ? 'destructive' : tone === 'warn' ? 'secondary' : 'outline'}
            className="mt-2 capitalize"
          >
            {hint}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function activityItemKey(item: any, index: number): string {
  // Index is always included: recent_purchase/fixed-asset lists concat
  // filtered module slices and can surface the same posting_request twice.
  const id = item?.id != null && item.id !== '' ? String(item.id) : null;
  if (id) return `${id}|${index}`;
  const parts = [item?.journal_number, item?.reference, item?.module, item?.committed_at, item?.created_at]
    .filter((v) => v != null && v !== '')
    .map(String);
  return parts.length > 0 ? `${parts.join('|')}|${index}` : `activity-${index}`;
}

function ActivityList({ title, items }: { title: string; items: any[] }) {
  const rows = Array.isArray(items) ? items : [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent items.</p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 5).map((item: any, index: number) => {
              const idPreview = item?.id != null ? String(item.id).slice(0, 8) : null;
              const titleText = item?.journal_number || item?.reference || idPreview || 'Untitled posting';
              return (
                <li key={activityItemKey(item, index)} className="flex items-start justify-between gap-2 text-sm border-b pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{titleText}</div>
                    <div className="text-xs text-muted-foreground">
                      {item?.module ?? '—'} · {item?.description || item?.document_type || '—'}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize shrink-0">{item?.status ?? 'unknown'}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Phase 4C Part 3: Dashboard Intelligence — every figure here comes from
// GET_INTELLIGENCE_DASHBOARD (server-side aggregation + materiality
// filtering), no client-side ledger scanning.
//
// Certification Blocker 1 fix: every row/card that names an account is a
// Link into the existing General Ledger Intelligence Workspace
// (`/general-ledger?account_id=...`), reusing GeneralLedger.tsx's existing
// `searchParams.get('account_id')` selection — no new route, no new
// drill-through component, no duplicated navigation logic. From there, the
// existing Activity Timeline → TraceabilityDrawer chain (Journal → Posting
// Request → Source Document → Attachment) is already wired and unchanged.
function accountLink(accountId: string) {
  return `/general-ledger?account_id=${accountId}`;
}

/** Display money without fabricating zeros for absent values. */
function safeMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return formatCurrency(n);
}

/**
 * Resolve a human label for an intelligence row's related account.
 * Missing account metadata is a data-quality signal — never invent a name.
 */
function resolveAccountLabel(row: { account_name?: string | null; account_id?: string | null } | null | undefined): {
  label: string;
  missingAccount: boolean;
} {
  const name = row?.account_name?.trim();
  if (name) return { label: name, missingAccount: false };
  const id = row?.account_id;
  if (id) return { label: `Account ${String(id).slice(0, 8)}…`, missingAccount: true };
  return { label: 'Account unavailable', missingAccount: true };
}

function IntelligenceSection({ data, isLoading, isAdmin, onOpenMateriality }: { data: any; isLoading: boolean; isAdmin: boolean; onOpenMateriality: () => void }) {
  const pct = data?.materiality?.percentage_threshold;
  const abs = data?.materiality?.absolute_threshold;
  const materialityLabel = data
    ? `Materiality: ±${pct != null ? pct : '—'}% or ${safeMoney(abs)}`
    : 'Loading materiality settings…';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Activity className="h-5 w-5" /> Accounting Intelligence</h2>
          <p className="text-sm text-muted-foreground">{materialityLabel}</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={onOpenMateriality}>
            <Settings2 className="mr-2 h-4 w-4" /> Configure Materiality
          </Button>
        )}
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={`intel-skel-${i}`} className="h-24" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-4 gap-3">
          <MovementCard title="Largest Expense Growth" icon={TrendingUp} row={data.largest_expense_growth} />
          <MovementCard title="Largest Income Growth" icon={TrendingUp} row={data.largest_income_growth} />
          <MovementCard title="Biggest Balance Movement" icon={TrendingDown} row={data.biggest_balance_movement} balanceMode />

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Landmark className="h-4 w-4" /> Top Posting Modules</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {(data.top_posting_modules || []).length === 0 && <p className="text-xs text-muted-foreground">No postings this period.</p>}
              {(data.top_posting_modules || []).slice(0, 5).map((m: any, index: number) => {
                const moduleKey = m?.module != null && m.module !== '' ? String(m.module) : `module-${index}`;
                const moduleLabel = m?.module != null ? String(m.module).replace(/_/g, ' ') : 'Unknown module';
                return (
                  <div key={moduleKey} className="flex justify-between text-xs">
                    <span className="capitalize">{moduleLabel}</span>
                    <span className="font-mono">{m?.count ?? '—'}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <AccountListCard
            title="Accounts Needing Review"
            icon={AlertTriangle}
            iconClassName="text-amber-600"
            items={data.accounts_needing_review}
            emptyMessage="Nothing needs review."
            className="md:col-span-2"
            renderRight={(r: any) => (
              <Badge variant="outline" className="text-[10px] capitalize">
                {r?.reason != null ? String(r.reason).replace(/_/g, ' ') : 'unspecified'}
              </Badge>
            )}
          />

          <AccountListCard
            title="Dormant / Inactive"
            icon={Moon}
            items={data.inactive_accounts}
            emptyMessage="No dormant accounts."
            renderRight={(a: any) => <span className="text-muted-foreground">{a?.last_posting_date || 'never'}</span>}
          />

          <AccountListCard
            title="Abnormal Balances"
            icon={AlertTriangle}
            iconClassName="text-destructive"
            items={data.accounts_with_abnormal_balances}
            emptyMessage="No abnormal balances."
            renderRight={(a: any) => <span className="font-mono text-destructive">{safeMoney(a?.balance)}</span>}
          />

          <AccountListCard
            title="High Activity Accounts"
            icon={TrendingUp}
            items={data.recent_unusual_activity}
            emptyMessage="No unusually large movements this period."
            className="md:col-span-2"
            renderRight={(r: any) => <span className="font-mono">{safeMoney(r?.delta)}</span>}
          />
        </div>
      )}
    </div>
  );
}

function MovementCard({ title, icon: Icon, row, balanceMode }: { title: string; icon: any; row: any; balanceMode?: boolean }) {
  // Guard BEFORE any nested account / amount access. Intelligence RPCs
  // legitimately return null when no material movement exists this period.
  if (!row) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No material movement this period.</p>
        </CardContent>
      </Card>
    );
  }

  // Related account may be absent (deleted CoA row, stale intelligence, optional
  // relationship) even when movement metrics exist — never assume it is present.
  const { label, missingAccount } = resolveAccountLabel(row);
  const accountId = row.account_id != null && row.account_id !== '' ? String(row.account_id) : null;
  const from = balanceMode ? row.previous_balance : row.previous;
  const to = balanceMode ? row.current_balance : row.current;

  const content = (
    <>
      <div className="font-medium text-sm truncate flex items-center gap-1.5">
        <span className="truncate">{label}</span>
        {missingAccount && (
          <Badge variant="secondary" className="text-[10px] shrink-0" title="Related chart-of-accounts record is missing">
            Missing account
          </Badge>
        )}
      </div>
      <div className="font-mono text-lg mt-1">{safeMoney(row.delta)}</div>
      <div className="text-xs text-muted-foreground mt-1">
        {safeMoney(from)} → {safeMoney(to)}
      </div>
    </>
  );

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</CardTitle></CardHeader>
      <CardContent>
        {accountId ? (
          <Link to={accountLink(accountId)} className="block hover:opacity-80 transition-opacity">{content}</Link>
        ) : content}
      </CardContent>
    </Card>
  );
}

function accountListItemKey(r: any, index: number): string {
  // accounts_needing_review can list the same account_id under multiple reasons
  const id = r?.account_id != null && r.account_id !== '' ? String(r.account_id) : 'no-account';
  const reason = r?.reason != null && r.reason !== '' ? String(r.reason) : 'row';
  return `${id}|${reason}|${index}`;
}

// Shared list card for every "rows that name an account" dashboard widget —
// one implementation instead of four near-identical copies.
function AccountListCard({
  title, icon: Icon, iconClassName, items, emptyMessage, renderRight, className,
}: {
  title: string; icon: any; iconClassName?: string; items: any[] | undefined; emptyMessage: string;
  renderRight: (item: any) => ReactNode; className?: string;
}) {
  const rows = Array.isArray(items) ? items : [];
  return (
    <Card className={className}>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Icon className={cn('h-4 w-4', iconClassName)} /> {title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 max-h-40 overflow-y-auto">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">{emptyMessage}</p>}
        {rows.map((r: any, i: number) => {
          const { label, missingAccount } = resolveAccountLabel(r);
          const accountId = r?.account_id != null && r.account_id !== '' ? String(r.account_id) : null;
          const rowBody = (
            <>
              <span className="truncate flex items-center gap-1 min-w-0">
                <span className="truncate">{label}</span>
                {missingAccount && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">Missing</Badge>
                )}
              </span>
              {renderRight(r)}
            </>
          );
          const classNameRow = 'flex justify-between items-center gap-2 text-xs border-b pb-1 last:border-0';
          return accountId ? (
            <Link
              key={accountListItemKey(r, i)}
              to={accountLink(accountId)}
              className={cn(classNameRow, 'hover:bg-accent/40 rounded px-1 -mx-1')}
            >
              {rowBody}
            </Link>
          ) : (
            <div key={accountListItemKey(r, i)} className={classNameRow}>{rowBody}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default AccountingDashboard;
