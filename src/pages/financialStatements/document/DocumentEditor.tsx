import { useEffect, useMemo, useRef, useState } from 'react';
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
  deleteNoteContent,
  isStoredRow,
  saveNoteContent,
  type NoteContentKind,
} from '../../../lib/financialStatements/document/authoring';
import {
  isKeyHidden,
  nextPlacement,
  orderedParagraphs,
  orderedTables,
  paragraphKey,
  reorderedPlacements,
  tableKey,
} from '../../../lib/financialStatements/document/noteContent';
import { asGeneratedTable } from '../../../lib/financialStatements/disclosures/assemble';
import type {
  Cell as DisclosureCell,
  GeneratedTable,
} from '../../../lib/financialStatements/disclosures/types';
import SpreadsheetEditor from './SpreadsheetEditor';
import NoteLineItems from './NoteLineItems';
import { reconcileNotesToStatements } from '../../../lib/financialStatements/disclosures/reconciliation';
import type { NoteRegister } from '../../../lib/financialStatements/document/noteRegister';
import type { CanonicalDocumentView } from '../../../lib/financialStatements/publication/canonicalDocumentView';
import {
  professionalStatementTitle,
  statementPeriodCaption,
} from '../../../lib/financialStatements/publication/afsProfessionalPdf';
import {
  documentHasComparatives,
  lineNegatesFigure,
  formatStatementFigure,
  isTotalRole,
  lineIndent,
  lineRole,
  reportingYears,
} from '../../../lib/financialStatements/publication/statementPresentation';
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
import { ChevronDown, ChevronUp, EyeOff, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';

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
  /** The printed note numbering, shared with the navigator and the PDF. */
  register: NoteRegister | null;
  /** The document as it will print, for what each note's tables print. */
  view: CanonicalDocumentView | null;
  /** Move the reader to another part of the document. */
  onSelect: (selection: DocSelection) => void;
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
  locked = false,
}: {
  nodeId: string;
  currentTitle: string;
  overridesApi: DocumentOverridesApi;
  label?: string;
  /** Final statements keep their titles until they are reopened. */
  locked?: boolean;
}) {
  const [value, setValue] = useState(currentTitle);
  useEffect(() => setValue(currentTitle), [currentTitle, nodeId]);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={value} disabled={locked} onChange={(e) => setValue(e.target.value)} />
        <Button
          variant="outline"
          disabled={locked}
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

/**
 * A note number on a statement, which opens the note it names.
 *
 * The number is read from the note register, never from the statement, so it
 * is always the number the note prints with and always a note that prints.
 */
function NoteReference({ line, ctx }: { line: EfsStatementLine; ctx: EditorContext }) {
  const target = ctx.register?.forLine(line.line_code);
  if (!target) return null;
  return (
    <button
      type="button"
      data-testid="afs-note-ref"
      data-note-id={target.id}
      data-note-number={target.noteNumber}
      aria-label={`Open note ${target.noteNumber}, ${target.title}`}
      title={`Note ${target.noteNumber}. ${target.title}`}
      className="rounded px-1.5 font-medium text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 hover:bg-emerald-500/10 hover:decoration-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400"
      onClick={(e) => {
        // The row itself opens the accounts behind the figure; the number opens the note.
        e.stopPropagation();
        ctx.onSelect({ kind: 'note', id: target.id });
      }}
    >
      {target.noteNumber}
    </button>
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
  // The same two columns on every statement, current year first, decided once
  // for the whole set — exactly as the Live Preview and the PDF print them.
  const years = reportingYears(ctx.model.period);
  const showComparatives = documentHasComparatives(ctx.model.statements);
  const columns = showComparatives ? 4 : 3;
  const entity = corporateDisplayFromModel(ctx.model).registeredName || ctx.model.companyName;
  const figureCell = 'w-[7.5rem] pl-2 py-1.5 text-right tabular-nums whitespace-nowrap';
  // The Statement of Changes in Equity is a matrix — one column per component
  // of equity, both years' movements as rows — exactly as it prints.
  const equityLines = statement.lines.filter((l) => l.columns != null);
  const isEquityMatrix = statement.statement_type === 'changes_in_equity' && equityLines.length > 0;
  const hasCapitalCol = equityLines.some((l) => l.columns?.capital != null);
  const equityComponents: Array<{ key: 'capital' | 'retained' | 'total'; label: string }> = [
    ...(hasCapitalCol ? [{ key: 'capital' as const, label: 'Share capital' }] : []),
    { key: 'retained' as const, label: 'Retained earnings' },
    { key: 'total' as const, label: 'Total equity' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{displayTitle}</CardTitle>
          <FigureOriginBadge origin="linked" />
        </div>
        <CardDescription>
          These figures come from your ledger and cannot be typed over. Select a line to see the
          accounts behind it, or a note number to open the note. You can rename the heading and
          choose what appears.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TitleOverrideField
          nodeId={statement.id}
          currentTitle={statement.title}
          overridesApi={ctx.overridesApi}
          label="Statement heading"
          locked={ctx.locked}
        />
        <div className="overflow-x-auto rounded-md border bg-background">
          <div className="min-w-[30rem] px-4 py-4" data-testid="afs-statement">
            <div className="mb-5 space-y-0.5">
              {entity && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {entity}
                </p>
              )}
              <h3 className="text-lg font-semibold tracking-tight">{displayTitle}</h3>
              <p className="text-sm text-muted-foreground">
                {statementPeriodCaption(statement.statement_type, ctx.model.period || {})}
              </p>
            </div>
            {isEquityMatrix ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-foreground/70 align-bottom">
                    <th className="py-1.5 pr-3 text-left font-medium">
                      <span className="sr-only">Movement</span>
                    </th>
                    {equityComponents.map((c) => (
                      <th key={c.key} className={cn(figureCell, 'font-semibold')} data-col-head={c.key}>
                        {c.label}
                        <span className="block text-[11px] font-normal italic text-muted-foreground">
                          R
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((ln, idx) => {
                    const role = lineRole(ln);
                    const totalled = isTotalRole(role);
                    const rule = (value: number | null | undefined) =>
                      value == null
                        ? undefined
                        : cn(
                            totalled && 'border-t border-foreground/60',
                            role === 'grand_total' &&
                              'border-b-4 border-double border-foreground/80',
                          );
                    return (
                      <tr
                        key={`${ln.line_code}-${idx}`}
                        data-role={role}
                        data-line-code={ln.line_code}
                        className={cn(totalled && 'font-semibold')}
                      >
                        <td
                          className={cn('py-1.5 pr-3', totalled && 'pt-2')}
                          style={{ paddingLeft: `${lineIndent(ln, role) * 1.25}rem` }}
                        >
                          {ln.label}
                        </td>
                        {equityComponents.map((c) => {
                          const value = ln.columns
                            ? ln.columns[c.key]
                            : c.key === 'total'
                              ? ln.amount
                              : null;
                          return (
                            <td
                              key={c.key}
                              className={cn(figureCell, rule(value), totalled && 'pt-2')}
                              data-col={c.key}
                            >
                              {formatStatementFigure(value, role)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-foreground/70 align-bottom">
                  <th className="py-1.5 pr-3 text-left font-medium">
                    <span className="sr-only">Line item</span>
                  </th>
                  <th className="w-12 px-1 py-1.5 text-center text-xs font-semibold text-muted-foreground">
                    Notes
                  </th>
                  <th className={cn(figureCell, 'font-semibold')} data-testid="afs-col-current">
                    {years.current}
                    <span className="block text-[11px] font-normal italic text-muted-foreground">R</span>
                  </th>
                  {showComparatives && (
                    <th className={cn(figureCell, 'font-semibold')} data-testid="afs-col-comparative">
                      {years.comparative}
                      <span className="block text-[11px] font-normal italic text-muted-foreground">
                        R
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {statement.lines.length === 0 ? (
                  <tr>
                    <td className="py-3 text-muted-foreground" colSpan={columns}>
                      Amounts will appear once the statements have been built from your accounting
                      records.
                    </td>
                  </tr>
                ) : (
                  statement.lines.map((ln, idx) => {
                    const role = lineRole(ln);
                    const totalled = isTotalRole(role);
                    const negate = lineNegatesFigure(statement.statement_type, ln);
                    const traceable = (ln.accounts?.length ?? 0) > 0;
                    if (role === 'heading') {
                      return (
                        <tr key={`${ln.line_code}-${idx}`} data-role="heading">
                          <td
                            colSpan={columns}
                            className={cn('pb-1 font-semibold', idx === 0 ? 'pt-1' : 'pt-5')}
                          >
                            {ln.label}
                          </td>
                        </tr>
                      );
                    }
                    // Ruled only where there is a figure to rule.
                    const figureRule = (value: number | null | undefined) =>
                      value == null
                        ? undefined
                        : cn(
                            totalled && 'border-t border-foreground/60',
                            role === 'grand_total' && 'border-b-4 border-double border-foreground/80',
                          );
                    return (
                      <tr
                        key={`${ln.line_code}-${idx}`}
                        data-role={role}
                        data-line-code={ln.line_code}
                        className={cn(
                          totalled && 'font-semibold',
                          ln.is_reconciling && 'text-amber-800 dark:text-amber-300',
                          traceable && 'cursor-pointer hover:bg-muted/40',
                        )}
                        onClick={traceable ? () => setSourceLine(ln) : undefined}
                        data-testid={traceable ? 'afs-traceable-line' : undefined}
                      >
                        <td
                          className={cn('py-1.5 pr-3', totalled && 'pt-2')}
                          style={{ paddingLeft: `${lineIndent(ln, role) * 1.25}rem` }}
                        >
                          {ln.label}
                          {ln.is_reconciling && (
                            <span className="ml-2 text-xs">
                              — not yet classified in the chart of accounts
                            </span>
                          )}
                        </td>
                        <td className="w-12 px-1 py-1.5 text-center">
                          {role === 'item' ? <NoteReference line={ln} ctx={ctx} /> : null}
                        </td>
                        <td className={cn(figureCell, figureRule(ln.amount), totalled && 'pt-2')} data-col="current">
                          {formatStatementFigure(ln.amount, role, { negate })}
                        </td>
                        {showComparatives && (
                          <td
                            className={cn(figureCell, figureRule(ln.prior_amount), totalled && 'pt-2')}
                            data-col="comparative"
                          >
                            {formatStatementFigure(ln.prior_amount, role, { negate })}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
        <LineSourceDialog line={sourceLine} model={ctx.model} onClose={() => setSourceLine(null)} />
      </CardContent>
    </Card>
  );
}

/**
 * Where a note is used on the face of the statements, and the accounts behind
 * each figure — so the reader can follow a figure from the statement to its
 * note and on to the ledger, and back again.
 */
/**
 * Where this note's total disagrees with the statement line it explains. The
 * statements and notes come from one sealed snapshot; a difference means one of
 * them has been edited or built wrongly, and the reader is told here, on the
 * note, rather than finding out from a reviewer.
 */
function NoteDisagreements({ note, ctx }: { note: DocNoteNode; ctx: EditorContext }) {
  const found = useMemo(
    () => reconcileNotesToStatements(ctx.model).filter((d) => d.noteId === note.id),
    [ctx.model, note.id],
  );
  if (found.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="afs-note-disagreement"
      className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
    >
      {found.map((d) => (
        <p key={`${d.line}:${d.year}`}>
          {d.year === 'current' ? 'This year' : 'The comparative year'}: this note totals{' '}
          <span className="tabular-nums">{formatStatementFigure(d.noteFigure, 'total')}</span>, but “
          {d.statementLabel}” on the statement is{' '}
          <span className="tabular-nums">{formatStatementFigure(d.statementFigure, 'total')}</span>.
        </p>
      ))}
    </div>
  );
}

function NoteReferencedFrom({ note, ctx }: { note: DocNoteNode; ctx: EditorContext }) {
  const [sourceLine, setSourceLine] = useState<EfsStatementLine | null>(null);
  const registered = ctx.register?.byId.get(note.id);
  if (!registered) return null;
  const uses = ctx.model.statements.flatMap((statement) =>
    statement.lines
      .filter((line) => lineRole(line) === 'item' && ctx.register?.forLine(line.line_code)?.id === note.id)
      .map((line) => ({ statement, line })),
  );
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-sm" data-testid="afs-note-referenced-from">
      {uses.length === 0 ? (
        <p className="text-muted-foreground">
          Note {registered.noteNumber} is not referred to from a line on the face of the statements.
        </p>
      ) : (
        <>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Referred to from
          </p>
          <ul className="space-y-1">
            {uses.map(({ statement, line }) => (
              <li key={`${statement.id}:${line.line_code}`} className="flex flex-wrap items-baseline gap-x-2">
                <button
                  type="button"
                  className="text-left text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 hover:decoration-emerald-600 dark:text-emerald-400"
                  data-testid="afs-note-backlink"
                  onClick={() => ctx.onSelect({ kind: 'statement', id: statement.id })}
                >
                  {professionalStatementTitle(statement.statement_type, statement.title)} — {line.label}
                </button>
                <span className="tabular-nums text-muted-foreground">
                  {formatStatementFigure(line.amount, 'item')}
                </span>
                {(line.accounts?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    data-testid="afs-note-source"
                    onClick={() => setSourceLine(line)}
                  >
                    {line.accounts!.length} {line.accounts!.length === 1 ? 'account' : 'accounts'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <LineSourceDialog line={sourceLine} model={ctx.model} onClose={() => setSourceLine(null)} />
    </div>
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
          <Input value={title} disabled={ctx.locked} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Policy wording</Label>
          <Textarea rows={10} value={body} disabled={ctx.locked} onChange={(e) => setBody(e.target.value)} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || ctx.locked}>
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

/**
 * Where the accountant writes the narrative front matter: the directors'
 * report, the directors' responsibilities statement, the practitioner's
 * report and the approval wording. The generated statutory text is the
 * starting point; saving stores the practice's own wording on the
 * engagement, and reset returns the section to the generated text. Both
 * the preview and the exported PDF and Word documents print exactly what
 * is saved here.
 */
function FrontSectionEditor({ sectionId, ctx }: { sectionId: string; ctx: EditorContext }) {
  const fm = ctx.view?.frontMatter;
  const section = fm
    ? [fm.responsibilities, fm.directorsReport, fm.practitionerReport, fm.approval].find(
        (s) => s.id === sectionId,
      ) ?? null
    : null;
  const resolvedBlocks = useMemo(
    () => (section?.blocks ?? []).map((b) => ({ heading: b.heading ?? '', body: b.body })),
    [section],
  );
  const [blocks, setBlocks] = useState(resolvedBlocks);
  const [dirty, setDirty] = useState(false);
  const loadedFor = useRef('');
  useEffect(() => {
    // Reload when the reader moves to another section, or when a save or a
    // reset lands (the resolved wording then matches what should be shown) —
    // but never over unsaved typing.
    const fingerprint = `${sectionId}::${JSON.stringify(resolvedBlocks)}`;
    if (loadedFor.current === fingerprint) return;
    loadedFor.current = fingerprint;
    setBlocks(resolvedBlocks);
    setDirty(false);
  }, [sectionId, resolvedBlocks]);

  if (!section) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          This section appears once the document has been prepared.
        </CardContent>
      </Card>
    );
  }

  const change = (idx: number, patch: Partial<{ heading: string; body: string }>) => {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
    setDirty(true);
  };
  const removeBlock = (idx: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const addBlock = () => {
    setBlocks((prev) => [...prev, { heading: '', body: '' }]);
    setDirty(true);
  };
  const save = () => {
    ctx.overridesApi.setNarrative(
      sectionId,
      blocks.map((b) => ({ heading: b.heading.trim() || undefined, body: b.body })),
    );
    setDirty(false);
    showSuccess('Wording saved to the engagement');
  };
  const reset = () => {
    ctx.overridesApi.setNarrative(sectionId, null);
    setDirty(false);
    showSuccess('Section returned to the generated wording');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{section.title}</CardTitle>
          <Badge variant={section.authored ? 'default' : 'outline'} data-testid="front-authored-badge">
            {section.authored ? 'Edited by the practice' : 'Generated wording'}
          </Badge>
        </div>
        <CardDescription>
          {ctx.locked
            ? 'These statements are final: the wording is fixed until they are reopened.'
            : 'Edit the wording below. It prints exactly as saved, in the preview, the PDF and the Word document.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocks.map((block, idx) => (
          <div key={idx} className="space-y-1.5 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Heading (optional)"
                value={block.heading}
                disabled={ctx.locked}
                onChange={(e) => change(idx, { heading: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove paragraph"
                disabled={ctx.locked || blocks.length <= 1}
                onClick={() => removeBlock(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              rows={Math.min(10, Math.max(3, Math.ceil(block.body.length / 90)))}
              value={block.body}
              disabled={ctx.locked}
              onChange={(e) => change(idx, { body: e.target.value })}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={addBlock} disabled={ctx.locked}>
            <Plus className="mr-1 h-4 w-4" /> Add paragraph
          </Button>
          <Button size="sm" onClick={save} disabled={ctx.locked || !dirty}>
            <Save className="mr-1 h-4 w-4" /> Save wording
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={ctx.locked || (!section.authored && !dirty)}
          >
            Reset to generated wording
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Move a piece of a note, and take it out again.
 *
 * Taking something out means two different things and the buttons say which.
 * Wording the preparer authored is a row, and removing it deletes that row.
 * Wording the framework generated has no row; it is withheld from this
 * document and can be brought back, because deleting it would achieve nothing
 * and it would reappear the next time the statements were rebuilt.
 */
function PieceControls({
  ctx,
  kind,
  id,
  pieceKey,
  siblingKeys,
  noun,
}: {
  ctx: EditorContext;
  kind: NoteContentKind;
  /** The row id, or a synthetic one for content the framework generated. */
  id: string;
  /** What this piece's placement is remembered against. */
  pieceKey: string;
  /** Every sibling's key, in the order they are shown. */
  siblingKeys: string[];
  noun: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const hidden = isKeyHidden(ctx.overridesApi.overrides, pieceKey);
  const stored = isStoredRow(id);
  const position = siblingKeys.indexOf(pieceKey);

  const move = (direction: -1 | 1) => {
    const placements = reorderedPlacements(siblingKeys, position, direction);
    if (placements) ctx.overridesApi.setOrders(placements);
  };

  const remove = useMutation({
    mutationFn: () => deleteNoteContent({ companyId: ctx.companyId, kind, id }),
    onSuccess: () => {
      setConfirming(false);
      // Its placement goes with it: nothing should outlive what it describes.
      ctx.overridesApi.forget(pieceKey);
      showSuccess(`${noun} deleted`);
      ctx.onSaved();
    },
    onError: (e: Error) => {
      setConfirming(false);
      showError(e.message);
    },
  });

  if (hidden) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Not in this document</Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          disabled={ctx.locked}
          data-testid="afs-piece-restore"
          onClick={() => ctx.overridesApi.setHidden(pieceKey, false)}
        >
          Bring back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {/* Most notes hold one paragraph and one table. Arrows that can never do
          anything are not a disabled control, they are a control that looks
          broken, so there is nothing to move until there is. */}
      {siblingKeys.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label={`Move ${noun.toLowerCase()} up`}
            data-testid="afs-piece-up"
            disabled={ctx.locked || position <= 0}
            onClick={() => move(-1)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label={`Move ${noun.toLowerCase()} down`}
            data-testid="afs-piece-down"
            disabled={ctx.locked || position < 0 || position >= siblingKeys.length - 1}
            onClick={() => move(1)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </>
      )}

      {stored ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-destructive hover:text-destructive"
            data-testid="afs-piece-delete"
            disabled={ctx.locked || remove.isPending}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this {noun.toLowerCase()}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It was written for these financial statements and deleting it cannot be undone.
                  The change is recorded against the engagement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="afs-piece-delete-confirm"
                  onClick={(e) => {
                    e.preventDefault();
                    remove.mutate();
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          data-testid="afs-piece-remove"
          disabled={ctx.locked}
          title="Standard wording — withheld from this document, not deleted"
          onClick={() => ctx.overridesApi.setHidden(pieceKey, true)}
        >
          <EyeOff className="mr-1.5 h-4 w-4" />
          Remove
        </Button>
      )}
    </div>
  );
}

function ParagraphEditor({
  ctx,
  note,
  paragraph,
  siblings,
}: {
  ctx: EditorContext;
  note: DocNoteNode;
  paragraph: DocParagraph;
  siblings: DocParagraph[];
}) {
  const [body, setBody] = useState(paragraph.body);
  useEffect(() => setBody(paragraph.body), [paragraph.id, paragraph.body]);
  const save = useContentSave(ctx, note, 'paragraph');
  const generated = !isStoredRow(paragraph.id);
  const key = paragraphKey(note, paragraph);
  const hidden = isKeyHidden(ctx.overridesApi.overrides, key);
  return (
    <div
      className={cn('space-y-2 rounded-md', hidden && 'opacity-60')}
      data-testid="afs-paragraph"
      data-hidden={hidden ? 'true' : undefined}
    >
      <Textarea
        rows={5}
        value={body}
        readOnly={ctx.locked || hidden}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={save.isPending || ctx.locked || hidden}
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
        <div className="ml-auto">
          <PieceControls
            ctx={ctx}
            kind="paragraph"
            id={paragraph.id}
            pieceKey={key}
            siblingKeys={siblings.map((s) => paragraphKey(note, s))}
            noun="Paragraph"
          />
        </div>
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
            disabled={transition.isPending || ctx.locked}
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
  siblings,
}: {
  ctx: EditorContext;
  note: DocNoteNode;
  table: DocTable;
  siblings: DocTable[];
}) {
  const [title, setTitle] = useState(table.title);
  const [grid, setGrid] = useState<string[][]>(() => toGrid(table.rows_json));
  const [headers, setHeaders] = useState<string[]>(() =>
    columnLabels(table.columns_json, toGrid(table.rows_json)),
  );
  // Same rule as the spreadsheet above: compare what the table contains, not
  // which array it arrived in, or a save elsewhere in the note wipes this one.
  const signature = useMemo(
    () => JSON.stringify([table.id, table.title, table.columns_json, table.rows_json]),
    [table.id, table.title, table.columns_json, table.rows_json],
  );
  const applied = useRef(signature);
  useEffect(() => {
    if (signature === applied.current) return;
    applied.current = signature;
    const next = toGrid(table.rows_json);
    setTitle(table.title);
    setGrid(next);
    setHeaders(columnLabels(table.columns_json, next));
  }, [signature, table]);

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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Table title"
          className="max-w-sm"
        />
        <div className="ml-auto">
          <PieceControls
            ctx={ctx}
            kind="table"
            id={table.id}
            pieceKey={tableKey(note, table)}
            siblingKeys={siblings.map((s) => tableKey(note, s))}
            noun="Table"
          />
        </div>
      </div>

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

/**
 * A generated disclosure table, with the spreadsheet over it.
 *
 * The table arrives populated from the accounting records. Everything the
 * preparer does to it — a row added, a caption reworded, a column formatted —
 * is saved against the note, and the figures drawn from the ledger are refreshed
 * underneath it the next time the statements are built.
 */
function DisclosureTableEditor({
  ctx,
  note,
  table,
  siblings,
}: {
  ctx: EditorContext;
  note: DocNoteNode;
  table: DocTable;
  siblings: DocTable[];
}) {
  const initial = asGeneratedTable(table);
  const [working, setWorking] = useState<GeneratedTable | null>(initial);
  const [dirty, setDirty] = useState(false);
  const [sourceCell, setSourceCell] = useState<DisclosureCell | null>(null);

  /**
   * When to take the table back from the document, and when not to.
   *
   * This watched `table.rows_json` — an array, compared by identity. The
   * document is rebuilt on every save anywhere in the note, and a rebuild makes
   * new arrays even when nothing in this table changed, so adding a row here
   * and then adding a paragraph over there silently threw the row away. Worse,
   * it cleared the dirty flag too, so the Save button went quiet and there was
   * nothing to say the work had gone.
   *
   * Two rules now. Compare what the table contains, not which array it is in;
   * and never overwrite unsaved work — the reader's edit outranks a refresh.
   */
  const signature = useMemo(
    () => JSON.stringify([table.id, table.title, table.columns_json, table.rows_json]),
    [table.id, table.title, table.columns_json, table.rows_json],
  );
  const applied = useRef(signature);
  useEffect(() => {
    if (dirty || signature === applied.current) return;
    applied.current = signature;
    setWorking(asGeneratedTable(table));
  }, [signature, dirty, table]);

  const save = useContentSave(ctx, note, 'table');
  const key = tableKey(note, table);
  const hidden = isKeyHidden(ctx.overridesApi.overrides, key);
  if (!working) return null;

  return (
    <div
      className={cn('space-y-2 rounded-md border p-3', hidden && 'opacity-60')}
      data-testid="afs-note-table"
      data-hidden={hidden ? 'true' : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={working.title}
          readOnly={ctx.locked}
          onChange={(e) => {
            setWorking({ ...working, title: e.target.value });
            setDirty(true);
          }}
          className="h-8 max-w-sm border-0 bg-transparent text-sm font-medium shadow-none focus-visible:ring-1"
        />
        <div className="flex items-center gap-2">
          <ContentOriginBadge generated={!isStoredRow(table.id)} />
          <Button
            size="sm"
            variant={dirty ? 'default' : 'outline'}
            disabled={save.isPending || ctx.locked || !dirty}
            data-testid="afs-table-save"
            onClick={() =>
              save.mutate(
                {
                  id: table.id,
                  code: table.table_code,
                  title: working.title,
                  rows_json: working.rows as unknown[],
                  columns_json: working.columns as unknown[],
                  sortOrder: table.sort_order,
                },
                {
                  onSuccess: () => {
                    setDirty(false);
                    showSuccess('Table saved');
                  },
                },
              )
            }
          >
            <Save className="mr-2 h-4 w-4" />
            {save.isPending ? 'Saving…' : dirty ? 'Save table' : 'Saved'}
          </Button>
          <PieceControls
            ctx={ctx}
            kind="table"
            id={table.id}
            pieceKey={key}
            siblingKeys={siblings.map((s) => tableKey(note, s))}
            noun="Table"
          />
        </div>
      </div>

      {!hidden && (
        <SpreadsheetEditor
          table={working}
          readOnly={ctx.locked}
          onChange={(next) => {
            setWorking(next);
            setDirty(true);
          }}
          onViewSource={(c) => setSourceCell(c)}
        />
      )}

      {working.footnote && <p className="text-xs text-muted-foreground">{working.footnote}</p>}

      <CellSourceDialog cell={sourceCell} model={ctx.model} onClose={() => setSourceCell(null)} />
    </div>
  );
}

/** The accounts behind one figure in a disclosure table. */
function CellSourceDialog({
  cell,
  model,
  onClose,
}: {
  cell: DisclosureCell | null;
  model: DocumentModel;
  onClose: () => void;
}) {
  const accounts = cell?.source?.accounts || [];
  const basis = cell?.source?.basis;
  const total = accounts.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const period =
    basis === 'prior'
      ? 'the comparative period'
      : basis === 'activity'
        ? 'movement for the period'
        : model.period?.label || 'the current period';

  return (
    <Dialog open={!!cell} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Where this figure comes from</DialogTitle>
          <DialogDescription>
            {model.companyName || 'This company'} · {period} · {accounts.length}{' '}
            {accounts.length === 1 ? 'account' : 'accounts'}
          </DialogDescription>
        </DialogHeader>
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
                    {a.code ? (
                      <span className="mr-2 text-xs text-muted-foreground tabular-nums">{a.code}</span>
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
      </DialogContent>
    </Dialog>
  );
}

/** A new table opens in the spreadsheet, so it is created in its shape. */
function starterTable(): { columns: unknown[]; rows: unknown[] } {
  const money = { align: 'right', numberFormat: 'currency', decimals: 2, negativeParens: true };
  const blankRow = (label: string) => ({
    key: `row-${label}-${Math.random().toString(36).slice(2, 8)}`,
    cells: [
      { value: label, origin: 'manual', format: { align: 'left' } },
      { value: null, origin: 'manual', format: money },
    ],
  });
  return {
    columns: [
      { label: 'Description', width: 240, align: 'left' },
      { label: 'Amount', width: 120, align: 'right' },
    ],
    rows: [blankRow(''), blankRow(''), blankRow('')],
  };
}

function NoteEditor({ note, ctx }: { note: DocNoteNode; ctx: EditorContext }) {
  const overrides = ctx.overridesApi.overrides;
  const paragraphs = orderedParagraphs(note, overrides);
  const tables = orderedTables(note, overrides);

  /**
   * Adding goes through the same route as every other edit.
   *
   * It used to insert straight into the paragraph table using the note's id,
   * which works only for a note that already exists as a row. Most notes do
   * not: the disclosure engine builds them and their id is a synthetic one like
   * "fw:note:generated:DISC.PPE", which is not a uuid — so Add paragraph failed
   * on exactly the notes the engine prepares. `saveNoteContent` creates the note
   * row first where it has to.
   */
  const addParagraph = useMutation({
    mutationFn: () =>
      saveNoteContent({
        companyId: ctx.companyId,
        workspaceId: ctx.workspaceId,
        frameworkPackId: ctx.model.frameworkPackId,
        note,
        kind: 'paragraph',
        // A code of its own, so it is added rather than overwriting another.
        id: `${note.id}:P-new-${Date.now()}`,
        code: `P${Date.now()}`,
        body: '',
        sortOrder: nextPlacement(
          paragraphs.map((p) => paragraphKey(note, p)),
          paragraphs.map((p) => p.sort_order),
          overrides,
        ),
      }),
    onSuccess: (res) => {
      showSuccess('Paragraph added');
      if (res.disclosureInstanceId) ctx.onNoteStored?.(res.disclosureInstanceId);
      ctx.onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });

  const addTable = useMutation({
    mutationFn: () => {
      const starter = starterTable();
      return saveNoteContent({
        companyId: ctx.companyId,
        workspaceId: ctx.workspaceId,
        frameworkPackId: ctx.model.frameworkPackId,
        note,
        kind: 'table',
        id: `${note.id}:T-new-${Date.now()}`,
        code: `T${Date.now()}`,
        title: 'New table',
        columns_json: starter.columns,
        rows_json: starter.rows,
        sortOrder: nextPlacement(
          tables.map((t) => tableKey(note, t)),
          tables.map((t) => t.sort_order),
          overrides,
        ),
      });
    },
    onSuccess: (res) => {
      showSuccess('Table added');
      if (res.disclosureInstanceId) ctx.onNoteStored?.(res.disclosureInstanceId);
      ctx.onSaved();
    },
    onError: (e: Error) => showError(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" data-testid="afs-note-heading">
          {ctx.register?.byId.get(note.id) ? (
            <span className="mr-1.5 text-muted-foreground">
              Note {ctx.register.byId.get(note.id)!.noteNumber}.
            </span>
          ) : null}
          {resolvedTitle(ctx.overridesApi.overrides, note.id, note.title)}
        </CardTitle>
        <CardDescription>
          Edit the note wording, headings and tables. Note numbers, and the references to them on
          the statements, update automatically when notes are added, hidden or moved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NoteDisagreements note={note} ctx={ctx} />
        <NoteReferencedFrom note={note} ctx={ctx} />
        <NoteStatusControl note={note} ctx={ctx} />
        <TitleOverrideField
          nodeId={note.id}
          currentTitle={note.title}
          overridesApi={ctx.overridesApi}
          label="Note title"
          locked={ctx.locked}
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
          {paragraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paragraphs yet.</p>
          ) : (
            paragraphs.map((paragraph) => (
              <ParagraphEditor
                key={paragraph.id}
                ctx={ctx}
                note={note}
                paragraph={paragraph}
                siblings={paragraphs}
              />
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            data-testid="afs-add-paragraph"
            onClick={() => addParagraph.mutate()}
            disabled={addParagraph.isPending || ctx.locked}
          >
            <Plus className="mr-2 h-4 w-4" />
            {addParagraph.isPending ? 'Adding…' : 'Add paragraph'}
          </Button>
        </div>

        <div className="space-y-4">
          {tables.map((table) =>
            // A table the disclosure engine built is edited as a spreadsheet;
            // anything older keeps the plain editor until it is regenerated.
            asGeneratedTable(table) ? (
              <DisclosureTableEditor
                key={table.id}
                ctx={ctx}
                note={note}
                table={table}
                siblings={tables}
              />
            ) : (
              <TableEditor key={table.id} ctx={ctx} note={note} table={table} siblings={tables} />
            ),
          )}
          <Button
            variant="outline"
            size="sm"
            data-testid="afs-add-table"
            onClick={() => addTable.mutate()}
            disabled={addTable.isPending || ctx.locked}
          >
            <Plus className="mr-2 h-4 w-4" />
            {addTable.isPending ? 'Adding…' : 'Add table'}
          </Button>
        </div>

        <NoteLineItems
          items={ctx.view?.notes.find((n) => n.id === note.id)?.lineItems ?? []}
          overridesApi={ctx.overridesApi}
          locked={ctx.locked}
        />
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
  register = null,
  view = null,
  onSelect = () => {},
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
  register?: NoteRegister | null;
  view?: CanonicalDocumentView | null;
  onSelect?: (selection: DocSelection) => void;
}) {
  const ctx: EditorContext = {
    companyId,
    workspaceId,
    model,
    overridesApi,
    locked,
    onSaved,
    onNoteStored,
    register,
    view,
    onSelect,
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
  if (kind === 'front')
    return <FrontSectionEditor key={selection.id} sectionId={selection.id} ctx={ctx} />;
  if (kind === 'signature')
    return (
      <div className="space-y-4">
        <SignatureEditor model={model} selectionId={selection.id} />
        {/* The wording above the signatures is part of the document too. */}
        <FrontSectionEditor sectionId="front:approval" ctx={ctx} />
      </div>
    );

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
