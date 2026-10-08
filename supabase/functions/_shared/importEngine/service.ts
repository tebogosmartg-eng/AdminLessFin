/**
 * Run orchestration, kept pure: the edge function supplies rows, reference
 * data and the locked-period set; this module turns them into validated
 * rows, totals and commit units. All database I/O stays in the edge layer.
 */

import { ENTITY_HANDLERS } from './entities/index.ts';
import { type ValidateContext, type WorkRow, prepareRows } from './entities/common.ts';
import type { CommitRowInput, CommitUnit } from './entities/db.ts';
import { Resolver } from './resolve.ts';
import { entitySpec } from './spec.ts';
import {
  detectDateFormat,
  normDate,
  type DateFormat,
  type NumberFormat,
} from './normalize.ts';
import type {
  ImportEntityType,
  ImportOptions,
  RawRow,
  ReferenceData,
  RowIssue,
  RunTotals,
  ValidationStatus,
} from './types.ts';
import { EMPTY_TOTALS } from './types.ts';

export interface InputRow {
  id: string;
  row_number: number;
  raw: RawRow;
}

/** The subset of fields a validation pass writes back per row. */
export interface ValidatedRowUpdate {
  id: string;
  normalized: Record<string, unknown>;
  group_key: string | null;
  validation_status: ValidationStatus;
  issues: RowIssue[];
  planned_action: string | null;
}

export interface ValidationResult {
  rows: ValidatedRowUpdate[];
  runIssues: RowIssue[];
  totals: RunTotals;
  dateFormat: DateFormat;
}

function effectiveFormats(
  entity: ImportEntityType,
  rows: InputRow[],
  mapping: Record<string, string>,
  options: ImportOptions,
): { dateFormat: DateFormat; numberFormat: NumberFormat; ambiguousDates: boolean } {
  const numberFormat: NumberFormat = options.number_format && options.number_format !== 'auto'
    ? options.number_format
    : 'auto';
  if (options.date_format && options.date_format !== 'auto') {
    return { dateFormat: options.date_format, numberFormat, ambiguousDates: false };
  }
  const spec = entitySpec(entity);
  const dateFields = spec.fields.filter(f => f.type === 'date').map(f => f.key);
  const values: Array<string | number | boolean | null> = [];
  for (const row of rows) {
    for (const field of dateFields) {
      const header = mapping[field];
      if (!header) continue;
      const cell = header in row.raw
        ? row.raw[header]
        : row.raw[Object.keys(row.raw).find(k => k.toLowerCase() === header.toLowerCase()) ?? ''];
      if (cell != null) values.push(cell);
    }
  }
  const detected = detectDateFormat(values);
  if (detected) return { dateFormat: detected, numberFormat, ambiguousDates: false };
  // No decisive evidence. 'auto' still parses ISO and unambiguous forms; any
  // ambiguous two-digit pair becomes a row error, and we surface a run issue.
  const ambiguous = values.some(v => {
    const s = v == null ? '' : String(v);
    return /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.test(s.trim()) && normDate(s, 'auto') == null;
  });
  return { dateFormat: 'auto', numberFormat, ambiguousDates: ambiguous };
}

/**
 * The posting dates a run will touch — the edge layer asks the database
 * which of them fall in locked periods before full validation runs.
 */
export function collectPostingDates(
  entity: ImportEntityType,
  rows: InputRow[],
  mapping: Record<string, string>,
  options: ImportOptions,
): string[] {
  const spec = entitySpec(entity);
  const { dateFormat } = effectiveFormats(entity, rows, mapping, options);
  const dates = new Set<string>();
  const dateFields = spec.fields.filter(f => f.type === 'date').map(f => f.key);
  if (dateFields.length) {
    const ctxLite: ValidateContext = {
      spec,
      resolver: new Resolver(EMPTY_REFS),
      options,
      dateFormat,
      numberFormat: 'auto',
      closedDates: new Set(),
      existingBankRefs: new Set(),
      runIssues: [],
    };
    for (const work of prepareRows(rows, ctxLite, mapping)) {
      for (const field of dateFields) {
        const v = work.normalized[field];
        if (typeof v === 'string') dates.add(v);
      }
    }
  }
  if (entity === 'opening_balances' && typeof options.as_at_date === 'string') {
    dates.add(options.as_at_date);
  }
  // Bank statement lines do not post to the ledger; period locks do not apply.
  if (entity === 'bank_transactions') return [];
  return [...dates].sort();
}

const GROUPED_ENTITIES: ImportEntityType[] = ['invoices', 'bills', 'journal_entries'];

/**
 * A document is imported whole or not at all: one bad line keeps every line
 * of that invoice, bill or journal out, so "skip invalid rows" can never
 * post a smaller document than the file describes. An opening trial balance
 * is one document too — it is never posted with rows missing.
 */
function enforceWholeDocuments(entity: ImportEntityType, rows: WorkRow[], ctx: ValidateContext): void {
  const hasError = (r: WorkRow) => r.issues.some(i => i.severity === 'error');
  if (entity === 'opening_balances') {
    const bad = rows.filter(r => !r.blank && hasError(r)).length;
    if (bad > 0) {
      ctx.runIssues.push({
        severity: 'error',
        code: 'trial_balance_incomplete',
        message: 'Opening balances are posted as one complete trial balance, so every row marked below must be fixed before any of it can be imported.',
      });
    }
    return;
  }
  if (!GROUPED_ENTITIES.includes(entity)) return;
  const badGroups = new Set(rows.filter(r => r.group_key && hasError(r)).map(r => r.group_key));
  for (const row of rows) {
    if (row.group_key && badGroups.has(row.group_key) && !hasError(row)) {
      row.issues.push({
        severity: 'error',
        code: 'document_has_errors',
        message: 'Another line of this document has an error, so the whole document is held back.',
      });
    }
  }
}

export const EMPTY_REFS: ReferenceData = {
  accounts: [],
  customers: [],
  vendors: [],
  products: [],
  taxRates: [],
  bankAccounts: [],
  projects: [],
  invoices: [],
  bills: [],
  existingJournals: [],
};

export function validateAllRows(input: {
  entity: ImportEntityType;
  rows: InputRow[];
  mapping: Record<string, string>;
  options: ImportOptions;
  refs: ReferenceData;
  closedDates: Set<string>;
  existingBankRefs: Set<string>;
  ledgerNet?: Map<string, number>;
}): ValidationResult {
  const spec = entitySpec(input.entity);
  const { dateFormat, numberFormat, ambiguousDates } = effectiveFormats(
    input.entity, input.rows, input.mapping, input.options,
  );
  const ctx: ValidateContext = {
    spec,
    resolver: new Resolver(input.refs),
    options: input.options,
    dateFormat,
    numberFormat,
    closedDates: input.closedDates,
    existingBankRefs: input.existingBankRefs,
    runIssues: [],
    ledgerNet: input.ledgerNet,
  };
  if (ambiguousDates) {
    ctx.runIssues.push({
      severity: 'error',
      code: 'date_format_ambiguous',
      message: 'Dates like 03/04/2026 could be day-first or month-first and this file never settles it. Choose the date format for this file and validate again.',
    });
  }

  const workRows = prepareRows(input.rows, ctx, input.mapping);
  ENTITY_HANDLERS[input.entity].validate(workRows, ctx);
  enforceWholeDocuments(input.entity, workRows, ctx);

  const totals: RunTotals = { ...EMPTY_TOTALS, rows: 0 };
  const updates: ValidatedRowUpdate[] = [];
  for (const work of workRows) {
    if (work.blank) {
      updates.push({
        id: work.id,
        normalized: {},
        group_key: null,
        validation_status: 'valid',
        issues: [],
        planned_action: 'skip',
      });
      continue;
    }
    totals.rows += 1;
    // A run-level error (bad options, missing control mapping, ambiguous
    // dates) blocks the commit as a whole; rows keep their own verdicts.
    const status: ValidationStatus = work.issues.some(i => i.severity === 'error')
      ? 'error'
      : work.issues.some(i => i.severity === 'warning')
        ? 'warning'
        : 'valid';
    if (status === 'error') totals.errors += 1;
    else if (status === 'warning') { totals.warnings += 1; totals.valid += 1; }
    else totals.valid += 1;
    updates.push({
      id: work.id,
      normalized: work.normalized,
      group_key: work.group_key,
      validation_status: status,
      issues: work.issues,
      planned_action: status === 'error' ? null : work.planned_action,
    });
  }
  return { rows: updates, runIssues: ctx.runIssues, totals, dateFormat };
}

/** Build the ordered commit plan from persisted, validated rows. */
export function buildCommitUnits(
  entity: ImportEntityType,
  rows: CommitRowInput[],
  skipInvalid: boolean,
): { units: CommitUnit[]; refused: CommitRowInput[] } {
  const committable: CommitRowInput[] = [];
  const refused: CommitRowInput[] = [];
  for (const row of rows) {
    if (row.validation_status === 'error') {
      refused.push(row);
      continue;
    }
    committable.push(row);
  }
  if (refused.length > 0 && !skipInvalid) {
    // The caller enforces this before starting; refusing here is the backstop.
    throw new Error('The run still has rows with errors. Fix them or choose to skip invalid rows.');
  }
  const units = ENTITY_HANDLERS[entity].planCommit(committable);
  return { units, refused };
}

export { ENTITY_HANDLERS };
export type { CommitRowInput, CommitUnit, WorkRow };

export interface EnginePreview {
  groupKey: string;
  rowIds: string[];
  /** account_id → the staged rows posting to it, to pin engine messages to rows. */
  rowsByAccountName: Map<string, string[]>;
  request: Record<string, unknown>;
}

/**
 * The posting-engine requests a journal or opening-balance import will make,
 * built from validated rows so VALIDATE can ask the engine itself (preview
 * mode, which writes nothing) for its verdict — including every accounting
 * policy the company has configured — before anything is committed.
 */
export function buildEnginePreviews(input: {
  entity: ImportEntityType;
  rows: ValidatedRowUpdate[];
  refs: ReferenceData;
  companyId: string;
  actorUserId: string;
  options: ImportOptions;
}): EnginePreview[] {
  if (input.entity !== 'journal_entries' && input.entity !== 'opening_balances') return [];
  const names = new Map(input.refs.accounts.map(a => [a.id, a.name]));
  const groups = new Map<string, ValidatedRowUpdate[]>();
  for (const row of input.rows) {
    if (row.validation_status === 'error' || row.planned_action !== 'create') continue;
    const key = input.entity === 'opening_balances' ? 'opening' : row.group_key;
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const previews: EnginePreview[] = [];
  for (const [groupKey, list] of groups) {
    const rowsByAccountName = new Map<string, string[]>();
    for (const row of list) {
      const name = names.get(String(row.normalized.account_id));
      if (!name) continue;
      rowsByAccountName.set(name, [...(rowsByAccountName.get(name) ?? []), row.id]);
    }
    const first = list[0].normalized;
    const isOpening = input.entity === 'opening_balances';
    previews.push({
      groupKey,
      rowIds: list.map(r => r.id),
      rowsByAccountName,
      request: {
        company_id: input.companyId,
        posting_date: isOpening ? input.options.as_at_date : first.entry_date,
        module: 'manual_journal',
        document_type: isOpening ? 'opening_balance' : 'manual_journal',
        description: isOpening ? `Opening balances as at ${String(input.options.as_at_date)}` : first.description,
        created_by: input.actorUserId,
        lines: list
          .map(r => ({
            account_id: r.normalized.account_id,
            debit: (isOpening ? r.normalized.post_debit : r.normalized.debit) ?? 0,
            credit: (isOpening ? r.normalized.post_credit : r.normalized.credit) ?? 0,
            project_id: r.normalized.project_id ?? null,
          }))
          .filter(l => !isOpening || Number(l.debit) + Number(l.credit) > 0.005),
      },
    });
  }
  return previews;
}

/**
 * Turn the engine's blocking policy violations into row errors. A message
 * that names an account lands on that account's rows; anything else lands
 * on every row of the journal.
 */
export function applyEngineVerdict(
  preview: EnginePreview,
  violations: Array<{ message?: string }>,
  rows: ValidatedRowUpdate[],
): number {
  const byId = new Map(rows.map(r => [r.id, r]));
  let flagged = 0;
  for (const violation of violations) {
    const message = violation.message ?? 'The accounting engine refused this journal.';
    let targets: string[] = [];
    for (const [name, ids] of preview.rowsByAccountName) {
      if (message.includes(name)) targets.push(...ids);
    }
    if (targets.length === 0) targets = preview.rowIds;
    for (const id of targets) {
      const row = byId.get(id);
      if (!row) continue;
      row.issues.push({ severity: 'error', code: 'engine_policy', message: `The accounting engine will not accept this: ${message}` });
      if (row.validation_status !== 'error') {
        row.validation_status = 'error';
        row.planned_action = null;
        flagged += 1;
      }
    }
  }
  if (violations.length > 0) {
    // The journal is posted whole or not at all.
    for (const id of preview.rowIds) {
      const row = byId.get(id);
      if (!row || row.validation_status === 'error') continue;
      row.issues.push({
        severity: 'error',
        code: 'document_has_errors',
        message: 'Another line of this journal was refused, so the whole journal is held back.',
      });
      row.validation_status = 'error';
      row.planned_action = null;
      flagged += 1;
    }
  }
  return flagged;
}
