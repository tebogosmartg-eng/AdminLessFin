/**
 * Central Import Engine — shared types.
 *
 * Everything in this folder is pure TypeScript with no Deno or network
 * dependencies, so the exact code that runs in the edge function is also
 * unit-tested with vitest (same discipline as _shared/compliance).
 */

export type ImportEntityType =
  | 'chart_of_accounts'
  | 'customers'
  | 'vendors'
  | 'products'
  | 'invoices'
  | 'bills'
  | 'customer_payments'
  | 'supplier_payments'
  | 'bank_transactions'
  | 'journal_entries'
  | 'opening_balances';

export const IMPORT_ENTITY_TYPES: ImportEntityType[] = [
  'chart_of_accounts',
  'customers',
  'vendors',
  'products',
  'invoices',
  'bills',
  'customer_payments',
  'supplier_payments',
  'bank_transactions',
  'journal_entries',
  'opening_balances',
];

export type FieldType = 'text' | 'date' | 'number' | 'integer';

export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  type: FieldType;
  /** Lower-cased, punctuation-free header names that auto-map to this field. */
  aliases: string[];
  help?: string;
  /** For enumerated text fields: input value (lower-cased) → canonical value. */
  valueAliases?: Record<string, string>;
}

export interface EntitySpec {
  entity: ImportEntityType;
  label: string;
  description: string;
  kind: 'master' | 'transaction';
  fields: FieldSpec[];
  /**
   * Multi-row documents group by this field (invoice number, journal
   * reference). Absent for one-row-per-record entities.
   */
  groupBy?: string;
  /** Two rows of realistic example values, used to build the template file. */
  templateRows: Array<Record<string, string>>;
  /** Options this entity understands beyond the common ones. */
  optionKeys: string[];
}

/** Raw cell value as parsed from CSV/XLSX on the client. */
export type RawCell = string | number | boolean | null;
export type RawRow = Record<string, RawCell>;

export type IssueSeverity = 'error' | 'warning';

export interface RowIssue {
  severity: IssueSeverity;
  field?: string;
  code: string;
  message: string;
}

export type ValidationStatus = 'pending' | 'valid' | 'warning' | 'error';
export type PlannedAction = 'create' | 'update' | 'skip';
export type RowOutcome = 'pending' | 'imported' | 'updated' | 'skipped' | 'failed';

export interface StagedRow {
  id: string;
  row_number: number;
  raw: RawRow;
  normalized: Record<string, unknown> | null;
  group_key: string | null;
  validation_status: ValidationStatus;
  issues: RowIssue[];
  planned_action: PlannedAction | null;
  outcome: RowOutcome;
  outcome_detail: Record<string, unknown> | null;
}

export interface ImportOptions {
  /** 'auto' resolves from the file; explicit values override detection. */
  date_format?: 'auto' | 'ymd' | 'dmy' | 'mdy';
  number_format?: 'auto' | 'point' | 'comma';
  /** Master data: what to do when the record already exists. */
  on_duplicate?: 'skip' | 'update';
  /** Transactions: create customers/suppliers named in the file but not found. */
  auto_create_parties?: boolean;
  /** Commit even when some rows have errors; those rows become 'skipped'. */
  skip_invalid?: boolean;
  /** Bank imports */
  bank_account_id?: string;
  opening_balance?: number | null;
  closing_balance?: number | null;
  /** Opening balances */
  as_at_date?: string;
  balancing_account_id?: string | null;
  /** Customer payments without an invoice number: allocate to oldest first. */
  allocate_to_oldest?: boolean;
  [key: string]: unknown;
}

/** Reference data loaded once per validation/commit pass. */
export interface AccountRef {
  id: string;
  name: string;
  account_code: string | null;
  account_number: number | null;
  type: string;
  category: string | null;
  account_role: string | null;
  is_active: boolean;
  posting_blocked: boolean;
  control_account: boolean;
  allow_manual_posting: boolean;
}

export interface PartyRef {
  id: string;
  name: string;
  email: string | null;
  payment_terms: number | null;
}

export interface ProductRef {
  id: string;
  name: string;
  sku: string | null;
  type: string;
  price: number | null;
  cost: number | null;
  income_account_id: string | null;
  cogs_account_id: string | null;
  inventory_asset_account_id: string | null;
  tax_rate_id: string | null;
}

export interface TaxRateRef {
  id: string;
  name: string;
  rate: number;
}

export interface BankAccountRef {
  id: string;
  account_name: string;
  chart_of_account_id: string | null;
  opening_balance_posted: boolean | null;
}

export interface InvoiceRef {
  id: string;
  invoice_number: string;
  customer_id: string;
  total_amount: number | null;
  status: string | null;
}

export interface BillRef {
  id: string;
  bill_number: string | null;
  vendor_id: string;
  status: string | null;
}

export interface ReferenceData {
  accounts: AccountRef[];
  customers: PartyRef[];
  vendors: PartyRef[];
  products: ProductRef[];
  taxRates: TaxRateRef[];
  bankAccounts: BankAccountRef[];
  projects: Array<{ id: string; name: string }>;
  invoices: InvoiceRef[];
  bills: BillRef[];
  existingJournals: Array<{ entry_date: string; description: string | null; total: number }>;
}

export interface RunTotals {
  rows: number;
  valid: number;
  warnings: number;
  errors: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

export const EMPTY_TOTALS: RunTotals = {
  rows: 0,
  valid: 0,
  warnings: 0,
  errors: 0,
  imported: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

export class ImportEngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ImportEngineError';
  }
}

/** Deterministic idempotency keys: one namespace for the whole engine. */
export function importIdempotencyKey(runId: string, scope: string): string {
  return `import:${runId}:${scope}`;
}
