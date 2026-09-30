import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  HelpCircle,
  History,
  MinusCircle,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { useComplianceObligation, useObligationAction } from '../queries';
import {
  APPLICABILITY_LABEL,
  EVENT_LABEL,
  FACT_LABEL,
  formatDate,
  periodLabel,
  REMINDER_CHOICES,
  statusLabel,
} from '../labels';
import { ActionDialog } from '../components/ActionDialog';
import { CycleStatusBadge, SignalBadge } from '../components/badges';
import { EvidencePanel } from '../components/EvidencePanel';
import { GuidanceSheet } from '../components/GuidanceSheet';
import type { CycleDetail, ObligationDetail } from '../types';

type Dialog =
  | { kind: 'complete'; cycle: CycleDetail }
  | { kind: 'reopen'; cycle: CycleDetail }
  | { kind: 'term_dates'; cycle: CycleDetail }
  | { kind: 'renew'; cycle: CycleDetail }
  | { kind: 'not_applicable' }
  | null;

const OPEN = ['not_started', 'in_progress', 'evidence_submitted', 'action_required'];

function sortCycles(cycles: CycleDetail[]): CycleDetail[] {
  const key = (c: CycleDetail) => c.due_date ?? c.expiry_date ?? c.opens_on ?? '';
  const open = cycles.filter((c) => OPEN.includes(c.status)).sort((a, b) => (key(a) < key(b) ? -1 : 1));
  const closed = cycles.filter((c) => !OPEN.includes(c.status)).sort((a, b) => (key(a) < key(b) ? 1 : -1));
  return [...open, ...closed];
}

function CycleCard({
  companyId,
  detail,
  cycle,
  onDialog,
  onStatus,
  statusPending,
}: {
  companyId: string;
  detail: ObligationDetail;
  cycle: CycleDetail;
  onDialog: (d: Dialog) => void;
  onStatus: (cycle: CycleDetail, status: string) => void;
  statusPending: boolean;
}) {
  const isOpen = OPEN.includes(cycle.status);
  const applies = detail.obligation.applicability === 'applicable';
  return (
    <Card className={!isOpen ? 'bg-muted/20' : undefined} data-testid="compliance-period" data-status={cycle.status}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base" data-testid="compliance-period-title">{periodLabel(cycle.kind, cycle.period_key)}</CardTitle>
            <CardDescription>
              {cycle.kind === 'term'
                ? cycle.expiry_date
                  ? `Valid ${formatDate(cycle.valid_from)} – ${formatDate(cycle.expiry_date)} · renew by ${formatDate(cycle.due_date)}`
                  : 'Enter the issue and expiry dates to start tracking this certificate.'
                : cycle.due_date
                  ? `Due ${formatDate(cycle.due_date)}`
                  : 'No fixed due date'}
              {cycle.completed_at && ` · ${statusLabel('completed', cycle.kind)} ${formatDate(cycle.completed_at)}${cycle.completed_by_name ? ` by ${cycle.completed_by_name}` : ''}`}
              {cycle.rule_version && detail.rule && cycle.rule_version !== detail.rule.version
                ? ` · started under guidance v${cycle.rule_version}`
                : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SignalBadge signal={cycle.time_signal} />
            <CycleStatusBadge cycle={cycle} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cycle.completion_note && <p className="text-sm text-muted-foreground">“{cycle.completion_note}”</p>}
        {cycle.status !== 'cancelled' && (
          <EvidencePanel companyId={companyId} detail={detail} cycle={cycle} canAdd={applies || cycle.status === 'completed'} />
        )}
        {applies && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {isOpen && cycle.status !== 'evidence_submitted' && (
              <Select value="" onValueChange={(v) => onStatus(cycle, v)} disabled={statusPending}>
                <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Set status…" /></SelectTrigger>
                <SelectContent>
                  {['not_started', 'in_progress', 'action_required']
                    .filter((s) => s !== cycle.status)
                    .map((s) => <SelectItem key={s} value={s}>{statusLabel(s as CycleDetail['status'], cycle.kind)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {isOpen && cycle.kind !== 'term' && (
              <Button size="sm" onClick={() => onDialog({ kind: 'complete', cycle })}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark completed
              </Button>
            )}
            {isOpen && cycle.kind === 'term' && (
              <>
                <Button size="sm" variant={cycle.expiry_date ? 'outline' : 'default'} onClick={() => onDialog({ kind: 'term_dates', cycle })}>
                  <CalendarClock className="mr-1.5 h-4 w-4" /> {cycle.expiry_date ? 'Correct dates' : 'Enter dates'}
                </Button>
                {cycle.expiry_date && (
                  <Button size="sm" onClick={() => onDialog({ kind: 'renew', cycle })}>
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Record renewal
                  </Button>
                )}
              </>
            )}
            {cycle.status === 'completed' && cycle.kind !== 'term' && (
              <Button size="sm" variant="ghost" onClick={() => onDialog({ kind: 'reopen', cycle })}>
                Reopen
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Body({ companyId, detail }: { companyId: string; detail: ObligationDetail }) {
  const o = detail.obligation;
  const action = useObligationAction(companyId, o.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [offsets, setOffsets] = useState<number[] | null>(null);
  const shownOffsets = offsets ?? o.reminder_offsets;
  const offsetsDirty = offsets !== null && JSON.stringify([...offsets].sort()) !== JSON.stringify([...o.reminder_offsets].sort());

  const run = (method: string, payload: Record<string, unknown>, success: string) =>
    action.mutateAsync({ method, payload }).then((r) => {
      toast.success(success);
      return r;
    });

  const quick = (method: string, payload: Record<string, unknown>, success: string) =>
    run(method, payload, success).catch((e: Error) => toast.error('That did not work', { description: e.message }));

  const cycles = sortCycles(detail.cycles);
  const rule = detail.rule;
  const today = detail.today;

  return (
    <div className="section-stack">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/compliance"><ArrowLeft className="mr-1 h-4 w-4" /> All obligations</Link>
        </Button>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{rule?.title ?? o.rule_code}</h1>
            <p className="text-muted-foreground">{rule?.summary}</p>
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              {rule?.category && <Badge variant="outline">{rule.category.name}</Badge>}
              {rule?.authority && (
                <a href={rule.authority.website} target="_blank" rel="noopener noreferrer">
                  <Badge variant="outline" className="hover:bg-muted">{rule.authority.name}</Badge>
                </a>
              )}
              <Badge variant={o.applicability === 'applicable' ? 'default' : 'secondary'}>{APPLICABILITY_LABEL[o.applicability]}</Badge>
              {rule && !rule.reviewed && <Badge variant="secondary">Guidance awaiting review</Badge>}
            </div>
            {rule?.due_rule && <p className="pt-1 text-sm">{rule.due_rule}</p>}
          </div>
          <GuidanceSheet detail={detail} />
        </div>
      </div>

      {o.override_conflict && (
        <Alert className="border-amber-300 dark:border-amber-800">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>New information conflicts with “not applicable”</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              This was marked not applicable ({o.override_reason}), but the information it depends on has changed since.
              It stays not applicable until you decide.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => quick('SET_OVERRIDE', { not_applicable: false }, 'It is being tracked again.')}>
                It applies — track it
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => quick('SET_OVERRIDE', { not_applicable: true, reason: o.override_reason }, 'Kept as not applicable.')}
              >
                Still not applicable
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {o.applicability === 'needs_information' && (
        <Alert>
          <HelpCircle className="h-4 w-4" />
          <AlertTitle>More information needed</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              AdminLess needs the {o.missing_facts.map((f) => FACT_LABEL[f] ?? f).join(', ')} to work out whether this
              applies and when it is due. Nothing is assumed in the meantime.
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link to={o.missing_facts.includes('financial_year_end') ? '/accounting/years' : '/compliance/questionnaire'}>
                Provide it
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {o.override_not_applicable && !o.override_conflict && (
        <Alert>
          <MinusCircle className="h-4 w-4" />
          <AlertTitle>Marked not applicable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {o.override_reason} — {detail.members.find((m) => m.user_id === o.override_by)?.name ?? 'a user'}, {formatDate(o.override_at)}.
              If the information behind it changes, you will be asked to check again.
            </span>
            <Button size="sm" variant="outline" onClick={() => quick('SET_OVERRIDE', { not_applicable: false }, 'It is being tracked again.')}>
              Track it again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {o.retired && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This rule has been retired</AlertTitle>
          <AlertDescription>No new periods will open. Open periods stay here so you can finish them.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {cycles.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {o.applicability === 'applicable'
                  ? 'No period is open yet.'
                  : 'Nothing to track while this does not apply.'}
              </CardContent>
            </Card>
          ) : (
            cycles.map((c) => (
              <CycleCard
                key={c.id}
                companyId={companyId}
                detail={detail}
                cycle={c}
                onDialog={setDialog}
                statusPending={action.isPending}
                onStatus={(cycle, status) => quick('SET_CYCLE_STATUS', { cycle_id: cycle.id, status }, 'Status updated.')}
              />
            ))
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> History</CardTitle>
              <CardDescription>Every change, who made it, and when. It cannot be edited.</CardDescription>
            </CardHeader>
            <CardContent>
              {detail.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              ) : (
                <ol className="space-y-2">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex gap-3 text-sm">
                      <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {new Date(e.created_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                      <span>
                        <span className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                        <span className="text-muted-foreground"> · {e.actor_name}</span>
                        {e.note && <span className="block text-muted-foreground">{e.note}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Responsible person</CardTitle>
              <CardDescription>Gets the reminders. Without one, every owner does.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={o.responsible_user_id ?? 'owners'}
                onValueChange={(v) => quick('SET_RESPONSIBLE', { user_id: v === 'owners' ? null : v }, 'Responsible person updated.')}
                disabled={action.isPending}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owners">All owners</SelectItem>
                  {detail.members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name ?? 'Unnamed user'} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {o.applicability === 'applicable' && rule?.schedule_type !== 'once_off' ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Reminders</CardTitle>
                <CardDescription>In the notification bell, days before the due date. Overdue items get one reminder.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {REMINDER_CHOICES.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={shownOffsets.includes(d)}
                        onCheckedChange={(checked) =>
                          setOffsets((prev) => {
                            const base = prev ?? o.reminder_offsets;
                            return checked ? [...new Set([...base, d])] : base.filter((x) => x !== d);
                          })
                        }
                      />
                      {d} day{d === 1 ? '' : 's'}
                    </label>
                  ))}
                </div>
                {offsetsDirty && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={action.isPending}
                      onClick={() =>
                        run('SET_REMINDERS', { offsets }, 'Reminders updated.')
                          .then(() => setOffsets(null))
                          .catch((e: Error) => toast.error('That did not work', { description: e.message }))
                      }
                    >
                      Save reminders
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOffsets(null)}>Undo</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {!o.override_not_applicable && o.applicability !== 'not_applicable' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Does not apply to you?</CardTitle>
                <CardDescription>You can mark it not applicable, with a reason. It is kept in the history.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'not_applicable' })}>
                  <MinusCircle className="mr-1.5 h-4 w-4" /> Mark not applicable
                </Button>
              </CardContent>
            </Card>
          )}

          {o.why?.facts && Object.keys(o.why.facts).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Why this applies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(o.why.facts).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{FACT_LABEL[k] ?? k}</span>
                    <span className="text-right font-medium">
                      {v === true ? 'Yes' : v === false ? 'No' : v === null ? 'Unknown' : String(v).replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
                {o.why.evaluated_on && <p className="pt-1 text-xs text-muted-foreground">Checked {formatDate(o.why.evaluated_on)}</p>}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      <p className="text-xs text-muted-foreground">
        Guidance is educational and not legal or tax advice. “Completed” records what your business did; it is not a
        certificate of compliance. AdminLess does not file with any authority on your behalf.
      </p>

      <ActionDialog
        open={dialog?.kind === 'complete'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Mark this period completed?"
        description={
          rule?.evidence_required
            ? 'This obligation needs proof before it can be completed. Add it under the period first.'
            : 'Record when it was done. You can add proof now or later.'
        }
        fields={[
          { name: 'completed_on', label: 'Date done', type: 'date', max: today, initial: today },
          { name: 'note', label: 'Note', type: 'textarea', help: 'For example a submission reference.' },
        ]}
        submitLabel="Mark completed"
        onSubmit={(v) =>
          run('COMPLETE_CYCLE', { cycle_id: dialog && 'cycle' in dialog ? dialog.cycle.id : '', completed_on: v.completed_on, note: v.note }, 'Marked completed.')
        }
      />
      <ActionDialog
        open={dialog?.kind === 'reopen'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Reopen this period?"
        description="The completion is kept in the history."
        fields={[{ name: 'reason', label: 'Reason', type: 'textarea', required: true, minLength: 3 }]}
        submitLabel="Reopen"
        onSubmit={(v) =>
          run('REOPEN_CYCLE', { cycle_id: dialog && 'cycle' in dialog ? dialog.cycle.id : '', reason: v.reason }, 'Reopened.')
        }
      />
      <ActionDialog
        open={dialog?.kind === 'term_dates'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Certificate dates"
        description={`Reminders start ${rule?.renewal_lead_days ?? 30} days before it expires.`}
        fields={[
          { name: 'valid_from', label: 'Issued on', type: 'date', required: true, initial: dialog?.kind === 'term_dates' ? dialog.cycle.valid_from ?? '' : '' },
          { name: 'expiry_date', label: 'Expires on', type: 'date', required: true, initial: dialog?.kind === 'term_dates' ? dialog.cycle.expiry_date ?? '' : '' },
        ]}
        submitLabel="Save dates"
        onSubmit={(v) =>
          run('SET_TERM_DATES', { cycle_id: dialog && 'cycle' in dialog ? dialog.cycle.id : '', valid_from: v.valid_from, expiry_date: v.expiry_date }, 'Dates saved.')
        }
      />
      <ActionDialog
        open={dialog?.kind === 'renew'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Record the renewal"
        description="The current certificate is closed as renewed and the new one is tracked from here."
        fields={[
          { name: 'valid_from', label: 'New certificate issued on', type: 'date', required: true, max: today },
          { name: 'expiry_date', label: 'New certificate expires on', type: 'date', required: true },
          { name: 'note', label: 'Note', type: 'textarea' },
        ]}
        submitLabel="Record renewal"
        onSubmit={(v) =>
          run('RENEW_TERM', { cycle_id: dialog && 'cycle' in dialog ? dialog.cycle.id : '', ...v }, 'Renewal recorded.')
        }
      />
      <ActionDialog
        open={dialog?.kind === 'not_applicable'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Mark as not applicable?"
        description="Open periods are withdrawn and no reminders are sent. If the information behind this rule changes, you will be asked to check again."
        fields={[{ name: 'reason', label: 'Why it does not apply', type: 'textarea', required: true, minLength: 5 }]}
        submitLabel="Mark not applicable"
        destructive
        onSubmit={(v) => run('SET_OVERRIDE', { not_applicable: true, reason: v.reason }, 'Marked not applicable.')}
      />
    </div>
  );
}

export default function ComplianceObligation() {
  useDocumentTitle('Obligation');
  const { id } = useParams<{ id: string }>();
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const { data, isLoading, isError, error, refetch } = useComplianceObligation(companyId, id);

  if (isLoading || !companyId) {
    return (
      <div className="section-stack">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="section-stack">
        <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
          <Link to="/compliance"><ArrowLeft className="mr-1 h-4 w-4" /> All obligations</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This obligation could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-4">
            <span>{(error as Error)?.message ?? 'Please try again.'}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  return <Body companyId={companyId} detail={data} />;
}
