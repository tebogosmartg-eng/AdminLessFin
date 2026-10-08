/**
 * The narrow database port the commit handlers use. The edge function
 * implements it with the service-role client; unit tests implement it with
 * in-memory fakes. Handlers never see a Supabase client directly, and every
 * ledger write goes through an RPC — there are no direct journal writes here.
 */

import type { Resolver } from '../resolve.ts';
import type { ImportOptions, PlannedAction, RowOutcome, ValidationStatus } from '../types.ts';

export interface ImportDb {
  insert(table: string, values: Record<string, unknown>): Promise<{ id: string }>;
  update(table: string, id: string, values: Record<string, unknown>): Promise<void>;
  rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
}

export interface CommitContext {
  db: ImportDb;
  companyId: string;
  runId: string;
  actorUserId: string;
  resolver: Resolver;
  options: ImportOptions;
  /** Parties auto-created earlier in this commit pass: matchKey(name) → id. */
  createdParties: Map<string, string>;
  /** Opening balances: the ledger as it is at commit time, as at the take-on date. */
  ledgerNet?: Map<string, number>;
}

export interface CommitRowInput {
  id: string;
  row_number: number;
  normalized: Record<string, unknown>;
  group_key: string | null;
  planned_action: PlannedAction | null;
  validation_status: ValidationStatus;
}

export interface UnitOutcome {
  outcome: RowOutcome;
  detail?: Record<string, unknown>;
}

/**
 * One atomic piece of work: a single record, or one document group that a
 * single RPC call posts. If execute throws, every row in the unit is marked
 * failed with the error and the commit moves on to the next unit.
 */
export interface CommitUnit {
  rows: CommitRowInput[];
  execute(ctx: CommitContext): Promise<Map<string, UnitOutcome>>;
}

export function uniformOutcome(
  rows: CommitRowInput[],
  outcome: UnitOutcome,
): Map<string, UnitOutcome> {
  return new Map(rows.map(r => [r.id, outcome]));
}

export function nstr(row: CommitRowInput, key: string): string | null {
  const v = row.normalized[key];
  return typeof v === 'string' ? v : null;
}

export function nnum(row: CommitRowInput, key: string): number | null {
  const v = row.normalized[key];
  return typeof v === 'number' ? v : null;
}

export { type Resolver, type ImportOptions };
