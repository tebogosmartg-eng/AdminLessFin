import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';
import { reviewStageLabel } from '../../../lib/financialStatements/presentation';
import { useAuth } from '../../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { showError, showSuccess } from '../../../utils/toast';
import { format } from 'date-fns';

type ReviewDash = {
  review: {
    id: string;
    stage: string;
    status: string;
  } | null;
  stage: string | null;
  assignments: Array<{ id: string; role_code: string; reviewer_user_id: string; status: string }>;
  open_queries: number;
  open_notes: number;
  signoffs: Array<{ id: string; signer_role: string; stage: string; signed_at: string }>;
  decisions: Array<{ id: string; decision_code: string; from_stage: string; to_stage: string; created_at: string }>;
};

type QueryRow = {
  id: string;
  subject: string;
  body: string;
  status: string;
  response_body?: string | null;
  created_at: string;
};

export default function WorkspaceReview({
  companyId,
  workspaceId,
}: {
  companyId: string;
  workspaceId: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [querySubject, setQuerySubject] = useState('');
  const [queryBody, setQueryBody] = useState('');
  const [responseBody, setResponseBody] = useState('');
  const [respondId, setRespondId] = useState('');
  const [rationale, setRationale] = useState('');

  const dashQuery = useQuery({
    queryKey: ['efs_review_dash', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<ReviewDash>(companyId, 'GET_REVIEW_DASHBOARD', {
        workspace_id: workspaceId,
      }),
  });

  const queriesQuery = useQuery({
    queryKey: ['efs_review_queries', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<QueryRow[]>(companyId, 'LIST_REVIEW_QUERIES', {
        workspace_id: workspaceId,
        pack_review_id: dashQuery.data?.review?.id,
      }),
    enabled: !!dashQuery.data?.review?.id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_review_dash', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_review_queries', companyId, workspaceId] });
    qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });
  };

  const reviewId = dashQuery.data?.review?.id;
  const stage = dashQuery.data?.stage || dashQuery.data?.review?.stage || 'draft';

  const assignSelf = useMutation({
    mutationFn: (role: 'manager' | 'partner') => {
      if (!user?.id || !reviewId) throw new Error('Review is not ready');
      return invokeFinancialStatements(companyId, 'ASSIGN_PACK_REVIEWER', {
        pack_review_id: reviewId,
        reviewer_user_id: user.id,
        role_code: role,
      });
    },
    onSuccess: (_r, role) => {
      showSuccess(`${role === 'manager' ? 'Manager' : 'Partner'} assigned`);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const advance = useMutation({
    mutationFn: (method: string) => {
      if (!reviewId) throw new Error('Review is not ready');
      return invokeFinancialStatements(companyId, method, { pack_review_id: reviewId });
    },
    onSuccess: () => {
      showSuccess('Review updated');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const decide = useMutation({
    mutationFn: (payload: { decision_code: string; actor_role: string }) => {
      if (!reviewId) throw new Error('Review is not ready');
      return invokeFinancialStatements(companyId, 'RECORD_REVIEW_DECISION', {
        pack_review_id: reviewId,
        decision_code: payload.decision_code,
        actor_role: payload.actor_role,
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

  const raiseQuery = useMutation({
    mutationFn: () => {
      if (!reviewId) throw new Error('Review is not ready');
      return invokeFinancialStatements(companyId, 'RAISE_REVIEW_QUERY', {
        pack_review_id: reviewId,
        subject: querySubject,
        body: queryBody,
      });
    },
    onSuccess: () => {
      showSuccess('Query raised');
      setQuerySubject('');
      setQueryBody('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const respond = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'RESPOND_REVIEW_QUERY', {
        query_id: respondId,
        response_body: responseBody,
      }),
    onSuccess: () => {
      showSuccess('Response sent');
      setRespondId('');
      setResponseBody('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review</CardTitle>
          <CardDescription>
            Manager Review, Partner Review, Queries, Responses, and Digital Sign-off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{reviewStageLabel(stage)}</Badge>
          </div>

          <div className="rounded-md border p-4 space-y-2">
            <h3 className="font-medium">Digital Sign-off</h3>
            {(dashQuery.data?.signoffs || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No sign-offs recorded yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(dashQuery.data?.signoffs || []).map((s) => (
                  <Badge key={s.id} variant="outline">
                    {s.signer_role} signed {format(new Date(s.signed_at), 'dd MMM yyyy')}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border p-4 space-y-3">
              <h3 className="font-medium">Manager Review</h3>
              <Button
                size="sm"
                variant="outline"
                disabled={assignSelf.isPending}
                onClick={() => assignSelf.mutate('manager')}
              >
                Assign me as manager
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate('SUBMIT_FOR_VALIDATION_COMPLETE')}
                >
                  Mark checks complete
                </Button>
                <Button
                  size="sm"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate('START_MANAGER_REVIEW')}
                >
                  Start manager review
                </Button>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ decision_code: 'approve', actor_role: 'manager' })
                  }
                >
                  Manager approve
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h3 className="font-medium">Partner Review</h3>
              <Button
                size="sm"
                variant="outline"
                disabled={assignSelf.isPending}
                onClick={() => assignSelf.mutate('partner')}
              >
                Assign me as partner
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate('START_PARTNER_REVIEW')}
                >
                  Start partner review
                </Button>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ decision_code: 'approve', actor_role: 'partner' })
                  }
                >
                  Partner approve &amp; sign
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate('MARK_PUBLICATION_READY')}
                >
                  Mark publication ready
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Decision note (optional)</Label>
            <Input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Queries &amp; Responses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={querySubject} onChange={(e) => setQuerySubject(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Query</Label>
              <Textarea value={queryBody} onChange={(e) => setQueryBody(e.target.value)} rows={2} />
            </div>
            <Button
              disabled={!querySubject || raiseQuery.isPending}
              onClick={() => raiseQuery.mutate()}
            >
              Raise query
            </Button>
          </div>

          <ul className="space-y-3">
            {(queriesQuery.data || []).map((q) => (
              <li key={q.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{q.subject}</span>
                  <Badge variant="outline">{q.status}</Badge>
                </div>
                <p className="text-muted-foreground">{q.body}</p>
                {q.response_body && (
                  <p className="rounded bg-muted/40 p-2">Response: {q.response_body}</p>
                )}
                {q.status !== 'closed' && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Response"
                      value={respondId === q.id ? responseBody : ''}
                      onChange={(e) => {
                        setRespondId(q.id);
                        setResponseBody(e.target.value);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={respond.isPending || respondId !== q.id || !responseBody}
                      onClick={() => respond.mutate()}
                    >
                      Respond
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
