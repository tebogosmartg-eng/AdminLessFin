import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  invokeFinancialClose,
  type EfcpCloseDashboard,
  type EfcpCloseItem,
  type EfcpCloseItemStatus,
  type EfcpPeriodStatus,
} from '../../lib/financialClose/api';
import {
  READINESS_COMPONENT_LABELS,
  closeTypeLabel,
  itemStatusLabel,
  itemStatusTone,
  periodStatusLabel,
} from '../../lib/financialClose/presentation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Progress } from '../../components/ui/progress';
import { showError, showSuccess } from '../../utils/toast';

const CLOSE_NAV = [
  { value: 'overview', label: 'Overview' },
  { value: 'checklist', label: 'Close Checklist' },
  { value: 'reconciliations', label: 'Reconciliations' },
  { value: 'review', label: 'Review' },
  { value: 'approval', label: 'Approval' },
  { value: 'history', label: 'Close History' },
  { value: 'locks', label: 'Period Locks' },
] as const;

const ITEM_STATUSES: EfcpCloseItemStatus[] = [
  'ready',
  'in_progress',
  'outstanding',
  'overdue',
  'completed',
];

function ChecklistRow({
  item,
  onUpdate,
  pending,
}: {
  item: EfcpCloseItem;
  onUpdate: (patch: Partial<EfcpCloseItem> & { status?: EfcpCloseItemStatus }) => void;
  pending: boolean;
}) {
  const [preparedBy, setPreparedBy] = useState(item.prepared_by || '');
  const [reviewedBy, setReviewedBy] = useState(item.reviewed_by || '');
  const [issues, setIssues] = useState(item.outstanding_issues || '');

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.title}</span>
          {item.mandatory && <Badge variant="outline">Mandatory</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={itemStatusTone(item.status)}>{itemStatusLabel(item.status)}</Badge>
          <Select
            value={item.status}
            onValueChange={(v) => onUpdate({ status: v as EfcpCloseItemStatus })}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {itemStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Prepared By</span>
          <Input
            className="h-8"
            value={preparedBy}
            onChange={(e) => setPreparedBy(e.target.value)}
            onBlur={() => preparedBy !== (item.prepared_by || '') && onUpdate({ prepared_by: preparedBy })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Reviewed By</span>
          <Input
            className="h-8"
            value={reviewedBy}
            onChange={(e) => setReviewedBy(e.target.value)}
            onBlur={() => reviewedBy !== (item.reviewed_by || '') && onUpdate({ reviewed_by: reviewedBy })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Completion Date</span>
          <div className="flex h-8 items-center text-sm">
            {item.completed_at ? format(new Date(item.completed_at), 'dd MMM yyyy') : '—'}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Outstanding Issues</span>
        <Textarea
          rows={1}
          value={issues}
          disabled={pending}
          onChange={(e) => setIssues(e.target.value)}
          onBlur={() =>
            issues !== (item.outstanding_issues || '') && onUpdate({ outstanding_issues: issues })
          }
        />
      </div>
    </div>
  );
}

/**
 * EFCP V6.8.0 — Financial Close workspace.
 * Overview · Close Checklist · Reconciliations · Review · Approval ·
 * Close History · Period Locks. Accounting language only.
 */
export default function FinancialCloseWorkspace() {
  const { closeId } = useParams<{ closeId: string }>();
  const { activeCompany, profile, session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyId = activeCompany?.id;
  const [activeNav, setActiveNav] = useState<string>('overview');
  const [approvalNote, setApprovalNote] = useState('');

  const dashQuery = useQuery({
    queryKey: ['efcp_dashboard', companyId, closeId],
    queryFn: () =>
      invokeFinancialClose<EfcpCloseDashboard>(companyId!, 'GET_CLOSE_DASHBOARD', {
        close_workspace_id: closeId,
      }),
    enabled: !!companyId && !!closeId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efcp_dashboard', companyId, closeId] });
    qc.invalidateQueries({ queryKey: ['efcp_workspaces', companyId] });
  };

  const updateItem = useMutation({
    mutationFn: (input: { close_item_id: string } & Record<string, unknown>) =>
      invokeFinancialClose(companyId!, 'UPDATE_CLOSE_ITEM', input),
    onSuccess: invalidate,
    onError: (e: Error) => showError(e.message),
  });

  const recordApproval = useMutation({
    mutationFn: (role: 'manager' | 'partner') =>
      invokeFinancialClose(companyId!, 'RECORD_CLOSE_APPROVAL', {
        close_workspace_id: closeId,
        approval_role: role,
        decision: 'approved',
        note: approvalNote || undefined,
        decided_by_name: profile?.full_name || session?.user?.email || undefined,
      }),
    onSuccess: () => {
      showSuccess('Approval recorded');
      setApprovalNote('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const transitionPeriod = useMutation({
    mutationFn: (to_status: EfcpPeriodStatus) =>
      invokeFinancialClose(companyId!, 'TRANSITION_PERIOD_STATUS', {
        close_workspace_id: closeId,
        to_status,
      }),
    onSuccess: () => {
      showSuccess('Period status updated');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  if (dashQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (dashQuery.isError || !dashQuery.data) {
    return (
      <div className="p-6 text-sm text-destructive">
        {(dashQuery.error as Error)?.message || 'Close period not found'}
      </div>
    );
  }

  const d = dashQuery.data;
  const ws = d.workspace;
  const reconItems = d.items.filter((i) => i.category === 'reconciliation');
  const reviewItems = d.items.filter((i) => i.category !== 'reconciliation');
  const outstanding = d.items.filter((i) => i.status !== 'completed');
  const locked = ws.period_status === 'locked';

  const onItemUpdate = (item: EfcpCloseItem) => (patch: Record<string, unknown>) =>
    updateItem.mutate({ close_item_id: item.id, ...patch });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          to="/financial-close"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          All closes
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{ws.label}</h1>
            <p className="text-sm text-muted-foreground">
              {closeTypeLabel(ws.close_type)} · {ws.start_date} → {ws.end_date}
            </p>
          </div>
          <Badge variant={locked ? 'default' : 'secondary'}>
            {locked && <Lock className="mr-1 h-3 w-3" />}
            {periodStatusLabel(ws.period_status)}
          </Badge>
        </div>
      </div>

      <Tabs value={activeNav} onValueChange={setActiveNav} className="space-y-4">
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-56 lg:shrink-0">
            <nav aria-label="Close navigation" className="sticky top-4">
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Financial Close
              </p>
              <TabsList className="flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0">
                {CLOSE_NAV.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="justify-start px-3 py-2 data-[state=active]:bg-muted"
                  >
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </nav>
          </aside>

          <div className="min-w-0 flex-1">
            {/* ── Overview ─────────────────────────────────────────────── */}
            <TabsContent value="overview" className="mt-0 space-y-6">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Overall Close Readiness</CardTitle>
                  <CardDescription>
                    One accounting readiness score. Information is retrieved automatically — no
                    manual synchronisation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-semibold">{d.readiness.overall}%</span>
                    <Progress value={d.readiness.overall} className="flex-1" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(d.readiness.components).map(([key, value]) => (
                      <div key={key} className="rounded-md border bg-background px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          {READINESS_COMPONENT_LABELS[key] || key}
                        </div>
                        <div className="text-lg font-semibold">{value}%</div>
                      </div>
                    ))}
                  </div>
                  {d.readiness.ready_for_financial_statements ? (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Ready for Financial Statements
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        onClick={() => navigate('/financial-statements-workspace')}
                      >
                        Prepare Annual Financial Statements
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Not yet ready for Financial Statements — complete mandatory reconciliations,
                      resolve critical issues, and obtain manager approval.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Close Progress</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="text-2xl font-semibold">
                      {d.items.length - outstanding.length}/{d.items.length}
                    </div>
                    <div className="text-muted-foreground">checklist items complete</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Outstanding Reconciliations</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="text-2xl font-semibold">
                      {reconItems.filter((i) => i.status !== 'completed').length}
                    </div>
                    <div className="text-muted-foreground">
                      {d.signals.unreconciled_items} unreconciled bank items
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Validation Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="text-2xl font-semibold">
                      {d.signals.open_critical_validation_issues}
                    </div>
                    <div className="text-muted-foreground">critical issues outstanding</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Approval Status</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div>Manager: {d.readiness.manager_approved ? 'Approved' : 'Pending'}</div>
                    <div>Partner: {d.readiness.partner_approved ? 'Approved' : 'Pending'}</div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Close Checklist ──────────────────────────────────────── */}
            <TabsContent value="checklist" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Close Checklist</CardTitle>
                  <CardDescription>
                    Built automatically for this period. Update status as work completes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {d.items.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      pending={updateItem.isPending}
                      onUpdate={onItemUpdate(item)}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Reconciliations ──────────────────────────────────────── */}
            <TabsContent value="reconciliations" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reconciliations</CardTitle>
                  <CardDescription>
                    Reconciliation status for this close. Bank reconciliation work happens in
                    Accounting → Reconcile.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {d.signals.unreconciled_items > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      {d.signals.unreconciled_items} bank items are unreconciled up to{' '}
                      {ws.end_date}.{' '}
                      <Link to="/reconciliation" className="underline">
                        Open bank reconciliation
                      </Link>
                    </p>
                  )}
                  {reconItems.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      pending={updateItem.isPending}
                      onUpdate={onItemUpdate(item)}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Review ───────────────────────────────────────────────── */}
            <TabsContent value="review" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Review</CardTitle>
                  <CardDescription>
                    Journal, accrual, prepayment, and trial balance reviews before approval.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reviewItems.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      pending={updateItem.isPending}
                      onUpdate={onItemUpdate(item)}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Approval ─────────────────────────────────────────────── */}
            <TabsContent value="approval" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Approval</CardTitle>
                  <CardDescription>
                    Approval requires all mandatory checklist items complete and critical
                    validation issues resolved.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border p-4">
                      <div className="text-xs text-muted-foreground">Mandatory items</div>
                      <div className="text-2xl font-semibold">
                        {d.readiness.mandatory_complete}/{d.readiness.mandatory_total}
                      </div>
                    </div>
                    <div className="rounded-md border p-4">
                      <div className="text-xs text-muted-foreground">Critical validation issues</div>
                      <div className="text-2xl font-semibold">
                        {d.signals.open_critical_validation_issues}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-sm font-medium">Approval note (optional)</span>
                    <Textarea
                      rows={2}
                      value={approvalNote}
                      onChange={(e) => setApprovalNote(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={locked || d.readiness.manager_approved || recordApproval.isPending}
                      onClick={() => recordApproval.mutate('manager')}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {d.readiness.manager_approved ? 'Manager Approved' : 'Manager Approve'}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={
                        locked ||
                        !d.readiness.manager_approved ||
                        d.readiness.partner_approved ||
                        recordApproval.isPending
                      }
                      onClick={() => recordApproval.mutate('partner')}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {d.readiness.partner_approved ? 'Partner Approved' : 'Partner Approve'}
                    </Button>
                  </div>

                  {d.approvals.length > 0 && (
                    <ul className="space-y-2 text-sm">
                      {d.approvals.map((a) => (
                        <li key={a.id} className="flex justify-between rounded-md border px-3 py-2">
                          <span>
                            {a.approval_role === 'manager' ? 'Manager' : 'Partner'}{' '}
                            {a.decision === 'approved' ? 'approved' : 'rejected'}
                            {a.decided_by_name ? ` — ${a.decided_by_name}` : ''}
                            {a.note ? ` · ${a.note}` : ''}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(a.decided_at), 'dd MMM yyyy HH:mm')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Close History ────────────────────────────────────────── */}
            <TabsContent value="history" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Close History</CardTitle>
                  <CardDescription>Everything recorded for this close.</CardDescription>
                </CardHeader>
                <CardContent>
                  {d.activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {d.activity.map((a) => (
                        <li
                          key={a.id}
                          className="flex justify-between gap-4 border-b border-border/60 pb-2"
                        >
                          <span>{a.message}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {format(new Date(a.created_at), 'dd MMM HH:mm')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Period Locks ─────────────────────────────────────────── */}
            <TabsContent value="locks" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Period Locks</CardTitle>
                  <CardDescription>
                    Only Accounting controls locking. Financial Statements consume locked periods.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {(['open', 'soft_closed', 'manager_approved', 'partner_approved', 'locked'] as const).map(
                      (s, i, arr) => (
                        <span key={s} className="flex items-center gap-2">
                          <Badge variant={ws.period_status === s ? 'default' : 'outline'}>
                            {periodStatusLabel(s)}
                          </Badge>
                          {i < arr.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </span>
                      ),
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={ws.period_status !== 'open' || transitionPeriod.isPending}
                      onClick={() => transitionPeriod.mutate('soft_closed')}
                    >
                      Soft Close
                    </Button>
                    <Button
                      disabled={ws.period_status !== 'partner_approved' || transitionPeriod.isPending}
                      onClick={() => transitionPeriod.mutate('locked')}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Lock Period
                    </Button>
                    <Button
                      variant="outline"
                      disabled={locked || ws.period_status === 'open' || transitionPeriod.isPending}
                      onClick={() => transitionPeriod.mutate('open')}
                    >
                      Reopen
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Manager Approved and Partner Approved are reached through the Approval workflow.
                    Locking requires partner approval and is final for this close.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
