import { supabase } from '../integrations/supabase/client';
import {
  SESSION_EXPIRED_MESSAGE,
  authorizationHeaderFromSession,
  ensureSessionForInvoke,
} from '../lib/auth/ensureSessionForInvoke';
import { parsePlatformErrorEnvelope } from '../lib/platform/platformError';
import type { ParsedFile } from './parseFile';

/** Only the `data-import` edge function; the UI never writes import tables. */

export type EntityType =
  | 'chart_of_accounts' | 'customers' | 'vendors' | 'products'
  | 'invoices' | 'bills' | 'customer_payments' | 'supplier_payments'
  | 'bank_transactions' | 'journal_entries' | 'opening_balances';

export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'date' | 'number' | 'integer';
  aliases: string[];
  help?: string;
}

export interface EntitySpec {
  entity: EntityType;
  label: string;
  description: string;
  kind: 'master' | 'transaction';
  fields: FieldSpec[];
  groupBy?: string;
  templateRows: Array<Record<string, string>>;
  optionKeys: string[];
}

export interface Issue {
  severity: 'error' | 'warning';
  field?: string;
  code: string;
  message: string;
}

export interface RunTotals {
  rows?: number;
  valid?: number;
  warnings?: number;
  errors?: number;
  imported?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  run_issues?: Issue[];
}

export interface ImportRun {
  id: string;
  entity_type: EntityType;
  status: 'created' | 'validating' | 'validated' | 'committing' | 'committed' | 'failed' | 'cancelled';
  file_name: string | null;
  row_count: number;
  mapping: Record<string, string>;
  options: Record<string, unknown>;
  totals: RunTotals;
  last_error: string | null;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  committed_at: string | null;
}

export interface StagedRow {
  id: string;
  row_number: number;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown> | null;
  group_key: string | null;
  validation_status: 'pending' | 'valid' | 'warning' | 'error';
  issues: Issue[];
  planned_action: 'create' | 'update' | 'skip' | null;
  outcome: 'pending' | 'imported' | 'updated' | 'skipped' | 'failed';
  outcome_detail: Record<string, unknown> | null;
}

export interface OutcomeCounts {
  pending: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface ImportReferences {
  accounts: Array<{ id: string; name: string; account_code: string | null; account_number: number | null; type: string; account_role: string | null }>;
  bank_accounts: Array<{ id: string; name: string }>;
  tax_rates: Array<{ id: string; name: string; rate: number }>;
  roles_mapped: Record<string, boolean>;
}

async function readFunctionErrorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      return await context.clone().json();
    } catch {
      return null;
    }
  }
  return null;
}

function toReadableError(payload: unknown, fallback: string): Error {
  const err = parsePlatformErrorEnvelope(payload, 'data-import:client');
  if (
    err.envelope.category === 'AuthenticationError' ||
    /not authenticated|jwt|session/i.test(`${err.envelope.technicalMessage} ${fallback}`)
  ) {
    return new Error(SESSION_EXPIRED_MESSAGE);
  }
  const business = err.envelope.businessMessage;
  if (business && !/^bad request$/i.test(business) && !/non-2xx/i.test(business)) return new Error(business);
  return new Error(err.envelope.technicalMessage || fallback);
}

export async function invokeImport<T>(
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const session = await ensureSessionForInvoke();
  const { data, error } = await supabase.functions.invoke('data-import', {
    body: { ...payload, method, company_id: companyId },
    headers: authorizationHeaderFromSession(session),
  });
  if (error) {
    const body = await readFunctionErrorBody(error);
    throw toReadableError(body ?? error, error.message || 'Import request failed');
  }
  if (data?.error || data?.platformError) {
    throw toReadableError(data, typeof data.error === 'string' ? data.error : 'Import request failed');
  }
  return data as T;
}

const APPEND_BATCH = 500;

/**
 * Creates a run and stages every row. The original file is kept in the
 * private import bucket for the audit trail; a failed upload never blocks
 * the import itself.
 */
export async function stageImport(
  companyId: string,
  entity: EntityType,
  file: File,
  parsed: ParsedFile,
  mapping: Record<string, string>,
  options: Record<string, unknown>,
  onProgress?: (staged: number, total: number) => void,
): Promise<{ run: ImportRun; fileWarning: string | null }> {
  const created = await invokeImport<{ run: ImportRun; upload: { path: string; token: string } | null; file_warning: string | null }>(
    companyId,
    'CREATE_RUN',
    {
      entity_type: entity,
      file_name: parsed.fileName,
      file_hash: parsed.fileHash,
      file_size: parsed.fileSize,
      mapping,
      options,
    },
  );
  if (created.upload) {
    void supabase.storage
      .from('import-files')
      .uploadToSignedUrl(created.upload.path, created.upload.token, file, {
        contentType: file.type || 'application/octet-stream',
      })
      .catch(() => undefined);
  }
  const total = parsed.rows.length;
  for (let i = 0; i < total; i += APPEND_BATCH) {
    const rows = parsed.rows.slice(i, i + APPEND_BATCH).map((raw, j) => ({
      row_number: parsed.lines[i + j],
      raw,
    }));
    await invokeImport(companyId, 'APPEND_ROWS', { run_id: created.run.id, rows });
    onProgress?.(Math.min(i + APPEND_BATCH, total), total);
  }
  return { run: created.run, fileWarning: created.file_warning };
}

export interface CompareLine {
  row_number: number | null;
  label: string;
  account_id: string | null;
  account_name: string | null;
  old_net: number | null;
  new_net: number | null;
  difference: number | null;
  status: 'match' | 'differs' | 'not_found' | 'ambiguous' | 'only_here';
  note?: string;
}

export interface CompareResult {
  as_at_date: string;
  lines: CompareLine[];
  old_total_debit: number;
  old_total_credit: number;
  matched: number;
  differs: number;
  unmatched: number;
  only_here: number;
  all_match: boolean;
}
