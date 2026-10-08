/**
 * Central Import Engine: normalization, column matching, per-entity
 * validation and commit plans. The commit plans run against an in-memory
 * database port, which records every write so the tests can prove that
 * ledger postings only ever go through RPCs with deterministic keys.
 */
import { describe, expect, it } from 'vitest';
import {
  detectDateFormat,
  normDate,
  normNumber,
} from '../../supabase/functions/_shared/importEngine/normalize.ts';
import { ENTITY_SPECS } from '../../supabase/functions/_shared/importEngine/spec.ts';
import {
  applyEngineVerdict,
  buildCommitUnits,
  buildEnginePreviews,
  collectPostingDates,
  validateAllRows,
  type InputRow,
} from '../../supabase/functions/_shared/importEngine/service.ts';
import { Resolver } from '../../supabase/functions/_shared/importEngine/resolve.ts';
import type { CommitContext, ImportDb } from '../../supabase/functions/_shared/importEngine/entities/db.ts';
import type {
  ImportEntityType,
  ImportOptions,
  RawRow,
  ReferenceData,
} from '../../supabase/functions/_shared/importEngine/types.ts';
import { autoMapColumns, missingRequired } from '../../src/imports/autoMap';
import { compareTrialBalance, ledgerFromTypeSigned, TB_COMPARE_FIELDS } from '../../supabase/functions/_shared/importEngine/compare.ts';

// ── Fixtures ────────────────────────────────────────────────────────────────

const acct = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  account_code: null,
  account_number: null,
  type,
  category: null,
  account_role: null,
  is_active: true,
  posting_blocked: false,
  control_account: false,
  allow_manual_posting: true,
  ...extra,
});

function refs(over: Partial<ReferenceData> = {}): ReferenceData {
  return {
    accounts: [
      acct('a-ar', 'Trade Receivables', 'Asset', { account_role: 'trade_receivable', control_account: true, allow_manual_posting: false }),
      acct('a-ap', 'Trade Payables', 'Liability', { account_role: 'trade_payable', control_account: true, allow_manual_posting: false }),
      acct('a-vout', 'VAT Output', 'Liability', { account_role: 'output_vat' }),
      acct('a-vin', 'VAT Input', 'Asset', { account_role: 'input_vat' }),
      acct('a-sales', 'Sales Revenue', 'Income', { account_code: '4000' }),
      acct('a-rent', 'Office Rent', 'Expense', { account_code: '6200' }),
      acct('a-bank', 'Business Cheque Account', 'Asset', { account_code: '1000' }),
      acct('a-equip', 'Equipment', 'Asset'),
      acct('a-re', 'Retained Earnings', 'Equity', { account_role: 'retained_earnings' }),
      acct('a-dep', 'Depreciation Expense', 'Expense'),
      acct('a-accdep', 'Accumulated Depreciation', 'Asset'),
    ],
    customers: [{ id: 'c-1', name: 'Mokoena Trading', email: 'lerato@mokoena.co.za', payment_terms: 30 }],
    vendors: [{ id: 'v-1', name: 'Khumalo Stationers', email: null, payment_terms: null }],
    products: [],
    taxRates: [{ id: 't-15', name: 'Standard Rate', rate: 15 }, { id: 't-0', name: 'Zero Rated', rate: 0 }],
    bankAccounts: [{ id: 'b-1', account_name: 'Business Cheque', chart_of_account_id: 'a-bank', opening_balance_posted: true }],
    projects: [],
    invoices: [],
    bills: [],
    existingJournals: [],
    ...over,
  };
}

function rows(raws: RawRow[]): InputRow[] {
  return raws.map((raw, i) => ({ id: `r${i + 1}`, row_number: i + 1, raw }));
}

function identityMapping(entity: ImportEntityType): Record<string, string> {
  return Object.fromEntries(ENTITY_SPECS[entity].fields.map(f => [f.key, f.key]));
}

function validate(
  entity: ImportEntityType,
  raws: RawRow[],
  options: ImportOptions = {},
  reference: ReferenceData = refs(),
  closedDates: Set<string> = new Set(),
) {
  return validateAllRows({
    entity,
    rows: rows(raws),
    mapping: identityMapping(entity),
    options,
    refs: reference,
    closedDates,
    existingBankRefs: new Set(),
  });
}

interface Recorded { kind: 'insert' | 'update' | 'rpc'; target: string; args: Record<string, unknown> }

function fakeDb(fail?: (call: Recorded) => string | null): { db: ImportDb; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let n = 0;
  const record = (call: Recorded) => {
    calls.push(call);
    const message = fail?.(call);
    if (message) throw new Error(message);
  };
  return {
    calls,
    db: {
      insert: async (table, values) => { record({ kind: 'insert', target: table, args: values }); return { id: `new-${++n}` }; },
      update: async (table, id, values) => { record({ kind: 'update', target: table, args: { id, ...values } }); },
      rpc: async <T,>(name: string, args: Record<string, unknown>) => {
        record({ kind: 'rpc', target: name, args });
        return { journal_id: `j-${++n}`, bill_id: `bill-${n}`, posting_status: 'committed' } as unknown as T;
      },
    },
  };
}

async function commit(
  entity: ImportEntityType,
  raws: RawRow[],
  options: ImportOptions = {},
  reference: ReferenceData = refs(),
  fail?: (call: Recorded) => string | null,
) {
  const result = validate(entity, raws, options, reference);
  const commitRows = result.rows.map((r, i) => ({
    id: r.id,
    row_number: i + 1,
    normalized: r.normalized,
    group_key: r.group_key,
    planned_action: r.planned_action as 'create' | 'update' | 'skip' | null,
    validation_status: r.validation_status,
  }));
  const { units } = buildCommitUnits(entity, commitRows, true);
  const { db, calls } = fakeDb(fail);
  const ctx: CommitContext = {
    db,
    companyId: 'co-1',
    runId: 'run-1',
    actorUserId: 'u-1',
    resolver: new Resolver(reference),
    options,
    createdParties: new Map(),
  };
  const outcomes = new Map<string, { outcome: string; detail?: Record<string, unknown> }>();
  for (const unit of units) {
    try {
      for (const [id, o] of await unit.execute(ctx)) outcomes.set(id, o);
    } catch (e) {
      for (const r of unit.rows) outcomes.set(r.id, { outcome: 'failed', detail: { error: (e as Error).message } });
    }
  }
  return { result, calls, outcomes };
}

const codes = (issues: Array<{ code: string }>) => issues.map(i => i.code);

// ── Normalization ───────────────────────────────────────────────────────────

describe('normalize', () => {
  it('parses ISO, text-month and explicit day/month orders', () => {
    expect(normDate('2026-09-05', 'auto')).toBe('2026-09-05');
    expect(normDate('2026/9/5', 'auto')).toBe('2026-09-05');
    expect(normDate('5 Sep 2026', 'auto')).toBe('2026-09-05');
    expect(normDate('05-September-2026', 'auto')).toBe('2026-09-05');
    expect(normDate('03/04/2026', 'dmy')).toBe('2026-04-03');
    expect(normDate('03/04/2026', 'mdy')).toBe('2026-03-04');
  });

  it('refuses ambiguous and impossible dates instead of guessing', () => {
    expect(normDate('03/04/2026', 'auto')).toBeNull();
    expect(normDate('31/02/2026', 'dmy')).toBeNull();
    expect(normDate('2026-13-01', 'auto')).toBeNull();
    expect(normDate('yesterday', 'auto')).toBeNull();
    expect(normDate('25/12/2026', 'auto')).toBe('2026-12-25');
  });

  it('detects the file convention from decisive values only', () => {
    expect(detectDateFormat(['01/02/2026', '25/12/2026'])).toBe('dmy');
    expect(detectDateFormat(['12/25/2026', '01/02/2026'])).toBe('mdy');
    expect(detectDateFormat(['2026-01-02'])).toBe('ymd');
    expect(detectDateFormat(['01/02/2026', '03/04/2026'])).toBeNull();
  });

  it('parses money in the formats spreadsheets produce', () => {
    expect(normNumber('1,234.56')).toBe(1234.56);
    expect(normNumber('1 234,56')).toBe(1234.56);
    expect(normNumber('1.234,56')).toBe(1234.56);
    expect(normNumber('R 1 500.00')).toBe(1500);
    expect(normNumber('(250.00)')).toBe(-250);
    expect(normNumber('-75')).toBe(-75);
    expect(normNumber('12,5')).toBe(12.5);
    expect(normNumber('1,234')).toBe(1234);
    expect(normNumber('1,234,567')).toBe(1234567);
    expect(normNumber(42)).toBe(42);
    expect(normNumber('abc')).toBeNull();
    expect(normNumber('')).toBeNull();
  });
});

// ── Column matching ─────────────────────────────────────────────────────────

describe('autoMapColumns', () => {
  it('maps common QuickBooks/Xero/Sage headers and leaves the rest for the user', () => {
    const headers = ['*InvoiceNumber', 'ContactName', 'InvoiceDate', 'DueDate', 'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType', 'Random Notes'];
    const mapping = autoMapColumns(headers, ENTITY_SPECS.invoices.fields);
    expect(mapping.invoice_number).toBe('*InvoiceNumber');
    expect(mapping.invoice_date).toBe('InvoiceDate');
    expect(mapping.due_date).toBe('DueDate');
    expect(mapping.quantity).toBe('Quantity');
    expect(mapping.unit_price).toBe('UnitAmount');
    expect(mapping.customer).toBe('ContactName');
    expect(mapping.income_account).toBe('AccountCode');
    expect(mapping.tax_rate).toBe('TaxType');
    // Xero's Description is per line, never the invoice-level description.
    expect(mapping.line_description).toBe('Description');
    expect(mapping.document_description).toBeUndefined();
    expect(Object.values(mapping)).not.toContain('Random Notes');
  });

  it('never assigns one column to two fields', () => {
    const mapping = autoMapColumns(['Date', 'Amount', 'Description'], ENTITY_SPECS.bank_transactions.fields);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
    expect(mapping.line_date).toBe('Date');
    expect(mapping.amount).toBe('Amount');
  });

  it('reports required fields that are still unmapped', () => {
    const missing = missingRequired({ name: 'Name' }, ENTITY_SPECS.chart_of_accounts.fields);
    expect(missing.map(f => f.key)).toEqual(['category']);
  });
});

// ── Master data ─────────────────────────────────────────────────────────────

describe('customers and suppliers', () => {
  it('validates email, flags in-file duplicates and plans duplicates by option', () => {
    const r = validate('customers', [
      { name: 'New Client', email: 'not-an-email' },
      { name: 'mokoena trading', email: 'x@y.co.za' },
      { name: 'New Client' },
      {},
    ]);
    expect(codes(r.rows[0].issues)).toContain('bad_email');
    expect(r.rows[1].planned_action).toBe('skip');
    expect(codes(r.rows[1].issues)).toContain('duplicate_existing');
    expect(codes(r.rows[2].issues)).toContain('duplicate_in_file');
    expect(r.rows[3].planned_action).toBe('skip'); // blank row is dropped, not an error
    expect(r.totals.rows).toBe(3);
  });

  it('updates existing records when asked, inserts new ones, never cross-tenant', async () => {
    const { calls, outcomes } = await commit('customers', [
      { name: 'Mokoena Trading', phone: '011 000 0000' },
      { name: 'Brand New', payment_terms: '14' },
    ], { on_duplicate: 'update' });
    expect(calls).toEqual([
      { kind: 'update', target: 'customers', args: { id: 'c-1', name: 'Mokoena Trading', phone: '011 000 0000' } },
      { kind: 'insert', target: 'customers', args: { company_id: 'co-1', name: 'Brand New', payment_terms: 14 } },
    ]);
    expect(outcomes.get('r1')?.outcome).toBe('updated');
    expect(outcomes.get('r2')?.outcome).toBe('imported');
  });
});

describe('products', () => {
  it('requires stock accounts for inventory items and maps type aliases', () => {
    const r = validate('products', [
      { name: 'Widget', type: 'stock' },
      { name: 'Consulting', type: 'Service', income_account: '4000', tax_rate: '15%' },
      { name: 'Thing', type: 'gizmo' },
    ]);
    expect(codes(r.rows[0].issues)).toContain('stock_needs_accounts');
    expect(r.rows[1].validation_status).toBe('valid');
    expect(r.rows[1].normalized.income_account_id).toBe('a-sales');
    expect(r.rows[1].normalized.tax_rate_id).toBe('t-15');
    expect(codes(r.rows[2].issues)).toContain('bad_value');
  });

  it('writes only the legal item_class / cost_method vocabulary', async () => {
    const { calls } = await commit('products', [{ name: 'Consulting', type: 'service', price: '950' }]);
    expect(calls[0].args).toMatchObject({ type: 'service', item_class: 'service', cost_method: 'weighted_average', price: 950 });
  });
});

describe('chart of accounts', () => {
  it('enforces the authoritative IFRS classification', () => {
    const r = validate('chart_of_accounts', [
      { name: 'Motor Vehicles', type: 'Asset', category: 'Fixed Assets', subcategory: 'PPE' },
      { name: 'Bad One', type: 'Income', category: 'Operating Expenses' },
      { name: 'Bad Sub', type: 'Expense', category: 'Finance Costs', subcategory: 'Employee Costs' },
    ]);
    expect(r.rows[0].validation_status).toBe('valid');
    expect(r.rows[0].normalized).toMatchObject({ category: 'Non-Current Assets', subcategory: 'Property, Plant and Equipment' });
    expect(codes(r.rows[1].issues)).toContain('bad_classification');
    expect(codes(r.rows[2].issues)).toContain('bad_subcategory');
  });

  it('never changes a system-mapped account or an account type', () => {
    const r = validate('chart_of_accounts', [
      { name: 'Trade Receivables', type: 'Asset', category: 'Current Assets' },
      { name: 'Equipment', type: 'Expense', category: 'Operating Expenses' },
    ], { on_duplicate: 'update' });
    expect(r.rows[0].planned_action).toBe('skip');
    expect(codes(r.rows[0].issues)).toContain('system_account');
    expect(r.rows[1].planned_action).toBe('skip');
    expect(codes(r.rows[1].issues)).toContain('type_change_refused');
  });
});

// ── Invoices and bills ──────────────────────────────────────────────────────

describe('invoices', () => {
  const base = { invoice_number: 'INV-1', customer: 'Mokoena Trading', invoice_date: '2026-09-05' };

  it('groups lines into one invoice posted through post_sales_invoice_atomic', async () => {
    const { calls, outcomes } = await commit('invoices', [
      { ...base, line_description: 'Consulting', quantity: '10', unit_price: '950', income_account: 'Sales Revenue', tax_rate: '15', tax_amount: '1425' },
      { ...base, line_description: 'Travel', line_amount: '1200', income_account: '4000', tax_rate: 'Standard Rate' },
    ]);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toMatchObject({ kind: 'rpc', target: 'post_sales_invoice_atomic' });
    expect(call.args).toMatchObject({
      p_company_id: 'co-1',
      p_customer_id: 'c-1',
      p_invoice_number: 'INV-1',
      p_invoice_date: '2026-09-05',
      p_due_date: '2026-10-05', // customer terms 30 days
      p_ar_account_id: 'a-ar',
      p_tax_payable_account_id: 'a-vout',
      p_actor_user_id: 'u-1',
      p_idempotency_key: 'import:run-1:inv:inv1',
    });
    expect(call.args.p_items).toEqual([
      { quantity: 10, description: 'Consulting', tax_rate_id: 't-15', income_account_id: 'a-sales', unit_price: 950 },
      { quantity: 1, description: 'Travel', tax_rate_id: 't-15', income_account_id: 'a-sales', unit_price: 1200 },
    ]);
    expect(outcomes.get('r1')?.outcome).toBe('imported');
    expect(outcomes.get('r2')?.outcome).toBe('imported');
  });

  it('warns on a VAT amount that disagrees with the rate, errors on unknown rates', () => {
    const r = validate('invoices', [
      { ...base, unit_price: '100', income_account: 'Sales Revenue', tax_rate: '15', tax_amount: '20' },
      { ...base, invoice_number: 'INV-2', unit_price: '100', income_account: 'Sales Revenue', tax_rate: '14' },
    ]);
    expect(codes(r.rows[0].issues)).toContain('tax_mismatch');
    expect(r.rows[0].validation_status).toBe('warning');
    expect(codes(r.rows[1].issues)).toContain('tax_not_found');
  });

  it('refuses conflicting header values within one invoice and negative lines', () => {
    const r = validate('invoices', [
      { ...base, unit_price: '100', income_account: 'Sales Revenue' },
      { ...base, customer: 'Someone Else', unit_price: '-5', income_account: 'Sales Revenue' },
    ]);
    expect(codes(r.rows[1].issues)).toEqual(expect.arrayContaining(['inconsistent_group', 'negative_price']));
  });

  it('skips an invoice whose number already exists', () => {
    const r = validate('invoices', [{ ...base, unit_price: '100', income_account: 'Sales Revenue' }], {},
      refs({ invoices: [{ id: 'i-9', invoice_number: 'inv-1', customer_id: 'c-1', total_amount: 100, status: 'sent' }] }));
    expect(r.rows[0].planned_action).toBe('skip');
  });

  it('refuses unknown customers unless auto-create is on, then creates once per name', async () => {
    const strict = validate('invoices', [{ ...base, customer: 'Unknown Co', unit_price: '1', income_account: 'Sales Revenue' }]);
    expect(codes(strict.rows[0].issues)).toContain('party_not_found');

    const { calls } = await commit('invoices', [
      { ...base, invoice_number: 'A', customer: 'Unknown Co', unit_price: '1', income_account: 'Sales Revenue' },
      { ...base, invoice_number: 'B', customer: 'unknown co', unit_price: '2', income_account: 'Sales Revenue' },
    ], { auto_create_parties: true });
    const inserts = calls.filter(c => c.kind === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ target: 'customers', args: { company_id: 'co-1', name: 'Unknown Co' } });
    expect(calls.filter(c => c.target === 'post_sales_invoice_atomic')).toHaveLength(2);
  });

  it('refuses dates in locked periods', () => {
    const r = validate('invoices', [{ ...base, unit_price: '1', income_account: 'Sales Revenue' }], {}, refs(), new Set(['2026-09-05']));
    expect(codes(r.rows[0].issues)).toContain('period_locked');
  });

  it('blocks the whole run when the receivables control account is not mapped', () => {
    const reference = refs();
    reference.accounts = reference.accounts.filter(a => a.account_role !== 'trade_receivable');
    const r = validate('invoices', [{ ...base, unit_price: '1', income_account: 'Sales Revenue' }], {}, reference);
    expect(codes(r.runIssues)).toContain('missing_role_account');
  });
});

describe('bills', () => {
  it('posts through record_bill_with_taxes with input VAT', async () => {
    const { calls } = await commit('bills', [
      { bill_number: 'KS-1', vendor: 'Khumalo Stationers', bill_date: '2026-09-12', unit_cost: '2300', expense_account: 'Office Rent', tax_rate: '15' },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'rpc', target: 'record_bill_with_taxes' });
    expect(calls[0].args).toMatchObject({
      p_vendor_id: 'v-1',
      p_accounts_payable_id: 'a-ap',
      p_tax_receivable_account_id: 'a-vin',
      p_idempotency_key: 'import:run-1:bill:ks1',
      p_items: [{ quantity: 1, description: 'KS-1', tax_rate_id: 't-15', expense_account_id: 'a-rent', unit_cost: 2300 }],
    });
  });
});

// ── Payments ────────────────────────────────────────────────────────────────

describe('payments', () => {
  const invoices = [{ id: 'i-1', invoice_number: 'INV-1', customer_id: 'c-1', total_amount: 1000, status: 'sent' }];

  it('allocates a customer payment to the named invoice', async () => {
    const { calls } = await commit('customer_payments', [
      { payment_date: '2026-09-20', customer: 'Mokoena Trading', amount: '1000', deposit_account: '1000', invoice_number: 'INV-1' },
    ], {}, refs({ invoices }));
    expect(calls[0]).toMatchObject({ target: 'record_customer_receipt_atomic' });
    expect(calls[0].args).toMatchObject({
      p_customer_id: 'c-1',
      p_deposit_account_id: 'a-bank',
      p_amount: 1000,
      p_allocations: [{ invoice_id: 'i-1', amount: 1000 }],
      p_idempotency_key: 'import:run-1:row:1',
    });
  });

  it('holds a payment without an invoice on account, and uses the file default account', async () => {
    const { calls } = await commit('customer_payments', [
      { payment_date: '2026-09-20', customer: 'Mokoena Trading', amount: '500' },
    ], { default_deposit_account_id: 'a-bank' });
    expect(calls[0].args).toMatchObject({ p_allocations: [], p_deposit_account_id: 'a-bank' });
  });

  it('refuses a deposit into a non-asset account and an invoice of another customer', () => {
    const r = validate('customer_payments', [
      { payment_date: '2026-09-20', customer: 'Mokoena Trading', amount: '5', deposit_account: 'Sales Revenue' },
      { payment_date: '2026-09-20', customer: 'Mokoena Trading', amount: '5', deposit_account: '1000', invoice_number: 'INV-2' },
    ], {}, refs({
      invoices: [{ id: 'i-2', invoice_number: 'INV-2', customer_id: 'c-other', total_amount: 5, status: 'sent' }],
      customers: [...refs().customers],
    }));
    expect(codes(r.rows[0].issues)).toContain('account_wrong_type');
    expect(codes(r.rows[1].issues)).toContain('document_wrong_party');
  });

  it('pays a named bill through pay_specific_bill, else on account', async () => {
    const bills = [{ id: 'bl-1', bill_number: 'KS-1', vendor_id: 'v-1', status: 'open' }];
    const { calls } = await commit('supplier_payments', [
      { payment_date: '2026-09-15', vendor: 'Khumalo Stationers', amount: '100', payment_account: '1000', bill_number: 'KS-1' },
      { payment_date: '2026-09-15', vendor: 'Khumalo Stationers', amount: '50', payment_account: '1000' },
    ], {}, refs({ bills }));
    expect(calls.map(c => c.target)).toEqual(['pay_specific_bill', 'record_vendor_payment_on_account_atomic']);
    expect(calls[1].args.p_idempotency_key).toBe('import:run-1:row:2');
  });
});

// ── Bank ────────────────────────────────────────────────────────────────────

describe('bank transactions', () => {
  it('combines money in/out, fingerprints missing references stably, inserts once', async () => {
    const raws = [
      { line_date: '2026-09-02', description: 'Fee', money_out: '10' },
      { line_date: '2026-09-02', description: 'Fee', money_out: '10' },
      { line_date: '2026-09-03', description: 'Deposit', money_in: '500', external_reference: 'X1' },
    ];
    const { result, calls } = await commit('bank_transactions', raws, { bank_account_id: 'b-1' });
    const lines = calls[0].args.p_lines as Array<{ amount: number; external_reference: string }>;
    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe('create_bank_statement_import_atomic');
    expect(lines.map(l => l.amount)).toEqual([-10, -10, 500]);
    // identical lines in one file stay distinct...
    expect(lines[0].external_reference).not.toBe(lines[1].external_reference);
    expect(lines[2].external_reference).toBe('X1');
    // ...and the same file always produces the same references
    const again = validate('bank_transactions', raws, { bank_account_id: 'b-1' });
    expect(again.rows.map(r => r.normalized.external_reference)).toEqual(lines.map(l => l.external_reference));
    expect(codes(result.runIssues)).toContain('generated_references');
  });

  it('requires a bank account and refuses both amount styles at once', () => {
    const r = validate('bank_transactions', [{ line_date: '2026-09-02', description: 'X', amount: '5', money_in: '5' }]);
    expect(codes(r.runIssues)).toContain('bank_account_required');
    expect(codes(r.rows[0].issues)).toContain('amount_conflict');
  });

  it('does not ask for period checks (statement lines do not post)', () => {
    expect(collectPostingDates('bank_transactions', rows([{ line_date: '2026-09-02' }]), { line_date: 'line_date' }, {})).toEqual([]);
  });
});

// ── Journals and opening balances ───────────────────────────────────────────

describe('journal entries', () => {
  const jnl = { reference: 'J1', entry_date: '2026-09-30', description: 'Depreciation' };

  it('posts balanced journals through posting_engine_submit with one key per journal', async () => {
    const { calls } = await commit('journal_entries', [
      { ...jnl, account: 'Depreciation Expense', debit: '1250' },
      { ...jnl, account: 'Accumulated Depreciation', credit: '1250' },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'rpc', target: 'posting_engine_submit' });
    const request = calls[0].args.p_request as Record<string, unknown>;
    expect(calls[0].args.p_mode).toBe('commit');
    expect(request).toMatchObject({
      company_id: 'co-1',
      module: 'manual_journal',
      posting_date: '2026-09-30',
      idempotency_key: 'import:run-1:je:ref:j1',
      created_by: 'u-1',
    });
    expect(request.lines).toEqual([
      expect.objectContaining({ account_id: 'a-dep', debit: 1250, credit: 0 }),
      expect.objectContaining({ account_id: 'a-accdep', debit: 0, credit: 1250 }),
    ]);
  });

  it('refuses unbalanced journals, single lines, both-sided lines and control accounts', () => {
    const r = validate('journal_entries', [
      { ...jnl, account: 'Depreciation Expense', debit: '100' },
      { ...jnl, account: 'Accumulated Depreciation', credit: '90' },
      { reference: 'J2', entry_date: '2026-09-30', description: 'x', account: 'Equipment', debit: '1', credit: '1' },
      { reference: 'J3', entry_date: '2026-09-30', description: 'y', account: 'Trade Receivables', debit: '1' },
    ]);
    expect(codes(r.rows[0].issues)).toContain('unbalanced');
    expect(codes(r.rows[2].issues)).toEqual(expect.arrayContaining(['both_sides', 'single_line']));
    expect(codes(r.rows[3].issues)).toContain('control_account');
  });

  it('groups by date + description when there is no reference column', () => {
    const r = validate('journal_entries', [
      { entry_date: '2026-09-30', description: 'Accrual', account: 'Office Rent', debit: '10' },
      { entry_date: '2026-09-30', description: 'accrual', account: 'Equipment', credit: '10' },
    ]);
    expect(r.rows[0].group_key).toBe(r.rows[1].group_key);
    expect(r.totals.errors).toBe(0);
  });

  it('warns about a possible duplicate of an existing journal', () => {
    const r = validate('journal_entries', [
      { ...jnl, account: 'Depreciation Expense', debit: '1250' },
      { ...jnl, account: 'Accumulated Depreciation', credit: '1250' },
    ], {}, refs({ existingJournals: [{ entry_date: '2026-09-30', description: 'Depreciation', total: 1250 }] }));
    expect(codes(r.rows[0].issues)).toContain('possible_duplicate');
  });
});

describe('opening balances', () => {
  it('posts one balanced take-on journal and routes a difference to Opening Balance Equity', async () => {
    const { calls, result } = await commit('opening_balances', [
      { account: 'Equipment', debit: '85000' },
      { account: 'Retained Earnings', credit: '80000' },
    ], { as_at_date: '2026-02-28' });
    expect(codes(result.runIssues)).toContain('tb_difference');
    expect(calls.map(c => `${c.kind}:${c.target}`)).toEqual(['insert:chart_of_accounts', 'rpc:posting_engine_submit']);
    expect(calls[0].args).toMatchObject({ name: 'Opening Balance Equity', type: 'Equity', category: 'Equity' });
    const request = calls[1].args.p_request as { lines: Array<{ account_id: string; debit: number; credit: number }>; idempotency_key: string; posting_date: string };
    expect(request.posting_date).toBe('2026-02-28');
    expect(request.idempotency_key).toBe('import:run-1:opening');
    const dr = request.lines.reduce((s, l) => s + l.debit, 0);
    const cr = request.lines.reduce((s, l) => s + l.credit, 0);
    expect(dr).toBe(cr);
  });

  it('refuses debtors and bank balances the ledger does not already carry, duplicates, and requires the date', () => {
    const reference = refs();
    reference.accounts = reference.accounts.map(a =>
      a.account_role === 'trade_receivable' ? { ...a, allow_manual_posting: true } : a);
    const r = validate('opening_balances', [
      { account: 'Trade Receivables', debit: '10' },
      { account: 'Business Cheque Account', debit: '10' },
      { account: 'Equipment', debit: '5' },
      { account: 'Equipment', credit: '5' },
    ], {}, reference);
    expect(codes(r.runIssues)).toContain('as_at_required');
    expect(codes(r.rows[0].issues)).toContain('subledger_mismatch');
    expect(r.rows[0].issues[0].message).toContain('unpaid invoices imported here come to R 0,00');
    expect(codes(r.rows[1].issues)).toContain('bank_balance_mismatch');
    expect(codes(r.rows[3].issues)).toContain('duplicate_in_file');
  });
});

// ── Failure isolation and the no-direct-ledger-write guarantee ──────────────

describe('commit safety', () => {
  it('a failing document fails alone; the others still import', async () => {
    const { outcomes } = await commit('invoices', [
      { invoice_number: 'A', customer: 'Mokoena Trading', invoice_date: '2026-09-05', unit_price: '1', income_account: 'Sales Revenue' },
      { invoice_number: 'B', customer: 'Mokoena Trading', invoice_date: '2026-09-05', unit_price: '2', income_account: 'Sales Revenue' },
    ], {}, refs(), call => (call.args.p_invoice_number === 'A' ? 'Accounting policy violation' : null));
    expect(outcomes.get('r1')).toEqual({ outcome: 'failed', detail: { error: 'Accounting policy violation' } });
    expect(outcomes.get('r2')?.outcome).toBe('imported');
  });

  it('refuses to plan a commit with error rows unless skipping was chosen', () => {
    const errorRow = { id: 'x', row_number: 1, normalized: {}, group_key: null, planned_action: null, validation_status: 'error' as const };
    expect(() => buildCommitUnits('customers', [errorRow], false)).toThrow(/errors/);
    expect(buildCommitUnits('customers', [errorRow], true).refused).toHaveLength(1);
  });

  it('no handler ever writes journal tables directly', async () => {
    const all: Recorded[] = [];
    for (const [entity, raws, options] of [
      ['journal_entries', [{ reference: 'J', entry_date: '2026-09-30', description: 'd', account: 'Office Rent', debit: '1' }, { reference: 'J', entry_date: '2026-09-30', description: 'd', account: 'Equipment', credit: '1' }], {}],
      ['opening_balances', [{ account: 'Equipment', debit: '1' }, { account: 'Retained Earnings', credit: '1' }], { as_at_date: '2026-01-31' }],
      ['invoices', [{ invoice_number: 'Z', customer: 'Mokoena Trading', invoice_date: '2026-09-05', unit_price: '1', income_account: 'Sales Revenue' }], {}],
    ] as Array<[ImportEntityType, RawRow[], ImportOptions]>) {
      all.push(...(await commit(entity, raws, options)).calls);
    }
    expect(all.length).toBeGreaterThan(0);
    for (const call of all) {
      expect(['journal_entries', 'journal_entry_items', 'posting_requests']).not.toContain(call.target);
    }
  });
});

describe('interrupted commit recovery', () => {
  it('a retried pass does not re-insert a record the dead pass already created', async () => {
    const validated = validate('customers', [{ name: 'Fresh Co' }]);
    expect(validated.rows[0].planned_action).toBe('create');
    const afterCrash = refs({ customers: [...refs().customers, { id: 'c-new', name: 'Fresh Co', email: null, payment_terms: null }] });
    const { units } = buildCommitUnits('customers', validated.rows.map(r => ({
      id: r.id, row_number: 1, normalized: r.normalized, group_key: r.group_key,
      planned_action: 'create' as const, validation_status: r.validation_status,
    })), false);
    const { db, calls } = fakeDb();
    const outcome = await units[0].execute({
      db, companyId: 'co-1', runId: 'run-1', actorUserId: 'u-1',
      resolver: new Resolver(afterCrash), options: {}, createdParties: new Map(),
    });
    expect(calls).toHaveLength(0);
    expect(outcome.get('r1')?.outcome).toBe('skipped');
  });
});

describe('documents import whole or not at all', () => {
  it('one bad invoice line holds back every line of that invoice, not other invoices', () => {
    const base = { customer: 'Mokoena Trading', invoice_date: '2026-09-05', income_account: 'Sales Revenue' };
    const r = validate('invoices', [
      { ...base, invoice_number: 'A', unit_price: '100' },
      { ...base, invoice_number: 'A', unit_price: 'abc' },
      { ...base, invoice_number: 'B', unit_price: '50' },
    ]);
    expect(r.rows[0].validation_status).toBe('error');
    expect(codes(r.rows[0].issues)).toContain('document_has_errors');
    expect(r.rows[2].validation_status).toBe('valid');
  });

  it('an opening trial balance with any bad row cannot be imported at all', () => {
    const r = validate('opening_balances', [
      { account: 'Equipment', debit: '100' },
      { account: 'Nonexistent', credit: '100' },
    ], { as_at_date: '2026-02-28' });
    expect(codes(r.runIssues)).toContain('trial_balance_incomplete');
  });
});

describe('the posting engine has the final word before commit', () => {
  it('previews each journal and pins a refused account to its own row, holding the rest', () => {
    const reference = refs();
    const r = validate('opening_balances', [
      { account: 'Equipment', debit: '100' },
      { account: 'Retained Earnings', credit: '100' },
    ], { as_at_date: '2026-02-28' }, reference);
    const previews = buildEnginePreviews({
      entity: 'opening_balances', rows: r.rows, refs: reference, companyId: 'co-1', actorUserId: 'u-1',
      options: { as_at_date: '2026-02-28' },
    });
    expect(previews).toHaveLength(1);
    expect(previews[0].request).toMatchObject({ module: 'manual_journal', posting_date: '2026-02-28', company_id: 'co-1' });
    applyEngineVerdict(previews[0], [{ message: 'Retained earnings account Retained Earnings is system controlled.' }], r.rows);
    expect(codes(r.rows[1].issues)).toContain('engine_policy');
    expect(codes(r.rows[0].issues)).toContain('document_has_errors');
    expect(r.rows.every(row => row.validation_status === 'error')).toBe(true);
  });

  it('does not preview master data or bank lines', () => {
    const r = validate('customers', [{ name: 'X' }]);
    expect(buildEnginePreviews({ entity: 'customers', rows: r.rows, refs: refs(), companyId: 'c', actorUserId: 'u', options: {} })).toEqual([]);
  });
});

describe('VAT account selection matches the invoice and bill screens', () => {
  it('falls back to a single VAT control account', async () => {
    const reference = refs();
    reference.accounts = [
      ...reference.accounts.filter(a => a.account_role !== 'output_vat' && a.account_role !== 'input_vat'),
      acct('a-vc', 'VAT Control', 'Liability', { account_role: 'vat_control' }),
    ];
    const inv = await commit('invoices', [
      { invoice_number: 'V1', customer: 'Mokoena Trading', invoice_date: '2026-09-05', unit_price: '100', income_account: 'Sales Revenue', tax_rate: '15' },
    ], {}, reference);
    expect(inv.calls[0].args.p_tax_payable_account_id).toBe('a-vc');
    const bill = await commit('bills', [
      { bill_number: 'B1', vendor: 'Khumalo Stationers', bill_date: '2026-09-05', unit_cost: '100', expense_account: 'Office Rent', tax_rate: '15' },
    ], {}, reference);
    expect(bill.calls[0].args.p_tax_receivable_account_id).toBe('a-vc');
  });
});

describe('switching from Sage, Pastel and QuickBooks', () => {
  it('maps a Sage Pastel stock list where Description is the item name', () => {
    const m = autoMapColumns(['Code', 'Description', 'Selling Price Excl', 'Average Cost', 'Item Type'], ENTITY_SPECS.products.fields);
    expect(m.name).toBe('Description');
    expect(m.sku).toBe('Code');
    expect(m.price).toBe('Selling Price Excl');
    expect(m.cost).toBe('Average Cost');
    expect(m.type).toBe('Item Type');
    expect(missingRequired(m, ENTITY_SPECS.products.fields)).toEqual([]);
  });

  it('maps a Sage customer list', () => {
    const m = autoMapColumns(['Account', 'Customer Description', 'Telephone 1', 'Email', 'VAT Reference', 'Postal Address 1'], ENTITY_SPECS.customers.fields);
    expect(m).toMatchObject({ name: 'Customer Description', phone: 'Telephone 1', email: 'Email', tax_id: 'VAT Reference', address: 'Postal Address 1' });
  });

  it('accepts a QuickBooks chart of accounts whose Type column holds categories', () => {
    const r = validate('chart_of_accounts', [
      { name: 'FNB Cheque', type: 'Bank' },
      { name: 'Debtors Control X', type: 'Accounts receivable (A/R)' },
      { name: 'Advertising', type: 'Expenses' },
      { name: 'Consulting Income', type: 'Income' },
      { name: 'Purchases', type: 'Cost of Goods Sold' },
      { name: 'Vehicles', type: 'Asset' },
    ]);
    expect(r.rows.slice(0, 5).map(x => [x.normalized.type, x.normalized.category])).toEqual([
      ['Asset', 'Current Assets'],
      ['Asset', 'Current Assets'],
      ['Expense', 'Operating Expenses'],
      ['Income', 'Revenue'],
      ['Expense', 'Cost of Sales'],
    ]);
    expect(r.rows.slice(0, 5).map(x => [x.validation_status, x.issues.map(i => i.message).join('|')])).toEqual(Array(5).fill(['valid', '']));
    // "Asset" alone could be current or non-current: never guessed.
    expect(r.rows[5].validation_status).toBe('error');
  });

  it('accepts a Sage Pastel chart of accounts with only a financial category', () => {
    const mapping = autoMapColumns(['Account Number', 'Description', 'Financial Category'], ENTITY_SPECS.chart_of_accounts.fields);
    expect(mapping).toMatchObject({ account_code: 'Account Number', name: 'Description', category: 'Financial Category' });
    const result = validateAllRows({
      entity: 'chart_of_accounts',
      rows: rows([
        { 'Account Number': '1000/000', Description: 'Sales - Services', 'Financial Category': 'Sales' },
        { 'Account Number': '5200/000', Description: 'Loan from Director', 'Financial Category': 'Long Term Liabilities' },
        { 'Account Number': '6100/000', Description: 'Motor Vehicles', 'Financial Category': 'Fixed Assets' },
      ]),
      mapping, options: {}, refs: refs(), closedDates: new Set(), existingBankRefs: new Set(),
    });
    expect(result.rows.map(x => [x.normalized.type, x.normalized.category, x.validation_status])).toEqual([
      ['Income', 'Revenue', 'valid'],
      ['Liability', 'Non-Current Liabilities', 'valid'],
      ['Asset', 'Non-Current Assets', 'valid'],
    ]);
  });

  it('maps a QuickBooks invoice export', () => {
    const m = autoMapColumns(['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'ItemTaxCode'], ENTITY_SPECS.invoices.fields);
    expect(m).toMatchObject({
      invoice_number: 'InvoiceNo', customer: 'Customer', invoice_date: 'InvoiceDate', due_date: 'DueDate',
      product: 'Item(Product/Service)', line_description: 'ItemDescription', quantity: 'ItemQuantity',
      unit_price: 'ItemRate', line_amount: 'ItemAmount', tax_rate: 'ItemTaxCode',
    });
  });
});

describe('comparing with the old system trial balance', () => {
  const mapping = autoMapColumns(['Account Number', 'Account Description', 'Debit', 'Credit'], TB_COMPARE_FIELDS);

  it('maps a Sage trial balance export', () => {
    expect(mapping).toMatchObject({ account_code: 'Account Number', account: 'Account Description', debit: 'Debit', credit: 'Credit' });
  });

  it('matches, flags differences, unknown accounts and balances only held here', () => {
    const ledger = ledgerFromTypeSigned([
      { id: 'a-equip', type: 'Asset', balance: 85000 },
      { id: 'a-sales', type: 'Income', balance: 1000 },   // credit 1000
      { id: 'a-rent', type: 'Expense', balance: 250 },     // not in the file
      { id: 'a-dep', type: 'Expense', balance: 0 },
    ]);
    const result = compareTrialBalance({
      rows: [
        { row_number: 2, raw: { 'Account Number': '', 'Account Description': 'Equipment', Debit: '85 000,00', Credit: '' } },
        { row_number: 3, raw: { 'Account Number': '4000', 'Account Description': 'Sales', Debit: '', Credit: '900' } },
        { row_number: 4, raw: { 'Account Number': '', 'Account Description': 'Petty Cash', Debit: '50', Credit: '' } },
        { row_number: 5, raw: { 'Account Number': '', 'Account Description': 'ASSETS', Debit: '', Credit: '' } },
      ],
      mapping,
      resolver: new Resolver(refs()),
      ledger,
    });
    const by = Object.fromEntries(result.lines.map(l => [l.label, l]));
    expect(by['Equipment']).toMatchObject({ status: 'match', old_net: 85000, new_net: 85000 });
    expect(by['4000 Sales']).toMatchObject({ status: 'differs', old_net: -900, new_net: -1000, difference: -100 });
    expect(by['Petty Cash'].status).toBe('not_found');
    expect(by['Office Rent']).toMatchObject({ status: 'only_here', new_net: 250 });
    expect(result.lines.some(l => l.label === 'ASSETS')).toBe(false);
    expect(result.all_match).toBe(false);
    expect(result.old_total_debit).toBe(85050);
    expect(result.old_total_credit).toBe(900);
  });

  it('accepts a single signed balance column and combines split lines', () => {
    const m = autoMapColumns(['Account', 'Closing Balance'], TB_COMPARE_FIELDS);
    const result = compareTrialBalance({
      rows: [
        { row_number: 2, raw: { Account: 'Equipment', 'Closing Balance': '60000' } },
        { row_number: 3, raw: { Account: 'Equipment', 'Closing Balance': '25000' } },
      ],
      mapping: m,
      resolver: new Resolver(refs()),
      ledger: [{ account_id: 'a-equip', net: 85000 }],
    });
    expect(result.all_match).toBe(true);
    expect(result.lines[0].note).toBe('Rows 2, 3 combined.');
  });
});

describe('opening balances are a target, like Xero conversion balances', () => {
  it('posts only what the imported invoices did not already put in the books', async () => {
    // Unpaid invoices imported first: debtors 11 500, sales 10 000, VAT 1 500.
    const ledgerNet = new Map([['a-ar', 11500], ['a-sales', -10000], ['a-vout', -1500]]);
    const file = [
      { account: 'Trade Receivables', debit: '11500' },
      { account: 'Equipment', debit: '20000' },
      { account: 'Sales Revenue', credit: '30000' },
      { account: 'VAT Output', credit: '1500' },
    ];
    const options = { as_at_date: '2026-02-28' };
    const r = validateAllRows({
      entity: 'opening_balances', rows: rows(file), mapping: identityMapping('opening_balances'),
      options, refs: refs(), closedDates: new Set(), existingBankRefs: new Set(), ledgerNet,
    });
    expect(r.totals.errors).toBe(0);
    expect(codes(r.rows[0].issues)).toEqual(['already_in_ledger']);
    expect(codes(r.runIssues)).not.toContain('tb_difference');

    const { units } = buildCommitUnits('opening_balances', r.rows.map((x, i) => ({
      id: x.id, row_number: i + 1, normalized: x.normalized, group_key: x.group_key,
      planned_action: x.planned_action as 'create', validation_status: x.validation_status,
    })), false);
    const { db, calls } = fakeDb();
    await units[0].execute({
      db, companyId: 'co-1', runId: 'run-1', actorUserId: 'u-1', resolver: new Resolver(refs()),
      options, createdParties: new Map(), ledgerNet,
    });
    expect(calls).toHaveLength(1);
    const request = calls[0].args.p_request as { lines: Array<{ account_id: string; debit: number; credit: number }> };
    // Sales gets only the 20 000 the invoices did not already credit; debtors and VAT untouched.
    expect(request.lines.map(l => [l.account_id, l.debit, l.credit])).toEqual([
      ['a-equip', 20000, 0],
      ['a-sales', 0, 20000],
    ]);
  });

  it('nothing to post when the books already match', async () => {
    const ledgerNet = new Map([['a-equip', 500], ['a-re', -500]]);
    const reference = refs();
    const r = validateAllRows({
      entity: 'opening_balances',
      rows: rows([{ account: 'Equipment', debit: '500' }]),
      mapping: identityMapping('opening_balances'), options: { as_at_date: '2026-02-28' },
      refs: reference, closedDates: new Set(), existingBankRefs: new Set(), ledgerNet,
    });
    const { units } = buildCommitUnits('opening_balances', r.rows.map((x, i) => ({
      id: x.id, row_number: i + 1, normalized: x.normalized, group_key: x.group_key,
      planned_action: x.planned_action as 'create', validation_status: x.validation_status,
    })), false);
    const { db, calls } = fakeDb();
    const out = await units[0].execute({
      db, companyId: 'co-1', runId: 'run-1', actorUserId: 'u-1', resolver: new Resolver(reference),
      options: { as_at_date: '2026-02-28' }, createdParties: new Map(), ledgerNet,
    });
    expect(calls).toHaveLength(0);
    expect(out.get('r1')?.outcome).toBe('skipped');
  });
});
