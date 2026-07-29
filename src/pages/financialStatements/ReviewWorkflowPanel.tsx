import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invokeFinancialStatements } from '../../lib/financialStatements/api';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { showError, showSuccess } from '../../utils/toast';
import { format } from 'date-fns';

type ReviewDash = {
  review: {
    id: string;
    stage: string;
    status: string;
    validation_run_id: string | null;
    escalated: boolean;
    pack_fingerprint: string | null;
  } | null;
  stage: string | null;
  assignments: Array<{ id: string; role_code: string; reviewer_user_id: string; status: string }>;
  open_queries: number;
  open_notes: number;
  signoffs: Array<{ id: string; signer_role: string; stage: string; signed_at: string }>;
  decisions: Array<{ id: string; decision_code: string; from_stage: string; to_stage: string; created_at: string }>;
  recent_history: Array<{ id: string; event_type: string; message: string; created_at: string }>;
  mutates_accounting: boolean;
  publication: boolean;
};

const STAGE_FLOW = [
  'draft',
  'validation_complete',
  'manager_review',
  'corrections',
  'manager_approved',
  'partner_review',
  'partner_approved',
  'publication_ready',
];

/**
 * Review Workflow panel — Phase D2.
 * Determines publication readiness acceptability. Never changes accounting balances.
 */
export default function ReviewWorkflowPanel({
  companyId,
  workspaceId,
}: {
  companyId: string;
  workspaceId: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [assignRole, setAssignRole] = useState<'manager' | 'partner'>('manager');
  const [noteBody, setNoteBody] = useState('');
  const [querySubject, setQuerySubject] = useState('');
  const [queryBody, setQueryBody] = useState('');
  const [rationale, setRationale] = useState('');

  const dashQuery = useQuery({
    queryKey: ['efs_review_dash', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<ReviewDash>(companyId, 'GET_REVIEW_DASHBOARD', {
        workspace_id: workspaceId,
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_review_dash', companyId, workspaceId] });
  };

  const openReview = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'GET_OR_CREATE_PACK_REVIEW', {
        workspace_id: workspaceId,
      }),
    onSuccess: () => {
      showSuccess('Pack review opened');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const assign = useMutation({
    mutationFn: () => {
      if (!user?.id) throw new Error('Signed-in user required to assign reviewer');
      const reviewId = dashQuery.data?.review?.id;
      if (!reviewId) throw new Error('Open a pack review first');
      return invokeFinancialStatements(companyId, 'ASSIGN_PACK_REVIEWER', {
        pack_review_id: reviewId,
        reviewer_user_id: user.id,
        role_code: assignRole,
      });
    },
    onSuccess: () => {
      showSuccess(`${assignRole} assigned`);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const advance = useMutation({
    mutationFn: (method: string) => {
      const reviewId = dashQuery.data?.review?.id;
      if (!reviewId) throw new Error('Open a pack review first');
      return invokeFinancialStatements(companyId, method, { pack_review_id: reviewId });
    },
    onSuccess: (_r, method) => {
      showSuccess(method.replaceAll('_', ' ').toLowerCase());
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const decide = useMutation({
    mutationFn: ({
      decision_code,
      actor_role,
    }: {
      decision_code: string;
      actor_role: string;
    }) => {
      const reviewId = dashQuery.data?.review?.id;
      if (!reviewId) throw new Error('Open a pack review first');
      return invokeFinancialStatements(companyId, 'RECORD_REVIEW_DECISION', {
        pack_review_id: reviewId,
        decision_code,
        actor_role,
        rationale: rationale || undefined,
      });
    },
    onSuccess: () => {
      showSuccess('Decision recorded');
      setRationale('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const addNote = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'ADD_PACK_REVIEW_NOTE', {
        pack_review_id: dashQuery.data!.review!.id,
        body: noteBody,
      }),
    onSuccess: () => {
      showSuccess('Review note added');
      setNoteBody('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const raiseQuery = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'RAISE_REVIEW_QUERY', {
        pack_review_id: dashQuery.data!.review!.id,
        subject: querySubject,
        body: queryBody,
        raised_role: dashQuery.data?.review?.stage === 'partner_review' ? 'partner' : 'manager',
      }),
    onSuccess: () => {
      showSuccess('Review query raised');
      setQuerySubject('');
      setQueryBody('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const d = dashQuery.data;
  const stage = d?.stage || d?.review?.stage || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review Workflow</CardTitle>
        <CardDescription>
          Manager and Partner review determine whether the engagement is acceptable for publication.
          Review consumes Validation, Working Papers, Disclosures, and Statement Instances. It never
          changes accounting balances. Publication, XBRL, and AI remain deferred.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {!d?.review && (
            <Button size="sm" disabled={openReview.isPending} onClick={() => openReview.mutate()}>
              Open pack review
            </Button>
          )}
          {d?.review && stage === 'draft' && (
            <Button
              size="sm"
              disabled={advance.isPending}
              onClick={() => advance.mutate('SUBMIT_FOR_VALIDATION_COMPLETE')}
            >
              Mark validation complete
            </Button>
          )}
          {d?.review && (stage === 'validation_complete' || stage === 'corrections') && (
            <Button size="sm" disabled={advance.isPending} onClick={() => advance.mutate('START_MANAGER_REVIEW')}>
              Start manager review
            </Button>
          )}
          {d?.review && (stage === 'manager_approved' || stage === 'corrections') && (
            <Button size="sm" disabled={advance.isPending} onClick={() => advance.mutate('START_PARTNER_REVIEW')}>
              Start partner review
            </Button>
          )}
          {d?.review && stage === 'corrections' && (
            <Button
              size="sm"
              variant="secondary"
              disabled={advance.isPending}
              onClick={() => advance.mutate('RESUBMIT_AFTER_CORRECTIONS')}
            >
              Resubmit after corrections
            </Button>
          )}
          {d?.review && stage === 'partner_approved' && (
            <Button
              size="sm"
              disabled={advance.isPending}
              onClick={() => advance.mutate('MARK_PUBLICATION_READY')}
            >
              Mark publication ready
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {STAGE_FLOW.map((s) => (
            <Badge key={s} variant={s === stage ? 'default' : 'outline'} className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>

        {d?.review && (
          <div className="grid gap-4 md:grid-cols-4 text-sm">
            <div>
              <div className="text-muted-foreground">Stage</div>
              <div className="font-medium">{stage}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Open queries</div>
              <div className="font-medium">{d.open_queries ?? 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Sign-offs</div>
              <div className="font-medium">{d.signoffs?.length ?? 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fingerprint</div>
              <div className="truncate font-mono text-xs">{d.review.pack_fingerprint?.slice(0, 12) || '—'}</div>
            </div>
          </div>
        )}

        {d?.review && (
          <div className="space-y-2 border-t pt-4">
            <div className="text-sm font-medium">Review assignment</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={assignRole} onValueChange={(v) => setAssignRole(v as 'manager' | 'partner')}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="secondary" disabled={assign.isPending} onClick={() => assign.mutate()}>
                Assign me
              </Button>
            </div>
            <ul className="text-xs text-muted-foreground">
              {(d.assignments || []).map((a) => (
                <li key={a.id}>
                  {a.role_code} · {a.status} · {a.reviewer_user_id.slice(0, 8)}…
                </li>
              ))}
            </ul>
          </div>
        )}

        {d?.review && (stage === 'manager_review' || stage === 'partner_review') && (
          <div className="space-y-2 border-t pt-4">
            <div className="text-sm font-medium">Review decision</div>
            <Input
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Rationale (optional)"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    decision_code: 'approve',
                    actor_role: stage === 'partner_review' ? 'partner' : 'manager',
                  })
                }
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    decision_code: 'request_changes',
                    actor_role: stage === 'partner_review' ? 'partner' : 'manager',
                  })
                }
              >
                Request changes
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    decision_code: 'reject',
                    actor_role: stage === 'partner_review' ? 'partner' : 'manager',
                  })
                }
              >
                Reject
              </Button>
              {stage === 'manager_review' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ decision_code: 'escalate', actor_role: 'manager' })}
                >
                  Escalate
                </Button>
              )}
            </div>
          </div>
        )}

        {d?.review && (
          <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Review note</div>
              <Input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Note" />
              <Button
                size="sm"
                variant="outline"
                disabled={!noteBody || addNote.isPending}
                onClick={() => addNote.mutate()}
              >
                Add note
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Review query</div>
              <Input
                value={querySubject}
                onChange={(e) => setQuerySubject(e.target.value)}
                placeholder="Subject"
              />
              <Input value={queryBody} onChange={(e) => setQueryBody(e.target.value)} placeholder="Query body" />
              <Button
                size="sm"
                variant="outline"
                disabled={!querySubject || !queryBody || raiseQuery.isPending}
                onClick={() => raiseQuery.mutate()}
              >
                Raise query
              </Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium">Review history (immutable)</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(d?.recent_history || []).length === 0 && <li>No history yet</li>}
            {(d?.recent_history || []).map((h) => (
              <li key={h.id}>
                {format(new Date(h.created_at), 'dd MMM HH:mm')} · {h.message || h.event_type}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          mutates_accounting={String(d?.mutates_accounting ?? false)} · publication=
          {String(d?.publication ?? false)} · digital sign-offs={d?.signoffs?.length ?? 0}
        </p>
      </CardContent>
    </Card>
  );
}
