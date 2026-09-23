import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';
import { accountingPoliciesService } from '../../../governance/domains/accountingPolicies/service';
import type {
  DocNoteNode,
  DocParagraph,
  DocPolicyNode,
  DocPolicySetNode,
  DocSection,
  DocStatementNode,
  DocTable,
  DocumentModel,
} from '../../../lib/financialStatements/document/documentModel';
import { resolvedTitle } from '../../../lib/financialStatements/document/documentStore';
import type { DocumentOverridesApi } from '../../../lib/financialStatements/document/documentStore';
import {
  isStoredRow,
  saveNoteContent,
  type NoteContentKind,
} from '../../../lib/financialStatements/document/authoring';
import { professionalStatementTitle } from '../../../lib/financialStatements/publication/afsProfessionalPdf';
import { corporateDisplayFromModel } from '../../../lib/financialStatements/corporateInformation/accessors';
import type { DocSelection } from '../experience/EngagementDocumentWorkspace';
import type {
  EfsStatementLine,
  EfsWorkspaceGeneralInformation,
} from '../../../lib/financialStatements/api';
import EngagementInformation from '../experience/EngagementInformation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
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
import { Loader2, Plus, Save, X } from 'lucide-react';

type EditorContext = {
  companyId: string;
  workspaceId: string;
  model: DocumentModel;
  overridesApi: DocumentOverridesApi;
  /** These statements are final: the wording is fixed until they are reopened. */
  locked: boolean;
  onSaved: () => void;
  /** A generated note has just been stored and now has a real id. */
  onNoteStored?: (disclosureInstanceId: string) => void;
};

/**
 * Most of this document is generated and has no row of its own, so the first
 * edit to a piece of it has to create one. `saveNoteContent` decides; the
 * editors below just say what changed.
 */
function useContentSave(ctx: EditorContext, note: DocNoteNode, kind: NoteContentKind) {
  return useMutation({
    mutationFn: (params: {
      id: string;
      code: string;
      title?: string;
      body?: string;
      rows_json?: unknown[];
      columns_json?: unknown[];
      sortOrder?: number;
    }) =>
      saveNoteContent({
        companyId: ctx.companyId,
        workspaceId: ctx.workspaceId,
        frameworkPackId: ctx.model.frameworkPackId,
        note,
        kind,
        ...params,
      }),
    onSuccess: (result) => {
      // The note that was generated now exists. Follow it, or the navigator's
      // selection points at an id the reloaded document no longer has and the
      // reader is dropped back to the contents page mid-edit.
      if (result.materialised && result.disclosureInstanceId) {
        ctx.onNoteStored?.(result.disclosureInstanceId);
      }
      ctx.onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });
}

/**
 * Where a piece of wording came from.
 *
 * Standard wording is the framework's and is rewritten whenever the statements
 * are rebuilt; once edited it is the accountant's and is left alone. Saying so
 * is the difference between trusting the document and re-reading all of it.
 */
function ContentOriginBadge({ generated }: { generated: boolean }) {
  return generated ? (
    <span className="text-xs text-muted-foreground" data-testid="afs-origin-standard">
      Standard wording
    </span>
  ) : (
    <Badge variant="secondary" className="text-xs" data-testid="afs-origin-authored">
      Your wording
    </Badge>
  );
}

/**
 * How a figure got onto the page.
 *
 * Linked comes straight from the ledger, calculated is derived from it under a
 * controlled rule, and manual is the preparer's own judgement. An auditor has to
 * be able to tell them apart at a glance.
 */
export function FigureOriginBadge({
  origin,
}: {
  origin: 'linked' | 'calculated' | 'manual';
}) {
  const style = {
    linked: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
    calculated: 'border-sky-500/40 text-sky-700 dark:text-sky-400',
    manual: 'border-amber-500/50 text-amber-800 dark:text-amber-300',
  }[origin];
  const label = { linked: 'Linked', calculated: 'Calculated', manual: 'Needs input' }[origin];
  return (
    <Badge variant="outline" className={cn('text-[10px] font-normal', style)}>
      {label}
    </Badge>
  );
}

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

/**
 * Where a figure came from.
 *
 * Every classified line is generated from named ledger accounts, and the engine
 * already seals that list into the statement. Until now it was fetched and
 * dropped, so a reviewer asking "what is in this number?" had to leave the
 * document and rebuild the answer from the trial balance.
 */
function LineSourceDialog({
  line,
  model,
  onClose,
}: {
  line: EfsStatementLine | null;
  model: DocumentModel;
  onClose: () => void;
}) {
  const accounts = line?.accounts || [];
  const total = accounts.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  // If these disagree, the line carries something the account list does not
  // explain, and saying so is more useful than showing a tidy total.
  const drift = Math.abs(total - Number(line?.amount ?? 0));

  return (
    <Dialog open={!!line} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{line?.label}</DialogTitle>
          <DialogDescription>
            {model.companyName || 'This company'} · {model.period?.label || 'Current period'} ·{' '}
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </DialogDescription>
        </DialogHeader>

        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This line is a total or a heading — it is calculated from the lines above it rather than
            taken from accounts of its own.
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => (
                  <tr key={a.id || `${a.name}-${i}`} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {a.account_code ? (
                        <span className="mr-2 text-xs text-muted-foreground tabular-nums">
                          {a.account_code}
                        </span>
                      ) : null}
                      {a.name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(a.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {drift > 0.005 && (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            These accounts come to {formatCurrency(total)}, but the line reads{' '}
            {formatCurrency(Number(line?.amount ?? 0))}.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatementEditor({
  statement,
  ctx,
}: {
  statement: DocStatementNode;
  ctx: EditorContext;
}) {
  const [sourceLine, setSourceLine] = useState<EfsStatementLine | null>(null);
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
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{displayTitle}</CardTitle>
          <FigureOriginBadge origin="linked" />
        </div>
        <CardDescription>
          These figures come from your ledger and cannot be typed over. Select a line to see the
          accounts behind it. You can rename the heading and choose what appears.
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
                statement.lines.map((ln, idx) => {
                  const traceable = (ln.accounts?.length ?? 0) > 0;
                  return (
                  <tr
                    key={`${ln.line_code}-${idx}`}
                    className={cn(
                      'border-b last:border-0',
                      (ln.is_total || ln.is_grand_total) && 'bg-muted/20 font-semibold',
                      ln.is_subtotal && 'font-medium',
                      ln.is_header && 'font-medium text-muted-foreground',
                      ln.is_reconciling && 'text-amber-800 dark:text-amber-300',
                      traceable && 'cursor-pointer hover:bg-muted/30',
                    )}
                    onClick={traceable ? () => setSourceLine(ln) : undefined}
                    data-testid={traceable ? 'afs-traceable-line' : undefined}
                  >
                    <td
                      className="px-3 py-2"
                      style={{ paddingLeft: `${0.75 + (ln.level ?? 0) * 1.25}rem` }}
                    >
                      {ln.label}
                      {ln.is_reconciling && (
                        <span className="ml-2 text-xs">
                          — not yet classified in the chart of accounts
                        </span>
                      )}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <LineSourceDialog line={sourceLine} model={ctx.model} onClose={() => setSourceLine(null)} />
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
  ctx,
  note,
  paragraph,
}: {
  ctx: EditorContext;
  note: DocNoteNode;
  paragraph: DocParagraph;
}) {
  const [body, setBody] = useState(paragraph.body);
  useEffect(() => setBody(paragraph.body), [paragraph.id, paragraph.body]);
  const save = useContentSave(ctx, note, 'paragraph');
  const generated = !isStoredRow(paragraph.id);
  return (
    <div className="space-y-2">
      <Textarea rows={5} value={body} readOnly={ctx.locked} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={save.isPending || ctx.locked}
          onClick={() =>
            save.mutate(
              {
                id: paragraph.id,
                code: paragraph.paragraph_code,
                body,
                sortOrder: paragraph.sort_order,
              },
              { onSuccess: () => showSuccess('Paragraph saved') },
            )
          }
        >
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? 'Saving...' : 'Save paragraph'}
        </Button>
        <ContentOriginBadge generated={generated} />
      </div>
    </div>
  );
}

function SectionEditor({
  ctx,
  note,
  section,
}: {
  ctx: EditorContext;
  note: DocNoteNode;
  section: DocSection;
}) {
  const [title, setTitle] = useState(section.title);
  const [body, setBody] = useState(section.body);
  useEffect(() => {
    setTitle(section.title);
    setBody(section.body);
  }, [section.id, section.title, section.body]);
  const save = useContentSave(ctx, note, 'section');
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Input
        value={title}
        readOnly={ctx.locked}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Section heading"
      />
      <Textarea rows={4} value={body} readOnly={ctx.locked} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={save.isPending || ctx.locked}
          onClick={() =>
            save.mutate(
              {
                id: section.id,
                code: section.section_code,
                title,
                body,
                sortOrder: section.sort_order,
              },
              { onSuccess: () => showSuccess('Section saved') },
            )
          }
        >
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? 'Saving...' : 'Save section'}
        </Button>
        <ContentOriginBadge generated={!isStoredRow(section.id)} />
      </div>
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

/** Rows arrive as arrays or as objects depending on who wrote them. */
function toGrid(rows: unknown[]): string[][] {
  return (rows || []).map((row) => {
    if (Array.isArray(row)) return row.map((c) => String(c ?? ''));
    if (row && typeof row === 'object') {
      return Object.values(row as Record<string, unknown>).map((c) => String(c ?? ''));
    }
    return [String(row ?? '')];
  });
}

function columnLabels(columns: unknown[], grid: string[][]): string[] {
  const width = grid.reduce((w, r) => Math.max(w, r.length), 0) || 2;
  const declared = (columns || []).map((c) => {
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      return String(o.label ?? o.title ?? o.name ?? '');
    }
    return '';
  });
  return Array.from({ length: Math.max(width, declared.length) }, (_, i) => declared[i] ?? '');
}

/**
 * A note table, edited as a table.
 *
 * This was a textarea in which rows were separated by newlines and cells by
 * pipe characters, which is not something you can hand an accountant and call a
 * financial reporting tool.
 */
function TableEditor({
  ctx,
  note,
  table,
}: {
  ctx: EditorContext;
  note: DocNoteNode;
  table: DocTable;
}) {
  const [title, setTitle] = useState(table.title);
  const [grid, setGrid] = useState<string[][]>(() => toGrid(table.rows_json));
  const [headers, setHeaders] = useState<string[]>(() =>
    columnLabels(table.columns_json, toGrid(table.rows_json)),
  );
  useEffect(() => {
    const next = toGrid(table.rows_json);
    setTitle(table.title);
    setGrid(next);
    setHeaders(columnLabels(table.columns_json, next));
  }, [table.id, table.title, table.rows_json, table.columns_json]);

  const save = useContentSave(ctx, note, 'table');
  const width = headers.length || 2;

  const setCell = (r: number, c: number, v: string) =>
    setGrid((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));

  const addRow = () => setGrid((prev) => [...prev, Array.from({ length: width }, () => '')]);
  const removeRow = (r: number) => setGrid((prev) => prev.filter((_, ri) => ri !== r));
  const addColumn = () => {
    setHeaders((prev) => [...prev, '']);
    setGrid((prev) => prev.map((row) => [...row, '']));
  };
  const removeColumn = (c: number) => {
    setHeaders((prev) => prev.filter((_, ci) => ci !== c));
    setGrid((prev) => prev.map((row) => row.filter((_, ci) => ci !== c)));
  };

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="afs-table-editor">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Table title" />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {headers.map((h, c) => (
                <th key={c} className="p-1">
                  <div className="flex items-center gap-1">
                    <Input
                      value={h}
                      placeholder={`Column ${c + 1}`}
                      className="h-8 border-0 bg-transparent font-medium shadow-none focus-visible:ring-1"
                      onChange={(e) =>
                        setHeaders((prev) => prev.map((x, ci) => (ci === c ? e.target.value : x)))
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove column ${c + 1}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeColumn(c)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} className="border-b last:border-0">
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="p-1">
                    <Input
                      value={row[c] ?? ''}
                      className={cn(
                        'h-8 border-0 bg-transparent shadow-none focus-visible:ring-1',
                        c > 0 && 'text-right tabular-nums',
                      )}
                      onChange={(e) => setCell(r, c, e.target.value)}
                    />
                  </td>
                ))}
                <td className="p-1 text-center">
                  <button
                    type="button"
                    aria-label={`Remove row ${r + 1}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(r)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {grid.length === 0 && (
              <tr>
                <td className="p-3 text-sm text-muted-foreground" colSpan={width + 1}>
                  This table is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow} data-testid="afs-table-add-row">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Row
        </Button>
        <Button variant="outline" size="sm" onClick={addColumn}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Column
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <ContentOriginBadge generated={!isStoredRow(table.id)} />
          <Button
            variant="outline"
            size="sm"
            disabled={save.isPending || ctx.locked}
            data-testid="afs-table-save"
            onClick={() =>
              save.mutate(
                {
                  id: table.id,
                  code: table.table_code,
                  title,
                  rows_json: grid,
                  columns_json: headers,
                  sortOrder: table.sort_order,
                },
                { onSuccess: () => showSuccess('Table saved') },
              )
            }
          >
            <Save className="mr-2 h-4 w-4" />
            {save.isPending ? 'Saving...' : 'Save table'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The figures in this note that the ledger cannot supply.
 *
 * The engine already works out which rows of a generated table have no fact
 * behind them — a valuation, a commitment, a director's estimate. Nothing showed
 * them, so a preparer had to find the blanks by reading. Now the note says.
 */
function ManualFieldsNotice({ ctx, note }: { ctx: EditorContext; note: DocNoteNode }) {
  const fields = (ctx.model.manualFields || []).filter(
    (f) => f.noteCode.toUpperCase() === String(note.disclosure_code || '').toUpperCase(),
  );
  if (fields.length === 0) return null;
  return (
    <div
      className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30"
      data-testid="afs-manual-fields"
    >
      <div className="flex items-center gap-2">
        <FigureOriginBadge origin="manual" />
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          {fields.length} {fields.length === 1 ? 'figure needs' : 'figures need'} your input
        </p>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-amber-900/90 dark:text-amber-200/90">
        {fields.map((f, i) => (
          <li key={`${f.label}-${i}`}>
            <span className="font-medium">{f.label}</span>
            {f.tableTitle ? <span className="text-xs"> · {f.tableTitle}</span> : null}
            {f.reason ? <div className="text-xs opacity-80">{f.reason}</div> : null}
          </li>
        ))}
      </ul>
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

        <ManualFieldsNotice ctx={ctx} note={note} />

        {note.sections.length > 0 && (
          <div className="space-y-2">
            <Label>Sections</Label>
            {note.sections.map((section) => (
              <SectionEditor key={section.id} ctx={ctx} note={note} section={section} />
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label>Paragraphs</Label>
          {note.paragraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paragraphs yet.</p>
          ) : (
            note.paragraphs.map((paragraph) => (
              <ParagraphEditor key={paragraph.id} ctx={ctx} note={note} paragraph={paragraph} />
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
              <TableEditor key={table.id} ctx={ctx} note={note} table={table} />
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
          {/* Naming the framework explicitly rather than letting the trigger
              derive it: until the options arrive there is no item matching the
              bound value, and the field renders blank on the cover page. */}
          <SelectValue placeholder="Choose a framework">
            {current?.efs_frameworks?.name || current?.label || model.frameworkLabel || null}
          </SelectValue>
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
  locked = false,
  onSaved,
  onNoteStored,
}: {
  companyId: string;
  workspaceId: string;
  model: DocumentModel;
  selection: DocSelection;
  overridesApi: DocumentOverridesApi;
  generalInfo?: EfsWorkspaceGeneralInformation | null;
  locked?: boolean;
  onSaved: () => void;
  onNoteStored?: (disclosureInstanceId: string) => void;
}) {
  const ctx: EditorContext = {
    companyId,
    workspaceId,
    model,
    overridesApi,
    locked,
    onSaved,
    onNoteStored,
  };
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

  // A note that has just been stored changes id. Falling back to the framework
  // code keeps the reader on the note they were reading.
  const note =
    model.notes.find((n) => n.id === selection.id) ??
    model.notes.find((n) => n.disclosure_code && selection.id.endsWith(n.disclosure_code));
  if (!note) return <ContentsInfo />;
  return <NoteEditor note={note} ctx={ctx} />;
}
