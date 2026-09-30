import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Clock,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { EmptyState } from '../../components/EmptyState';
import { cn } from '../../lib/utils';
import { invokeCompliance } from '../api';
import { complianceKeys, useComplianceOverview } from '../queries';
import { FACT_LABEL, formatDate, periodLabel } from '../labels';
import { ApplicabilityBadge, CycleStatusBadge, SignalBadge } from '../components/badges';
import type { ComplianceOverview, ObligationSummary } from '../types';

type Filter = 'attention' | 'applies' | 'needs_information' | 'not_applicable' | 'all';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'applies', label: 'Applies' },
  { key: 'needs_information', label: 'Needs information' },
  { key: 'not_applicable', label: 'Not applicable' },
  { key: 'all', label: 'All' },
];

function needsAttention(o: ObligationSummary): boolean {
  if (o.override_conflict || o.applicability === 'needs_information') return true;
  if (o.applicability !== 'applicable') return false;
  const c = o.current_cycle;
  return !!c && (c.time_signal !== 'none' || c.status === 'action_required');
}

function matches(o: ObligationSummary, f: Filter): boolean {
  switch (f) {
    case 'attention':
      return needsAttention(o);
    case 'applies':
      return o.applicability === 'applicable';
    case 'needs_information':
      return o.applicability === 'needs_information';
    case 'not_applicable':
      return o.applicability === 'not_applicable';
    default:
      return true;
  }
}

const SORT_WEIGHT = { overdue: 0, expired: 0, due_soon: 1, none: 2 } as const;

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number; tone: 'danger' | 'warn' | 'muted' }) {
  return (
    <Card className={cn(value > 0 && tone === 'danger' && 'border-destructive/40')}>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            value > 0 && tone === 'danger' && 'bg-destructive/10 text-destructive',
            value > 0 && tone === 'warn' && 'bg-amber-500/10 text-amber-600',
            (value === 0 || tone === 'muted') && 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ObligationRow({ o, members }: { o: ObligationSummary; members: ComplianceOverview['members'] }) {
  const navigate = useNavigate();
  const c = o.current_cycle;
  const responsible = members.find((m) => m.user_id === o.responsible_user_id);
  const date = c?.kind === 'term' ? c.expiry_date : c?.due_date;
  return (
    <button
      type="button"
      onClick={() => navigate(`/compliance/obligations/${o.id}`)}
      className="flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{o.title}</span>
          <ApplicabilityBadge value={o.applicability} />
          {o.override_conflict && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" /> New information to check
            </span>
          )}
          {o.retired && <span className="text-xs text-muted-foreground">Rule retired</span>}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {o.applicability === 'needs_information'
            ? `Needs: ${o.missing_facts.map((f) => FACT_LABEL[f] ?? f).join(', ')}`
            : o.summary}
        </p>
        <p className="text-xs text-muted-foreground">
          {o.authority_code}
          {responsible ? ` · Responsible: ${responsible.name ?? 'Unnamed user'}` : ' · Reminders go to the owners'}
        </p>
      </div>
      {o.applicability === 'applicable' && c && (
        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          <span className="text-sm tabular-nums">
            {c.kind === 'term' ? (date ? `Expires ${formatDate(date)}` : 'Dates needed') : date ? `Due ${formatDate(date)}` : periodLabel(c.kind, c.period_key)}
          </span>
          <div className="flex gap-1">
            <SignalBadge signal={c.time_signal} />
            <CycleStatusBadge cycle={c} />
          </div>
        </div>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export default function ComplianceHome() {
  useDocumentTitle('Compliance & Governance');
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useComplianceOverview(companyId);
  const [filter, setFilter] = useState<Filter>('attention');
  const [category, setCategory] = useState<string>('all');

  const refresh = useMutation({
    mutationFn: () => invokeCompliance<ComplianceOverview>(companyId!, 'REFRESH'),
    onSuccess: (overview) => {
      qc.setQueryData(complianceKeys.overview(companyId!), overview);
      qc.invalidateQueries({ queryKey: complianceKeys.all(companyId!) });
      toast.success('Re-checked against your latest records.');
    },
    onError: (e: Error) => toast.error('Could not re-check', { description: e.message }),
  });

  const grouped = useMemo(() => {
    if (!data) return [];
    const list = data.obligations
      .filter((o) => matches(o, filter))
      .filter((o) => category === 'all' || o.category_code === category)
      .sort((a, b) => {
        const wa = SORT_WEIGHT[a.current_cycle?.time_signal ?? 'none'];
        const wb = SORT_WEIGHT[b.current_cycle?.time_signal ?? 'none'];
        if (wa !== wb) return wa - wb;
        const da = a.current_cycle?.due_date ?? a.current_cycle?.expiry_date ?? '9999';
        const db = b.current_cycle?.due_date ?? b.current_cycle?.expiry_date ?? '9999';
        return da < db ? -1 : da > db ? 1 : a.title.localeCompare(b.title);
      });
    return data.categories
      .map((c) => ({ category: c, items: list.filter((o) => o.category_code === c.code) }))
      .filter((g) => g.items.length > 0);
  }, [data, filter, category]);

  if (isLoading || !companyId) {
    return (
      <div className="section-stack">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="section-stack">
        <h1 className="text-3xl font-semibold tracking-tight">Compliance & Governance</h1>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Your obligations could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-4">
            <span>{(error as Error)?.message ?? 'Please try again.'} Nothing has been lost.</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data.profile || data.profile.status !== 'completed') {
    return <Navigate to="/compliance/questionnaire" replace />;
  }

  const counts = data.counts;

  return (
    <div className="section-stack">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Compliance & Governance</h1>
          <p className="text-muted-foreground">
            What this business has to file, register or renew — worked out from your records and answers.
          </p>
          {data.profile.last_evaluated_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last checked {new Date(data.profile.last_evaluated_at).toLocaleString('en-ZA')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/compliance/questionnaire">
              <UserCog className="mr-2 h-4 w-4" /> Edit profile
            </Link>
          </Button>
          <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Re-check
          </Button>
        </div>
      </header>

      {data.content_unreviewed && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Guidance awaiting professional review</AlertTitle>
          <AlertDescription>
            Some of the regulatory guidance here has not yet been signed off by a qualified reviewer. Use it to plan,
            and confirm the details with your accountant or the authority before relying on it.
          </AlertDescription>
        </Alert>
      )}
      {data.profile.outdated_questionnaire && (
        <Alert>
          <HelpCircle className="h-4 w-4" />
          <AlertTitle>There are new questions</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>The questionnaire has changed since you answered it. Review it so nothing is missed.</span>
            <Button size="sm" variant="outline" asChild><Link to="/compliance/questionnaire">Review answers</Link></Button>
          </AlertDescription>
        </Alert>
      )}
      {data.conflicts.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Your answers and your records disagree</AlertTitle>
          <AlertDescription className="space-y-1">
            {data.conflicts.map((c) => (
              <p key={c.field}>
                You answered “no” for {FACT_LABEL[c.field] ?? c.field}, but your records say otherwise. The records are
                used.{' '}
                <Link className="underline" to={c.settings_module === 'payroll' ? '/employees' : `/settings?tab=master-data&module=${c.settings_module}`}>
                  Check the records
                </Link>{' '}
                or <Link className="underline" to="/compliance/questionnaire">update your answer</Link>.
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        <StatCard icon={AlertTriangle} label="Overdue" value={counts.overdue} tone="danger" />
        <StatCard icon={Clock} label="Due in the next 30 days" value={counts.due_soon} tone="warn" />
        <StatCard icon={ShieldAlert} label="Expired certificates" value={counts.expired} tone="danger" />
        <StatCard icon={HelpCircle} label="Need information" value={counts.needs_information + counts.conflicts} tone="warn" />
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="flex-wrap h-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key}>{f.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category filter">
          <Button size="sm" variant={category === 'all' ? 'secondary' : 'ghost'} onClick={() => setCategory('all')}>All categories</Button>
          {data.categories.map((c) => (
            <Button key={c.code} size="sm" variant={category === c.code ? 'secondary' : 'ghost'} onClick={() => setCategory(c.code)}>
              {c.name}
            </Button>
          ))}
        </div>
      </div>

      {data.rules_available === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ClipboardList}
              title="No regulatory content has been published yet"
              description="Obligations appear here once the rules for your country are published. Your answers are saved."
            />
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ShieldCheck}
              title={filter === 'attention' ? 'Nothing needs attention right now' : 'Nothing in this view'}
              description={
                filter === 'attention'
                  ? 'No overdue, soon-due or incomplete obligations. Reminders will appear in the bell before anything falls due.'
                  : 'Try another filter.'
              }
              action={filter !== 'all' ? <Button variant="outline" onClick={() => setFilter('all')}>Show all</Button> : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        grouped.map((g) => (
          <Card key={g.category.code}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{g.category.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.items.map((o) => <ObligationRow key={o.id} o={o} members={data.members} />)}
            </CardContent>
          </Card>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Guidance is educational and not legal or tax advice. AdminLess does not file anything with CIPC, SARS or any
        other authority on your behalf. “Completed” records what your business did; it is not a certificate of
        compliance.
      </p>
    </div>
  );
}
