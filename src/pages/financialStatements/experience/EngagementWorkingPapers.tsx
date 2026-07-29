import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';
import {
  evidenceStatusLabel,
  workingPaperSectionForNode,
} from '../../../lib/financialStatements/presentation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../components/ui/accordion';
import { showError, showSuccess } from '../../../utils/toast';
import { format } from 'date-fns';

type StructureNode = {
  id: string;
  node_code: string;
  node_kind: string;
  path: string;
};

type CloseDash = {
  working_papers: Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
    structure_node_id?: string;
    prepared_by?: string | null;
    reviewed_by?: string | null;
  }>;
  lead_schedules: Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
    structure_node_id?: string;
  }>;
  supporting_evidence: Array<{
    id: string;
    title: string;
    evidence_type: string;
    structure_node_id?: string;
    working_paper_id?: string;
  }>;
  open_review_notes: number;
  review_notes?: Array<{
    id: string;
    note: string;
    status?: string;
    working_paper_id?: string;
    structure_node_id?: string;
  }>;
};

const SECTION_ORDER = [
  'Cash',
  'Trade Receivables',
  'Inventory',
  'Property, Plant & Equipment',
  'Trade Payables',
  'Revenue',
  'Borrowings',
  'Taxation',
  'Employee Benefits',
  'Expenses',
  'Equity / Net Assets',
  'Other',
];

/**
 * V6.10.0 Supporting Schedules — accounting sections, not statement nodes.
 * Balance, Prepared By, Reviewed By, Supporting Evidence, Review Notes.
 */
export default function WorkspaceWorkingPapers({
  companyId,
  workspaceId,
}: {
  companyId: string;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const [sectionKey, setSectionKey] = useState('Cash');
  const [wpTitle, setWpTitle] = useState('');

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

  const nodesBySection = useMemo(() => {
    const map = new Map<string, StructureNode[]>();
    for (const node of lineNodes) {
      const section = workingPaperSectionForNode(node);
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(node);
    }
    return map;
  }, [lineNodes]);

  const sectionNodes = nodesBySection.get(sectionKey) || [];
  const defaultNodeId = sectionNodes[0]?.id || '';

  const papersBySection = useMemo(() => {
    const map = new Map<string, NonNullable<CloseDash['working_papers']>>();
    const papers = dashQuery.data?.working_papers || [];
    for (const wp of papers) {
      const node = lineNodes.find((n) => n.id === wp.structure_node_id);
      const section = node
        ? workingPaperSectionForNode(node)
        : workingPaperSectionForNode({ title: wp.title });
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(wp);
    }
    return map;
  }, [dashQuery.data, lineNodes]);

  const leadsBySection = useMemo(() => {
    const map = new Map<string, NonNullable<CloseDash['lead_schedules']>>();
    for (const ls of dashQuery.data?.lead_schedules || []) {
      const node = lineNodes.find((n) => n.id === ls.structure_node_id);
      const section = node
        ? workingPaperSectionForNode(node)
        : workingPaperSectionForNode({ title: ls.title });
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(ls);
    }
    return map;
  }, [dashQuery.data, lineNodes]);

  const evidenceBySection = useMemo(() => {
    const map = new Map<string, NonNullable<CloseDash['supporting_evidence']>>();
    for (const ev of dashQuery.data?.supporting_evidence || []) {
      const node = lineNodes.find((n) => n.id === ev.structure_node_id);
      const paper = (dashQuery.data?.working_papers || []).find((w) => w.id === ev.working_paper_id);
      const section = node
        ? workingPaperSectionForNode(node)
        : paper
          ? workingPaperSectionForNode({ title: paper.title })
          : workingPaperSectionForNode({ title: ev.title });
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(ev);
    }
    return map;
  }, [dashQuery.data, lineNodes]);

  const createWp = useMutation({
    mutationFn: () => {
      if (!defaultNodeId) throw new Error('No line available for this section yet');
      return invokeFinancialStatements(companyId, 'CREATE_WORKING_PAPER', {
        workspace_id: workspaceId,
        structure_node_id: defaultNodeId,
        title: wpTitle || `${sectionKey} schedule`,
      });
    },
    onSuccess: () => {
      showSuccess('Supporting schedule created');
      setWpTitle('');
      qc.invalidateQueries({ queryKey: ['efs_close_evidence', companyId, workspaceId] });
      qc.invalidateQueries({ queryKey: ['efs_dashboard', companyId, workspaceId] });
    },
    onError: (e: Error) => showError(e.message),
  });

  const openNotes = dashQuery.data?.open_review_notes ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supporting Schedules</CardTitle>
          <CardDescription>
            Accounting schedules for Annual Financial Statements preparation — Cash, Trade
            Receivables, Inventory, Property, Plant &amp; Equipment, Trade Payables, Revenue,
            Borrowings, Taxation, and Employee Benefits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {openNotes > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {openNotes} review note{openNotes === 1 ? '' : 's'} outstanding across schedules.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label>Schedule topic</Label>
              <Select value={sectionKey} onValueChange={setSectionKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <Label>Title</Label>
              <Input
                value={wpTitle}
                onChange={(e) => setWpTitle(e.target.value)}
                placeholder={`${sectionKey} schedule`}
              />
            </div>
            <Button disabled={createWp.isPending} onClick={() => createWp.mutate()}>
              Add schedule
            </Button>
          </div>

          <Accordion type="multiple" defaultValue={SECTION_ORDER.slice(0, 4)} className="w-full">
            {SECTION_ORDER.map((section) => {
              const papers = papersBySection.get(section) || [];
              const leads = leadsBySection.get(section) || [];
              const evidence = evidenceBySection.get(section) || [];
              const count = papers.length + leads.length;
              return (
                <AccordionItem key={section} value={section}>
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      {section}
                      <Badge variant="secondary">{count}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div>
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Balance
                      </h4>
                      {leads.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No balance schedule yet.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {leads.map((ls) => (
                            <li
                              key={ls.id}
                              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                            >
                              <span>{ls.title}</span>
                              <Badge variant="outline">{evidenceStatusLabel(ls.status)}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Supporting Evidence
                      </h4>
                      {evidence.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No supporting evidence linked.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {evidence.map((ev) => (
                            <li
                              key={ev.id}
                              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                            >
                              <span>{ev.title}</span>
                              <Badge variant="secondary">{ev.evidence_type.replace(/_/g, ' ')}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Schedules
                      </h4>
                      {papers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No schedules in this section yet.
                        </p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {papers.map((wp) => (
                            <li
                              key={wp.id}
                              className="space-y-1 rounded-md border px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{wp.title}</span>
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline">{evidenceStatusLabel(wp.status)}</Badge>
                                  {format(new Date(wp.updated_at), 'dd MMM yyyy')}
                                </span>
                              </div>
                              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                <span>Prepared By: {wp.prepared_by || '—'}</span>
                                <span>Reviewed By: {wp.reviewed_by || '—'}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Review Notes
                      </h4>
                      {(dashQuery.data?.review_notes || []).filter((n) => {
                        const paper = papers.find((p) => p.id === n.working_paper_id);
                        return !!paper || papers.length === 0;
                      }).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No review notes for this section.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {(dashQuery.data?.review_notes || [])
                            .filter((n) => {
                              const paper = papers.find((p) => p.id === n.working_paper_id);
                              return !!paper;
                            })
                            .map((n) => (
                              <li key={n.id} className="rounded-md border px-3 py-2">
                                <p>{n.note}</p>
                                {n.status && (
                                  <Badge variant="outline" className="mt-1">
                                    {evidenceStatusLabel(n.status)}
                                  </Badge>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
