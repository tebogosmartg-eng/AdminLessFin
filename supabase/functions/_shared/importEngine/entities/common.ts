/**
 * Shared pieces of the entity handlers: the handler contract, issue helpers,
 * generic field normalization from the spec, and grouping.
 */

import { canonicalValue } from '../spec.ts';
import {
  applyMapping,
  isBlankRecord,
  matchKey,
  normDate,
  normInteger,
  normNumber,
  normText,
  type DateFormat,
  type NumberFormat,
} from '../normalize.ts';
import type {
  EntitySpec,
  ImportOptions,
  PlannedAction,
  RawCell,
  RawRow,
  RowIssue,
} from '../types.ts';
import type { Resolver } from '../resolve.ts';

export interface WorkRow {
  id: string;
  row_number: number;
  raw: RawRow;
  record: Record<string, RawCell>;
  normalized: Record<string, unknown>;
  issues: RowIssue[];
  group_key: string | null;
  planned_action: PlannedAction | null;
  /** True when every mapped cell is empty — the row is dropped, not an error. */
  blank: boolean;
}

export interface ValidateContext {
  spec: EntitySpec;
  resolver: Resolver;
  options: ImportOptions;
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  /** Posting dates the server found to be in a locked/closed period. */
  closedDates: Set<string>;
  /** Bank statement references that already exist for the chosen bank account. */
  existingBankRefs: Set<string>;
  /** Issues that apply to the whole run (missing role mappings, bad options). */
  runIssues: RowIssue[];
  /** Opening balances: each account's debit-minus-credit here as at the take-on date. */
  ledgerNet?: Map<string, number>;
}

export const err = (code: string, message: string, field?: string): RowIssue =>
  ({ severity: 'error', code, message, field });
export const warn = (code: string, message: string, field?: string): RowIssue =>
  ({ severity: 'warning', code, message, field });

export function addRunIssue(ctx: ValidateContext, issue: RowIssue): void {
  if (!ctx.runIssues.some(i => i.code === issue.code && i.message === issue.message)) {
    ctx.runIssues.push(issue);
  }
}

/**
 * Build WorkRows: apply the column mapping and normalize every field by its
 * declared type. Produces per-field issues for unparseable values and missing
 * required fields; entity validators then add the business rules.
 */
export function prepareRows(
  rows: Array<{ id: string; row_number: number; raw: RawRow }>,
  ctx: ValidateContext,
  mapping: Record<string, string>,
): WorkRow[] {
  const out: WorkRow[] = [];
  for (const row of rows) {
    const record = applyMapping(row.raw, mapping);
    const blank = isBlankRecord(record);
    const work: WorkRow = {
      id: row.id,
      row_number: row.row_number,
      raw: row.raw,
      record,
      normalized: {},
      issues: [],
      group_key: null,
      planned_action: null,
      blank,
    };
    if (!blank) {
      for (const field of ctx.spec.fields) {
        const cell = record[field.key];
        const text = normText(cell ?? null);
        if (text == null) {
          if (field.required) {
            work.issues.push(err('required', `${field.label} is required.`, field.key));
          }
          continue;
        }
        switch (field.type) {
          case 'date': {
            const iso = normDate(text, ctx.dateFormat);
            if (iso == null) {
              work.issues.push(err('bad_date', `"${text}" is not a recognisable date.`, field.key));
            } else {
              work.normalized[field.key] = iso;
            }
            break;
          }
          case 'number': {
            const n = normNumber(cell ?? text, ctx.numberFormat);
            if (n == null) {
              work.issues.push(err('bad_number', `"${text}" is not a number.`, field.key));
            } else {
              work.normalized[field.key] = n;
            }
            break;
          }
          case 'integer': {
            const n = normInteger(cell ?? text, ctx.numberFormat);
            if (n == null) {
              work.issues.push(err('bad_integer', `"${text}" must be a whole number.`, field.key));
            } else {
              work.normalized[field.key] = n;
            }
            break;
          }
          default: {
            if (field.valueAliases) {
              const canonical = canonicalValue(field, text);
              if (canonical == null) {
                const allowed = [...new Set(Object.values(field.valueAliases))].join(', ');
                work.issues.push(err('bad_value', `"${text}" is not a valid ${field.label}. Use one of: ${allowed}.`, field.key));
              } else {
                work.normalized[field.key] = canonical;
              }
            } else {
              work.normalized[field.key] = text;
            }
          }
        }
      }
    }
    out.push(work);
  }
  return out;
}

export function str(work: WorkRow, key: string): string | null {
  const v = work.normalized[key];
  return typeof v === 'string' ? v : null;
}

export function amt(work: WorkRow, key: string): number | null {
  const v = work.normalized[key];
  return typeof v === 'number' ? v : null;
}

/** Group rows by a normalized key; insertion order preserved. */
export function groupRows(rows: WorkRow[], keyOf: (row: WorkRow) => string | null): Map<string, WorkRow[]> {
  const groups = new Map<string, WorkRow[]>();
  for (const row of rows) {
    if (row.blank) continue;
    const key = keyOf(row);
    if (key == null) continue;
    row.group_key = key;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

export function groupKeyOf(value: string): string {
  return matchKey(value) || value.trim().toLowerCase();
}

export function hasErrors(row: WorkRow): boolean {
  return row.issues.some(i => i.severity === 'error');
}

export function issueAll(rows: WorkRow[], issue: RowIssue): void {
  for (const row of rows) row.issues.push(issue);
}

/** Simple deterministic 32-bit FNV-1a hash, hex-encoded (bank line fallback refs). */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Check a posting date against the pre-computed locked-period set. */
export function checkPeriodOpen(ctx: ValidateContext, work: WorkRow, dateKey: string): void {
  const iso = str(work, dateKey);
  if (iso && ctx.closedDates.has(iso)) {
    work.issues.push(err(
      'period_locked',
      `${iso} falls in a closed or locked accounting period.`,
      dateKey,
    ));
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkEmail(work: WorkRow): void {
  const email = str(work, 'email');
  if (email && !EMAIL_RE.test(email)) {
    work.issues.push(err('bad_email', `"${email}" is not a valid email address.`, 'email'));
  }
}
