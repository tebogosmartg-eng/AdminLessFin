import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invokeFinancialStatements } from '../../lib/financialStatements/api';
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

type StructureNode = {
  id: string;
  node_code: string;
  node_kind: string;
  path: string;
};

type CloseDash = {
  working_papers: Array<{ id: string; title: string; status: string; updated_at: string }>;
  lead_schedules: Array<{ id: string; title: string; status: string; updated_at: string }>;
  supporting_evidence: Array<{ id: string; title: string; evidence_type: string }>;
  open_review_notes: number;
  recent_history: Array<{ id: string; event_type: string; message: string; created_at: string }>;
};

/**
 * Close & Evidence panel — Phase C2 Working Paper platform.
 * Attaches only to Statement Structure nodes (flag-gated parent workspace).
 */
export default function CloseEvidencePanel({
  companyId,
  workspaceId,
}: {
  companyId: string;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const [nodeId, setNodeId] = useState('');
  const [wpTitle, setWpTitle] = useState('');
  const [leadTitle, setLeadTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteWpId, setNoteWpId] = useState('');

  const structureQuery = useQuery({
    queryKey: ['efs_structure', companyId],
    queryFn: () =>
      invokeFinancialStatements<{ nodes: StructureNode[] }>(companyId, 'GET_STATEMENT_STRUCTURE'),
  });

  const dashQuery = useQuery({
    queryKey: ['efs_close_evidence', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<CloseDash>(companyId, 'GET_CLOSE_EVIDENCE_DASHBOARD', {
        workspace_id: workspaceId,
      }),
  });

  const lineNodes = (structureQuery.data?.nodes || []).filter((n) => n.node_kind === 'line_item');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_close_evidence', companyId, workspaceId] });
  };

  const createWp = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'CREATE_WORKING_PAPER', {
        workspace_id: workspaceId,
        structure_node_id: nodeId,
        title: wpTitle || undefined,
      }),
    onSuccess: () => {
      showSuccess('Working Paper created on structure node');
      setWpTitle('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const createLead = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'CREATE_LEAD_SCHEDULE', {
        workspace_id: workspaceId,
        structure_node_id: nodeId,
        title: leadTitle || undefined,
      }),
    onSuccess: () => {
      showSuccess('Lead Schedule created on structure node');
      setLeadTitle('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const addNote = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'ADD_REVIEW_NOTE', {
        workspace_id: workspaceId,
        working_paper_id: noteWpId,
        body: noteBody,
      }),
    onSuccess: () => {
      showSuccess('Review note added');
      setNoteBody('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const d = dashQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Close &amp; Evidence</CardTitle>
        <CardDescription>
          Working Papers, Lead Schedules, and Evidence attach only to Statement Structure nodes —
          never Statement Instances, Snapshots, GL, or Journals.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Structure line item (attachment target)</Label>
            <Select value={nodeId} onValueChange={setNodeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select structure node" />
              </SelectTrigger>
              <SelectContent>
                {lineNodes.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.node_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Working Paper title</Label>
            <Input value={wpTitle} onChange={(e) => setWpTitle(e.target.value)} placeholder="Optional" />
            <Button
              size="sm"
              disabled={!nodeId || createWp.isPending}
              onClick={() => createWp.mutate()}
            >
              Create Working Paper
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Lead Schedule title</Label>
            <Input value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} placeholder="Optional" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!nodeId || createLead.isPending}
              onClick={() => createLead.mutate()}
            >
              Create Lead Schedule
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="mb-2 text-sm font-medium">Working Papers</div>
            <ul className="space-y-1 text-sm">
              {(d?.working_papers || []).length === 0 && (
                <li className="text-muted-foreground">None yet</li>
              )}
              {(d?.working_papers || []).map((wp) => (
                <li key={wp.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{wp.title}</span>
                  <Badge variant="secondary">{wp.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">Lead Schedules</div>
            <ul className="space-y-1 text-sm">
              {(d?.lead_schedules || []).length === 0 && (
                <li className="text-muted-foreground">None yet</li>
              )}
              {(d?.lead_schedules || []).map((ls) => (
                <li key={ls.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{ls.title}</span>
                  <Badge variant="secondary">{ls.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">Evidence / review</div>
            <p className="text-sm text-muted-foreground">
              Evidence items: {d?.supporting_evidence?.length ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">Open review notes: {d?.open_review_notes ?? 0}</p>
          </div>
        </div>

        {(d?.working_papers || []).length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <Label>Add review note to Working Paper</Label>
            <Select value={noteWpId} onValueChange={setNoteWpId}>
              <SelectTrigger>
                <SelectValue placeholder="Select WP" />
              </SelectTrigger>
              <SelectContent>
                {(d?.working_papers || []).map((wp) => (
                  <SelectItem key={wp.id} value={wp.id}>
                    {wp.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Review note"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!noteWpId || !noteBody || addNote.isPending}
              onClick={() => addNote.mutate()}
            >
              Add review note
            </Button>
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
      </CardContent>
    </Card>
  );
}
