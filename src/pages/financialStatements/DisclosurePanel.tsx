import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invokeFinancialStatements } from '../../lib/financialStatements/api';
import { accountingPoliciesService } from '../../governance/domains/accountingPolicies/service';
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

type DiscDash = {
  disclosures: Array<{
    id: string;
    disclosure_code: string;
    title: string;
    status: string;
    requirement_level: string;
    working_paper_id: string | null;
    updated_at: string;
  }>;
  by_status: Record<string, number>;
  accounting_policy_sets: Array<{ id: string; title: string; status: string; version_no: number }>;
  cross_references: Array<{ id: string; source_kind: string; target_kind: string; label: string | null }>;
  framework_mappings: Array<{ id: string; disclosure_code: string; requirement_level: string }>;
  validation_engine: boolean;
  review_workflow: boolean;
  publication: boolean;
  xbrl: boolean;
};

/**
 * Disclosure Platform panel — Phase C3.
 * Content attaches only to Statement Structure via note_placeholder points.
 * Framework packs determine required disclosures. No Validation / Publication / XBRL.
 */
export default function DisclosurePanel({
  companyId,
  workspaceId,
  frameworkPackId,
}: {
  companyId: string;
  workspaceId: string;
  frameworkPackId?: string | null;
}) {
  const qc = useQueryClient();
  const [policyTitle, setPolicyTitle] = useState('Basis of measurement');
  const [policyCode, setPolicyCode] = useState('measurement');
  const [policyBody, setPolicyBody] = useState('');
  const [policySetId, setPolicySetId] = useState('');
  const [xrefDiscId, setXrefDiscId] = useState('');
  const [xrefTargetKind, setXrefTargetKind] = useState('structure_node');
  const [xrefTargetId, setXrefTargetId] = useState('');

  const dashQuery = useQuery({
    queryKey: ['efs_disclosure_dash', companyId, workspaceId, frameworkPackId],
    queryFn: () =>
      invokeFinancialStatements<DiscDash>(companyId, 'GET_DISCLOSURE_DASHBOARD', {
        workspace_id: workspaceId,
        framework_pack_id: frameworkPackId || undefined,
      }),
  });

  const structureQuery = useQuery({
    queryKey: ['efs_structure_for_disc', companyId],
    queryFn: () =>
      invokeFinancialStatements<{ nodes: Array<{ id: string; node_code: string; node_kind: string }> }>(
        companyId,
        'GET_STATEMENT_STRUCTURE',
      ),
  });

  const wpQuery = useQuery({
    queryKey: ['efs_wps_for_disc', companyId, workspaceId],
    queryFn: () =>
      invokeFinancialStatements<Array<{ id: string; title: string }>>(companyId, 'LIST_WORKING_PAPERS', {
        workspace_id: workspaceId,
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efs_disclosure_dash', companyId, workspaceId] });
  };

  const assemble = useMutation({
    mutationFn: () => {
      if (!frameworkPackId) throw new Error('Framework pack is required to assemble disclosures.');
      return invokeFinancialStatements(companyId, 'ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK', {
        workspace_id: workspaceId,
        framework_pack_id: frameworkPackId,
      });
    },
    onSuccess: (r: { created?: unknown[]; skipped?: unknown[] }) => {
      showSuccess(`Assembled ${(r.created || []).length} disclosures (${(r.skipped || []).length} skipped)`);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const createPolicySet = useMutation({
    // Phase G3.4 — Accounting Policy Set mutations resolve through Governance.
    mutationFn: () => {
      if (!frameworkPackId) throw new Error('Framework pack is required.');
      return accountingPoliciesService.createAccountingPolicySet(
        companyId,
        workspaceId,
        frameworkPackId,
      ) as Promise<{ id: string }>;
    },
    onSuccess: (r) => {
      showSuccess('Accounting policy set created');
      setPolicySetId(r.id);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const upsertPolicy = useMutation({
    mutationFn: () =>
      accountingPoliciesService.upsertAccountingPolicy(companyId, {
        policy_set_id: policySetId,
        policy_code: policyCode,
        title: policyTitle,
        body: policyBody,
      }),
    onSuccess: () => {
      showSuccess('Accounting policy saved');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const linkWp = useMutation({
    mutationFn: ({ disclosureId, workingPaperId }: { disclosureId: string; workingPaperId: string }) =>
      invokeFinancialStatements(companyId, 'LINK_DISCLOSURE_WORKING_PAPER', {
        disclosure_instance_id: disclosureId,
        working_paper_id: workingPaperId,
      }),
    onSuccess: () => {
      showSuccess('Disclosure linked to Working Paper');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const createXref = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'CREATE_CROSS_REFERENCE', {
        workspace_id: workspaceId,
        source_kind: 'disclosure_instance',
        source_id: xrefDiscId,
        target_kind: xrefTargetKind,
        target_id: xrefTargetId,
        structure_node_id: xrefTargetKind === 'structure_node' ? xrefTargetId : undefined,
        label: 'Disclosure cross-reference',
      }),
    onSuccess: () => {
      showSuccess('Cross reference created');
      setXrefTargetId('');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const transition = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) =>
      invokeFinancialStatements(companyId, 'TRANSITION_DISCLOSURE_STATUS', {
        disclosure_instance_id: id,
        to_status: to,
      }),
    onSuccess: () => {
      showSuccess('Disclosure status updated');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const d = dashQuery.data;
  const lineNodes = (structureQuery.data?.nodes || []).filter(
    (n) => n.node_kind === 'line_item' || n.node_kind === 'statement',
  );
  const wps = wpQuery.data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Disclosures &amp; Accounting Policies</CardTitle>
        <CardDescription>
          Notes, policies, and cross-references attach to certified Statement Structure nodes. Framework
          packs determine required disclosures. Validation, Review Workflow, Publication, and XBRL are
          not implemented in this phase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!frameworkPackId || assemble.isPending}
            onClick={() => assemble.mutate()}
          >
            Assemble from framework pack
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!frameworkPackId || createPolicySet.isPending}
            onClick={() => createPolicySet.mutate()}
          >
            New accounting policy set
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4 text-sm">
          <div>
            <div className="text-muted-foreground">Draft</div>
            <div className="text-lg font-medium">{d?.by_status?.draft ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground">In progress</div>
            <div className="text-lg font-medium">{d?.by_status?.in_progress ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Complete</div>
            <div className="text-lg font-medium">{d?.by_status?.complete ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Framework mappings</div>
            <div className="text-lg font-medium">{d?.framework_mappings?.length ?? 0}</div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Disclosure instances</div>
          <ul className="space-y-2 text-sm">
            {(d?.disclosures || []).length === 0 && (
              <li className="text-muted-foreground">None yet — assemble from the bound framework pack.</li>
            )}
            {(d?.disclosures || []).map((disc) => (
              <li key={disc.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{disc.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {disc.disclosure_code} · {disc.requirement_level}
                    {disc.working_paper_id ? ' · WP linked' : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{disc.status}</Badge>
                  {disc.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: disc.id, to: 'in_progress' })}>
                      Start
                    </Button>
                  )}
                  {(disc.status === 'draft' || disc.status === 'in_progress') && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: disc.id, to: 'complete' })}>
                      Complete
                    </Button>
                  )}
                  {wps.length > 0 && !disc.working_paper_id && (
                    <Select
                      onValueChange={(wpId) => linkWp.mutate({ disclosureId: disc.id, workingPaperId: wpId })}
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue placeholder="Link WP" />
                      </SelectTrigger>
                      <SelectContent>
                        {wps.map((wp) => (
                          <SelectItem key={wp.id} value={wp.id}>
                            {wp.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="text-sm font-medium">Accounting policy</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Policy set</Label>
              <Select value={policySetId} onValueChange={setPolicySetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select set" />
                </SelectTrigger>
                <SelectContent>
                  {(d?.accounting_policy_sets || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} (v{s.version_no})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Code</Label>
              <Input value={policyCode} onChange={(e) => setPolicyCode(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Title</Label>
              <Input value={policyTitle} onChange={(e) => setPolicyTitle(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Body</Label>
              <Input value={policyBody} onChange={(e) => setPolicyBody(e.target.value)} placeholder="Policy narrative" />
            </div>
          </div>
          <Button
            size="sm"
            disabled={!policySetId || !policyCode || upsertPolicy.isPending}
            onClick={() => upsertPolicy.mutate()}
          >
            Save policy
          </Button>
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="text-sm font-medium">Cross reference</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Source disclosure</Label>
              <Select value={xrefDiscId} onValueChange={setXrefDiscId}>
                <SelectTrigger>
                  <SelectValue placeholder="Disclosure" />
                </SelectTrigger>
                <SelectContent>
                  {(d?.disclosures || []).map((disc) => (
                    <SelectItem key={disc.id} value={disc.id}>
                      {disc.disclosure_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Target kind</Label>
              <Select value={xrefTargetKind} onValueChange={setXrefTargetKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="structure_node">Structure node</SelectItem>
                  <SelectItem value="working_paper">Working paper</SelectItem>
                  <SelectItem value="disclosure_instance">Disclosure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Target</Label>
              {xrefTargetKind === 'structure_node' ? (
                <Select value={xrefTargetId} onValueChange={setXrefTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Node" />
                  </SelectTrigger>
                  <SelectContent>
                    {lineNodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.node_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : xrefTargetKind === 'working_paper' ? (
                <Select value={xrefTargetId} onValueChange={setXrefTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="WP" />
                  </SelectTrigger>
                  <SelectContent>
                    {wps.map((wp) => (
                      <SelectItem key={wp.id} value={wp.id}>
                        {wp.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={xrefTargetId} onValueChange={setXrefTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Disclosure" />
                  </SelectTrigger>
                  <SelectContent>
                    {(d?.disclosures || [])
                      .filter((x) => x.id !== xrefDiscId)
                      .map((disc) => (
                        <SelectItem key={disc.id} value={disc.id}>
                          {disc.disclosure_code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!xrefDiscId || !xrefTargetId || createXref.isPending}
            onClick={() => createXref.mutate()}
          >
            Create cross reference
          </Button>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(d?.cross_references || []).slice(0, 8).map((x) => (
              <li key={x.id}>
                {x.source_kind} → {x.target_kind}
                {x.label ? ` · ${x.label}` : ''}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Updated {d?.disclosures?.[0] ? format(new Date(d.disclosures[0].updated_at), 'dd MMM HH:mm') : '—'} ·
          validation={String(d?.validation_engine ?? false)} · publication={String(d?.publication ?? false)} ·
          xbrl={String(d?.xbrl ?? false)}
        </p>
      </CardContent>
    </Card>
  );
}
