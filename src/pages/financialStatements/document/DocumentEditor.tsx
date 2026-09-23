import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';
import { accountingPoliciesService } from '../../../governance/domains/accountingPolicies/service';
import type {
  DocNoteNode,
  DocPolicyNode,
  DocPolicySetNode,
  DocStatementNode,
  DocumentModel,
} from '../../../lib/financialStatements/document/documentModel';
import { resolvedTitle } from '../../../lib/financialStatements/document/documentStore';
import type { DocumentOverridesApi } from '../../../lib/financialStatements/document/documentStore';
import { professionalStatementTitle } from '../../../lib/financialStatements/publication/afsProfessionalPdf';
import { corporateDisplayFromModel } from '../../../lib/financialStatements/corporateInformation/accessors';
import type { DocSelection } from '../experience/EngagementDocumentWorkspace';
import type { EfsWorkspaceGeneralInformation } from '../../../lib/financialStatements/api';
import EngagementInformation from '../experience/EngagementInformation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { cn, formatCurrency } from '../../../lib/utils';
import { showError, showSuccess } from '../../../utils/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Loader2, Save } from 'lucide-react';

type EditorContext = {
  companyId: string;
  model: DocumentModel;
  overridesApi: DocumentOverridesApi;
  onSaved: () => void;
};

function TitleOverrideField({
  nodeId,
  currentTitle,
  overridesApi,
  label = 'Displayed title',
}: {
  nodeId: string;
  currentTitle: string;
  overridesApi: DocumentOverridesApi;
  label?: string;
}) {
  const [value, setValue] = useState(currentTitle);
  useEffect(() => setValue(currentTitle), [currentTitle, nodeId]);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
        <Button
          variant="outline"
          onClick={() => {
            overridesApi.setTitleOverride(nodeId, value);
            showSuccess('Title updated');
          }}
        >
          Apply
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Presentation-only override for this document. Clear the field and apply to restore the
        default title.
      </p>
    </div>
  );
}

function StatementEditor({
  statement,
  ctx,
}: {
  statement: DocStatementNode;
  ctx: EditorContext;
}) {
  const displayTitle = professionalStatementTitle(
    statement.statement_type,
    resolvedTitle(ctx.overridesApi.overrides, statement.id, statement.title),
  );
  // A comparative column of blanks would read as "nil", which is a different
  // claim, so it is shown only when there are prior figures to show.
  const showComparatives = statement.lines.some(
    (l) => l.prior_amount != null && Number(l.prior_amount) !== 0,
  );
  const currentColumn = ctx.model?.period?.label || 'Current year';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{displayTitle}</CardTitle>
        <CardDescription>
          Amounts are populated from the trial balance through the reporting engine and cannot be
          edited here. You can rename the statement heading and control its visibility.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TitleOverrideField
          nodeId={statement.id}
          currentTitle={statement.title}
          overridesApi={ctx.overridesApi}
          label="Statement heading"
        />
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">&nbsp;</th>
                <th className="px-3 py-2 text-right font-medium">{currentColumn}</th>
                {showComparatives && (
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Prior year
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {statement.lines.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={showComparatives ? 3 : 2}>
                    Amounts will appear once the statements have been built from your accounting
                    records.
                  </td>
                </tr>
              ) : (
                statement.lines.map((ln, idx) => (
                  <tr
                    key={`${ln.line_code}-${idx}`}
                    className={cn(
                      'border-b last:border-0',
                      (ln.is_total || ln.is_grand_total) && 'bg-muted/20 font-semibold',
                      ln.is_subtotal && 'font-medium',
                      ln.is_header && 'font-medium text-muted-foreground',
                      ln.is_reconciling && 'text-amber-800 dark:text-amber-300',
                    )}
                  >
                    <td
                      className="px-3 py-2"
                      style={{ paddingLeft: `${0.75 + (ln.level ?? 0) * 1.25}rem` }}
                    >
                      {ln.label}
                    </td>
                    {/* A heading carries no figure; formatCurrency(null) printed R 0,00. */}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {ln.amount == null ? '' : formatCurrency(ln.amount)}
                    </td>
                    {showComparatives && (
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {ln.prior_amount == null ? '' : formatCurrency(ln.prior_amount)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PolicyEditor({
  policy,
  ctx,
}: {
  policy: DocPolicyNode;
  ctx: EditorContext;
}) {
  const [title, setTitle] = useState(policy.title);
  const [body, setBody] = useState(policy.body);
  useEffect(() => {
    setTitle(policy.title);
    setBody(policy.body);
  }, [policy.id, policy.title, policy.body]);

  const save = useMutation({
    // Phase G3.4 — Accounting Policy upserts resolve through Governance.
    mutationFn: () =>
      accountingPoliciesService.upsertAccountingPolicy(ctx.companyId, {
        policy_set_id: policy.policy_set_id,
        policy_code: policy.policy_code,
        title,
        body,
        sort_order: policy.sort_order,
      }),
    onSuccess: () => {
      showSuccess('Accounting policy saved');
      ctx.onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accounting Policy</CardTitle>
        <CardDescription>
          Edit the policy wording. Changes are saved to the engagement and appear in the preview and
          PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Policy title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Policy wording</Label>
          <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? 'Saving...' : 'Save policy'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PolicySetEditor({ set }: { set: DocPolicySetNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{set.title}</CardTitle>
        <CardDescription>
          Accounting policy set for the selected framework. Select an individual policy in the tree
          to edit its wording.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{set.status}</Badge>
          <span className="text-muted-foreground">
            {set.policies.length} {set.policies.length === 1 ? 'policy' : 'policies'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ParagraphEditor({
  companyId,
  paragraphId,
  initialBody,
  onSaved,
}: {
  companyId: string;
  paragraphId: string;
  initialBody: string;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  useEffect(() => setBody(initialBody), [paragraphId, initialBody]);
  const save = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'UPDATE_DISCLOSURE_PARAGRAPH', {
        paragraph_id: paragraphId,
        body,
      }),
    onSuccess: () => {
      showSuccess('Paragraph saved');
      onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });
  return (
    <div className="space-y-2">
      <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="mr-2 h-4 w-4" />
        {save.isPending ? 'Saving...' : 'Save paragraph'}
      </Button>
    </div>
  );
}

function SectionEditor({
  companyId,
  sectionId,
  initialTitle,
  initialBody,
  onSaved,
}: {
  companyId: string;
  sectionId: string;
  initialTitle: string;
  initialBody: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  useEffect(() => {
    setTitle(initialTitle);
    setBody(initialBody);
  }, [sectionId, initialTitle, initialBody]);
  const save = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'UPDATE_DISCLOSURE_SECTION', {
        section_id: sectionId,
        title,
        body,
      }),
    onSuccess: () => {
      showSuccess('Section saved');
      onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Section heading" />
      <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="mr-2 h-4 w-4" />
        {save.isPending ? 'Saving...' : 'Save section'}
      </Button>
    </div>
  );
}

const DISC_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_progress', 'complete'],
  in_progress: ['complete', 'draft'],
  complete: ['in_progress'],
  superseded: [],
};

const STATUS_ACTION_LABEL: Record<string, string> = {
  in_progress: 'Mark in progress',
  complete: 'Mark complete',
  draft: 'Reopen as draft',
};

function NoteStatusControl({ note, ctx }: { note: DocNoteNode; ctx: EditorContext }) {
  const transition = useMutation({
    mutationFn: (toStatus: string) =>
      invokeFinancialStatements(ctx.companyId, 'TRANSITION_DISCLOSURE_STATUS', {
        disclosure_instance_id: note.id,
        to_status: toStatus,
      }),
    onSuccess: () => {
      showSuccess('Note status updated');
      ctx.onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });
  const next = DISC_TRANSITIONS[note.status] || [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{note.status}</Badge>
      {next
        .filter((s) => s !== 'superseded')
        .map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            onClick={() => transition.mutate(s)}
            disabled={transition.isPending}
          >
            {STATUS_ACTION_LABEL[s] || s}
          </Button>
        ))}
    </div>
  );
}

function rowsToText(rows: unknown[]): string {
  return (rows || [])
    .map((row) => {
      if (Array.isArray(row)) return row.map((c) => String(c ?? '')).join(' | ');
      if (row && typeof row === 'object') {
        return Object.values(row as Record<string, unknown>)
          .map((c) => String(c ?? ''))
          .join(' | ');
      }
      return String(row ?? '');
    })
    .join('\n');
}

function textToRows(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split('|').map((cell) => cell.trim()));
}

function TableEditor({
  companyId,
  tableId,
  initialTitle,
  initialRows,
  onSaved,
}: {
  companyId: string;
  tableId: string;
  initialTitle: string;
  initialRows: unknown[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(() => rowsToText(initialRows));
  useEffect(() => {
    setTitle(initialTitle);
    setText(rowsToText(initialRows));
  }, [tableId, initialTitle, initialRows]);
  const save = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(companyId, 'UPDATE_DISCLOSURE_TABLE', {
        table_id: tableId,
        title,
        rows_json: textToRows(text),
      }),
    onSuccess: () => {
      showSuccess('Table saved');
      onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Table title" />
      <Textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="One row per line; separate cells with |"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">One row per line; separate cells with |</p>
        <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? 'Saving...' : 'Save table'}
        </Button>
      </div>
    </div>
  );
}

function NoteEditor({ note, ctx }: { note: DocNoteNode; ctx: EditorContext }) {
  const addParagraph = useMutation({
    mutationFn: () =>
      invokeFinancialStatements(ctx.companyId, 'UPDATE_DISCLOSURE_PARAGRAPH', {
        disclosure_instance_id: note.id,
        section_id: note.sections[0]?.id ?? null,
        body: '',
      }),
    onSuccess: () => {
      showSuccess('Paragraph added');
      ctx.onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {resolvedTitle(ctx.overridesApi.overrides, note.id, note.title)}
        </CardTitle>
        <CardDescription>
          Edit the note wording, headings and tables. Note numbers update automatically based on
          which notes are visible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NoteStatusControl note={note} ctx={ctx} />
        <TitleOverrideField
          nodeId={note.id}
          currentTitle={note.title}
          overridesApi={ctx.overridesApi}
          label="Note title"
        />

        {note.sections.length > 0 && (
          <div className="space-y-2">
            <Label>Sections</Label>
            {note.sections.map((section) => (
              <SectionEditor
                key={section.id}
                companyId={ctx.companyId}
                sectionId={section.id}
                initialTitle={section.title}
                initialBody={section.body}
                onSaved={ctx.onSaved}
              />
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label>Paragraphs</Label>
          {note.paragraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paragraphs yet.</p>
          ) : (
            note.paragraphs.map((paragraph) => (
              <ParagraphEditor
                key={paragraph.id}
                companyId={ctx.companyId}
                paragraphId={paragraph.id}
                initialBody={paragraph.body}
                onSaved={ctx.onSaved}
              />
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => addParagraph.mutate()}
            disabled={addParagraph.isPending}
          >
            Add paragraph
          </Button>
        </div>

        {note.tables.length > 0 && (
          <div className="space-y-2">
            <Label>Tables</Label>
            {note.tables.map((table) => (
              <TableEditor
                key={table.id}
                companyId={ctx.companyId}
                tableId={table.id}
                initialTitle={table.title}
                initialRows={table.rows_json}
                onSaved={ctx.onSaved}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type FrameworkPackOption = {
  id: string;
  framework_key: string;
  label: string;
  efs_frameworks?: { name?: string };
};

/**
 * The reporting framework the statements are prepared under.
 *
 * It decides the statement wording, which disclosures are required and which
 * accounting policies are written, so it is a decision the preparer makes —
 * not a fixed property of the module. Until now it was whichever pack sorted
 * first alphabetically, with nowhere in the product to change it.
 */
function FrameworkSelector({
  model,
  workspaceId,
  onChanged,
}: {
  model: DocumentModel;
  workspaceId: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const packsQuery = useQuery({
    queryKey: ['efs_framework_packs', model.companyId],
    queryFn: () =>
      invokeFinancialStatements<FrameworkPackOption[]>(model.companyId, 'LIST_FRAMEWORK_PACKS'),
    staleTime: 5 * 60_000,
  });

  const change = useMutation({
    mutationFn: async (packId: string) => {
      const bound = await invokeFinancialStatements<{ disclosures_superseded?: number }>(
        model.companyId,
        'BIND_FRAMEWORK',
        {
          framework_pack_id: packId,
          workspace_id: workspaceId,
          reporting_period_id: model.period?.id ?? undefined,
          period_from: model.period?.start_date ?? undefined,
          period_to: model.period?.end_date ?? undefined,
        },
      );
      // Bring in the new framework's required disclosures, then rebuild the
      // statements so their wording follows the framework too.
      await invokeFinancialStatements(model.companyId, 'ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK', {
        workspace_id: workspaceId,
        framework_pack_id: packId,
      });
      await invokeFinancialStatements(model.companyId, 'GENERATE_STATEMENTS', {
        workspace_id: workspaceId,
      }).catch(() => {
        // Statements are rebuilt on the next update if none are prepared yet.
      });
      return bound;
    },
    onSuccess: async (bound) => {
      const moved = bound?.disclosures_superseded ?? 0;
      showSuccess(
        moved > 0
          ? `Reporting framework changed. ${moved} note${moved === 1 ? '' : 's'} from the previous framework moved out of the document.`
          : 'Reporting framework changed.',
      );
      // The framework on screen is read from the workspace dashboard, so that
      // query has to be refetched too — invalidating only the document model
      // left the old framework's name on the cover.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['efs_dashboard', model.companyId, workspaceId] }),
        qc.invalidateQueries({ queryKey: ['efs_statements', model.companyId, workspaceId] }),
        qc.invalidateQueries({ queryKey: ['efs_doc_model', model.companyId, workspaceId] }),
      ]);
      onChanged();
    },
    onError: (e: unknown) => showError(e instanceof Error ? e.message : String(e)),
  });

  const packs = packsQuery.data || [];
  const current = packs.find((p) => p.id === model.frameworkPackId);

  return (
    <div className="flex items-center justify-end gap-2">
      <Select
        value={model.frameworkPackId ?? undefined}
        onValueChange={(v) => v !== model.frameworkPackId && change.mutate(v)}
        disabled={change.isPending || packsQuery.isLoading}
      >
        <SelectTrigger className="h-8 w-[290px]" data-testid="afs-framework-select">
          <SelectValue placeholder={current?.label || model.frameworkLabel || 'Choose a framework'} />
        </SelectTrigger>
        <SelectContent>
          {packs.map((p) => (
            <SelectItem key={p.id} value={p.id} data-testid="afs-framework-option">
              {p.efs_frameworks?.name || p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {change.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

function CoverEditor({
  model,
  workspaceId,
  onSaved,
}: {
  model: DocumentModel;
  workspaceId: string;
  onSaved: () => void;
}) {
  const display = corporateDisplayFromModel(model);
  const rows: Array<[string, React.ReactNode]> = [
    ['Registered name', display.registeredName],
    ['Trading name', display.tradingName || '—'],
    [
      'Reporting framework',
      <FrameworkSelector
        key="fw"
        model={model}
        workspaceId={workspaceId}
        onChanged={onSaved}
      />,
    ],
    ['Reporting period', model.period?.period_key || model.period?.label || '—'],
    ['Reporting currency', display.reportingCurrency],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cover Page</CardTitle>
        <CardDescription>
          The cover is taken from General Information, in the navigator on the left. Everything here
          flows straight into the preview and the PDF.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex min-h-9 items-center justify-between gap-4 border-b py-1.5 last:border-0"
            >
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function SignatureEditor({
  model,
  selectionId,
}: {
  model: DocumentModel;
  selectionId: string;
}) {
  const sig = (model.signatures || []).find((s) => s.id === selectionId);
  if (!sig) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signature</CardTitle>
          <CardDescription>Signature block not found.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows: Array<[string, string]> = [
    ['Role', sig.label],
    ['Name', sig.name || '[Name]'],
    ['Position', sig.position || '[Position]'],
    ['Date', sig.date || '[Date]'],
    ['Signature', '[Signature]'],
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{sig.label}</CardTitle>
          <Badge variant={sig.complete ? 'default' : 'secondary'}>
            {sig.complete ? 'Captured' : 'Pending'}
          </Badge>
        </div>
        <CardDescription>
          Signature details are assembled from the engagement Information tab (Prepared By,
          Reviewed By, Approved By, Company Secretary / Directors, and approval dates). Empty
          fields render as placeholders in Preview and PDF. Update values in Information — no
          separate signature API is used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd
                className={cn(
                  'text-right font-medium',
                  v.startsWith('[') && 'text-muted-foreground',
                )}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ContentsInfo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contents</CardTitle>
        <CardDescription>
          The table of contents is generated automatically from the visible statements and notes,
          and renumbers itself whenever you show or hide a section.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function DocumentEditor({
  companyId,
  workspaceId,
  model,
  selection,
  overridesApi,
  generalInfo,
  onSaved,
}: {
  companyId: string;
  workspaceId: string;
  model: DocumentModel;
  selection: DocSelection;
  overridesApi: DocumentOverridesApi;
  generalInfo?: EfsWorkspaceGeneralInformation | null;
  onSaved: () => void;
}) {
  const ctx: EditorContext = { companyId, model, overridesApi, onSaved };
  const kind = selection.kind;

  if (kind === 'cover')
    return <CoverEditor model={model} workspaceId={workspaceId} onSaved={onSaved} />;
  // The entity's own details are part of the document, so they are edited from
  // the document rather than from a separate "Information" tab.
  if (kind === 'information') {
    return (
      <EngagementInformation
        companyId={companyId}
        workspaceId={workspaceId}
        generalInfo={generalInfo}
        frameworkLabel={model.frameworkLabel ?? undefined}
      />
    );
  }
  if (kind === 'contents') return <ContentsInfo />;
  if (kind === 'signature') return <SignatureEditor model={model} selectionId={selection.id} />;

  if (selection.kind === 'statement') {
    const statement = model.statements.find((s) => s.id === selection.id);
    if (!statement) return <ContentsInfo />;
    return <StatementEditor statement={statement} ctx={ctx} />;
  }

  if (selection.kind === 'policySet') {
    const set = model.policySets.find((p) => p.id === selection.id);
    if (!set) return <ContentsInfo />;
    return <PolicySetEditor set={set} />;
  }

  if (selection.kind === 'policy') {
    for (const set of model.policySets) {
      const policy = set.policies.find((p) => p.id === selection.id);
      if (policy) return <PolicyEditor policy={policy} ctx={ctx} />;
    }
    return <ContentsInfo />;
  }

  const note = model.notes.find((n) => n.id === selection.id);
  if (!note) return <ContentsInfo />;
  return <NoteEditor note={note} ctx={ctx} />;
}
