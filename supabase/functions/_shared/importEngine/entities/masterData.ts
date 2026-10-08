/**
 * Master-data imports: customers, suppliers, products and the chart of
 * accounts. One row per record; duplicates against existing records follow
 * the run's on_duplicate option (skip or update), and duplicates inside the
 * file are errors after the first occurrence.
 */

import {
  ACCOUNT_CLASSIFICATIONS,
  classificationError,
  subclassificationError,
} from '../../chartOfAccounts/accountClassification.ts';
import { canonicalValue } from '../spec.ts';

/** The one account type a statement category belongs to. */
function typeForCategory(category: string): string | null {
  for (const [type, categories] of Object.entries(ACCOUNT_CLASSIFICATIONS)) {
    if (categories.includes(category)) return type;
  }
  return null;
}
import { matchKey } from '../normalize.ts';
import type { ImportEntityType, RowIssue } from '../types.ts';
import {
  type ValidateContext,
  type WorkRow,
  amt,
  checkEmail,
  err,
  hasErrors,
  str,
  warn,
} from './common.ts';
import {
  type CommitContext,
  type CommitRowInput,
  type CommitUnit,
  nnum,
  nstr,
  uniformOutcome,
} from './db.ts';

function dedupeInFile(rows: WorkRow[], keyOf: (row: WorkRow) => string | null, what: string): void {
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.blank) continue;
    const value = keyOf(row);
    if (!value) continue;
    const key = matchKey(value);
    if (!key) continue;
    const firstRow = seen.get(key);
    if (firstRow != null) {
      row.issues.push(err('duplicate_in_file', `${what} "${value}" also appears on row ${firstRow}.`));
    } else {
      seen.set(key, row.row_number);
    }
  }
}

function planDuplicate(row: WorkRow, existingId: string, label: string, ctx: ValidateContext): void {
  const mode = ctx.options.on_duplicate === 'update' ? 'update' : 'skip';
  row.normalized.existing_id = existingId;
  row.planned_action = mode;
  row.issues.push(warn(
    'duplicate_existing',
    mode === 'update'
      ? `${label} already exists and will be updated with the values in this file.`
      : `${label} already exists and will be skipped.`,
  ));
}

/**
 * Reference data is reloaded on every commit pass. A row planned as "create"
 * whose record now exists was written by an earlier pass that died before it
 * could record the outcome — inserting again would duplicate it.
 */
const RECOVERED = {
  outcome: 'skipped' as const,
  detail: { reason: 'Already created by an earlier, interrupted attempt of this import.' },
};
function alreadyPresent(match: { kind: string }): boolean {
  return match.kind !== 'missing';
}

// ── Customers and suppliers ─────────────────────────────────────────────────

function validateParties(rows: WorkRow[], ctx: ValidateContext, entity: 'customers' | 'vendors'): void {
  dedupeInFile(rows, r => str(r, 'name'), entity === 'customers' ? 'Customer' : 'Supplier');
  for (const row of rows) {
    if (row.blank) continue;
    checkEmail(row);
    const terms = amt(row, 'payment_terms');
    if (terms != null && terms < 0) {
      row.issues.push(err('bad_terms', 'Payment terms cannot be negative.', 'payment_terms'));
    }
    const name = str(row, 'name');
    if (!name || hasErrors(row)) continue;
    const match = entity === 'customers' ? ctx.resolver.customer(name) : ctx.resolver.vendor(name);
    if (match.kind === 'found') {
      planDuplicate(row, match.value.id, `"${name}"`, ctx);
    } else {
      row.planned_action = 'create';
    }
  }
}

function partyValues(row: CommitRowInput, companyId: string): Record<string, unknown> {
  const values: Record<string, unknown> = { company_id: companyId, name: nstr(row, 'name') };
  for (const key of ['contact_name', 'email', 'phone', 'address', 'tax_id'] as const) {
    const v = nstr(row, key);
    if (v != null) values[key] = v;
  }
  const terms = nnum(row, 'payment_terms');
  if (terms != null) values.payment_terms = terms;
  return values;
}

function planPartyCommit(rows: CommitRowInput[], table: 'customers' | 'vendors'): CommitUnit[] {
  return rows.map(row => ({
    rows: [row],
    execute: async (ctx: CommitContext): Promise<Map<string, import('./db.ts').UnitOutcome>> => {
      if (row.planned_action === 'skip') {
        return uniformOutcome([row], { outcome: 'skipped', detail: { id: nstr(row, 'existing_id') } });
      }
      const values = partyValues(row, ctx.companyId);
      if (row.planned_action === 'update') {
        const id = nstr(row, 'existing_id');
        if (!id) throw new Error('Missing existing record id for update.');
        const { company_id: _c, ...rest } = values;
        await ctx.db.update(table, id, rest);
        return uniformOutcome([row], { outcome: 'updated', detail: { id } });
      }
      if (alreadyPresent(table === 'customers' ? ctx.resolver.customer(String(values.name)) : ctx.resolver.vendor(String(values.name)))) {
        return uniformOutcome([row], RECOVERED);
      }
      const created = await ctx.db.insert(table, values);
      return uniformOutcome([row], { outcome: 'imported', detail: { id: created.id } });
    },
  }));
}

// ── Products ────────────────────────────────────────────────────────────────

function validateProducts(rows: WorkRow[], ctx: ValidateContext): void {
  dedupeInFile(rows, r => str(r, 'sku'), 'SKU');
  dedupeInFile(rows, r => str(r, 'name'), 'Product');
  for (const row of rows) {
    if (row.blank) continue;
    for (const key of ['price', 'cost'] as const) {
      const v = amt(row, key);
      if (v != null && v < 0) row.issues.push(err('negative_amount', `${key === 'price' ? 'Selling price' : 'Cost'} cannot be negative.`, key));
    }
    const type = str(row, 'type');

    const resolveAccount = (field: string, wantType: string | null, label: string): string | null => {
      const value = str(row, field);
      if (!value) return null;
      const match = ctx.resolver.account(value);
      if (match.kind === 'missing') {
        row.issues.push(err('account_not_found', `${label} "${value}" was not found in the chart of accounts.`, field));
        return null;
      }
      if (match.kind === 'ambiguous') {
        row.issues.push(err('account_ambiguous', `${label} "${value}" matches more than one account: ${match.candidates.join('; ')}.`, field));
        return null;
      }
      if (wantType && match.value.type !== wantType) {
        row.issues.push(err('account_wrong_type', `${label} "${value}" is a ${match.value.type} account; a ${wantType} account is needed.`, field));
        return null;
      }
      if (!match.value.is_active) {
        row.issues.push(err('account_inactive', `${label} "${value}" is inactive.`, field));
        return null;
      }
      return match.value.id;
    };

    const incomeId = resolveAccount('income_account', 'Income', 'Income account');
    const cogsId = resolveAccount('cogs_account', 'Expense', 'Cost of sales account');
    const inventoryId = resolveAccount('inventory_account', 'Asset', 'Inventory account');
    if (incomeId) row.normalized.income_account_id = incomeId;
    if (cogsId) row.normalized.cogs_account_id = cogsId;
    if (inventoryId) row.normalized.inventory_asset_account_id = inventoryId;

    if (type === 'inventory') {
      if (!cogsId && !str(row, 'cogs_account')) {
        row.issues.push(err('stock_needs_accounts', 'An inventory item needs a cost of sales account before it can be imported.', 'cogs_account'));
      }
      if (!inventoryId && !str(row, 'inventory_account')) {
        row.issues.push(err('stock_needs_accounts', 'An inventory item needs an inventory (asset) account before it can be imported.', 'inventory_account'));
      }
    }

    const taxName = str(row, 'tax_rate');
    if (taxName) {
      const match = ctx.resolver.taxRate(taxName);
      if (match.kind === 'found') row.normalized.tax_rate_id = match.value.id;
      else if (match.kind === 'ambiguous') row.issues.push(err('tax_ambiguous', `Tax rate "${taxName}" matches more than one rate: ${match.candidates.join('; ')}.`, 'tax_rate'));
      else row.issues.push(err('tax_not_found', `Tax rate "${taxName}" was not found. Create it under Tax Rates first.`, 'tax_rate'));
    }

    const name = str(row, 'name');
    if (!name || hasErrors(row)) continue;
    const sku = str(row, 'sku');
    const match = sku ? ctx.resolver.product(sku) : ctx.resolver.product(name);
    if (match.kind === 'found') {
      planDuplicate(row, match.value.id, sku ? `SKU "${sku}"` : `"${name}"`, ctx);
    } else {
      row.planned_action = 'create';
    }
  }
}

function productValues(row: CommitRowInput, companyId: string): Record<string, unknown> {
  const type = nstr(row, 'type');
  const values: Record<string, unknown> = {
    company_id: companyId,
    name: nstr(row, 'name'),
    type,
    // Canonical vocabulary accepted by both the live schema and the repo CHECKs.
    item_class: type === 'inventory' ? 'finished_good' : 'service',
    cost_method: 'weighted_average',
  };
  for (const [field, column] of [
    ['sku', 'sku'], ['description', 'description'], ['barcode', 'barcode'],
    ['category', 'category_name'],
    ['income_account_id', 'income_account_id'], ['cogs_account_id', 'cogs_account_id'],
    ['inventory_asset_account_id', 'inventory_asset_account_id'], ['tax_rate_id', 'tax_rate_id'],
  ] as const) {
    const v = nstr(row, field);
    if (v != null) values[column] = v;
  }
  const uom = nstr(row, 'uom');
  if (uom != null) values.uom = uom.toUpperCase();
  const price = nnum(row, 'price');
  if (price != null) values.price = price;
  const cost = nnum(row, 'cost');
  if (cost != null) values.cost = cost;
  return values;
}

function planProductCommit(rows: CommitRowInput[]): CommitUnit[] {
  return rows.map(row => ({
    rows: [row],
    execute: async (ctx: CommitContext): Promise<Map<string, import('./db.ts').UnitOutcome>> => {
      if (row.planned_action === 'skip') {
        return uniformOutcome([row], { outcome: 'skipped', detail: { id: nstr(row, 'existing_id') } });
      }
      const values = productValues(row, ctx.companyId);
      if (row.planned_action === 'update') {
        const id = nstr(row, 'existing_id');
        if (!id) throw new Error('Missing existing record id for update.');
        const { company_id: _c, type: _t, item_class: _i, cost_method: _m, ...rest } = values;
        await ctx.db.update('products', id, rest);
        return uniformOutcome([row], { outcome: 'updated', detail: { id } });
      }
      const sku = nstr(row, 'sku');
      if (alreadyPresent(ctx.resolver.product(sku ?? String(values.name)))) {
        return uniformOutcome([row], RECOVERED);
      }
      const created = await ctx.db.insert('products', values);
      return uniformOutcome([row], { outcome: 'imported', detail: { id: created.id } });
    },
  }));
}

// ── Chart of accounts ───────────────────────────────────────────────────────

function validateAccounts(rows: WorkRow[], ctx: ValidateContext): void {
  dedupeInFile(rows, r => str(r, 'account_code'), 'Account code');
  dedupeInFile(rows, r => str(r, 'name'), 'Account');
  const categoryField = ctx.spec.fields.find(f => f.key === 'category');
  for (const row of rows) {
    if (row.blank) continue;
    // QuickBooks puts "Bank" or "Accounts receivable (A/R)" in its Type
    // column; Sage Pastel exports only a financial category. A category
    // belongs to exactly one account type, so the type follows from it.
    const badType = row.issues.findIndex(i => i.code === 'bad_value' && i.field === 'type');
    if (badType >= 0 && categoryField) {
      const rawType = String(row.record.type ?? '');
      const asCategory = canonicalValue(categoryField, rawType);
      if (asCategory) {
        row.issues.splice(badType, 1);
        if (!str(row, 'category')) {
          row.normalized.category = asCategory;
          row.issues = row.issues.filter(i => !(i.code === 'required' && i.field === 'category'));
        }
        row.normalized.type = typeForCategory(str(row, 'category') ?? asCategory);
      }
    }
    if (!str(row, 'category') && categoryField && row.record.type != null) {
      const fromType = canonicalValue(categoryField, String(row.record.type));
      if (fromType) {
        row.normalized.category = fromType;
        row.issues = row.issues.filter(i => !(i.code === 'required' && i.field === 'category'));
      }
    }
    if (!str(row, 'type') && str(row, 'category')) {
      const derived = typeForCategory(str(row, 'category')!);
      if (derived) row.normalized.type = derived;
    }
    if (!str(row, 'type') && !row.issues.some(i => i.field === 'type' || i.field === 'category')) {
      row.issues.push(err('required', 'Type is required when the category does not show it.', 'type'));
    }
    const type = str(row, 'type');
    const category = str(row, 'category');
    const classError = classificationError(type, category);
    if (classError && type) {
      row.issues.push(err('bad_classification', classError, 'category'));
    }
    const subError = subclassificationError(category, str(row, 'subcategory'));
    if (subError) row.issues.push(err('bad_subcategory', subError, 'subcategory'));

    const name = str(row, 'name');
    if (!name || hasErrors(row)) continue;

    const code = str(row, 'account_code');
    const match = code ? ctx.resolver.account(code) : ctx.resolver.account(name);
    if (match.kind === 'found') {
      const existing = match.value;
      if (existing.account_role != null) {
        row.planned_action = 'skip';
        row.normalized.existing_id = existing.id;
        row.issues.push(warn('system_account', `"${existing.name}" is a system-mapped account and is never changed by an import.`));
      } else {
        planDuplicate(row, existing.id, `"${existing.name}"`, ctx);
        if (ctx.options.on_duplicate === 'update' && existing.type !== type) {
          row.planned_action = 'skip';
          row.issues.push(warn('type_change_refused', `"${existing.name}" is a ${existing.type} account; an import never changes an account's type.`));
        }
      }
    } else if (match.kind === 'ambiguous') {
      row.issues.push(err('account_ambiguous', `"${code ?? name}" matches more than one existing account: ${match.candidates.join('; ')}.`));
    } else {
      row.planned_action = 'create';
    }
  }
}

function planAccountCommit(rows: CommitRowInput[]): CommitUnit[] {
  return rows.map(row => ({
    rows: [row],
    execute: async (ctx: CommitContext): Promise<Map<string, import('./db.ts').UnitOutcome>> => {
      if (row.planned_action === 'skip') {
        return uniformOutcome([row], { outcome: 'skipped', detail: { id: nstr(row, 'existing_id') } });
      }
      if (row.planned_action === 'update') {
        const id = nstr(row, 'existing_id');
        if (!id) throw new Error('Missing existing record id for update.');
        const values: Record<string, unknown> = {};
        for (const key of ['category', 'subcategory', 'description', 'account_code'] as const) {
          const v = nstr(row, key);
          if (v != null) values[key] = v;
        }
        await ctx.db.update('chart_of_accounts', id, values);
        return uniformOutcome([row], { outcome: 'updated', detail: { id } });
      }
      const values: Record<string, unknown> = {
        company_id: ctx.companyId,
        name: nstr(row, 'name'),
        type: nstr(row, 'type'),
        category: nstr(row, 'category'),
        source: 'import',
        is_active: true,
      };
      for (const key of ['subcategory', 'description', 'account_code'] as const) {
        const v = nstr(row, key);
        if (v != null) values[key] = v;
      }
      if (alreadyPresent(ctx.resolver.account(nstr(row, 'account_code') ?? String(values.name)))) {
        return uniformOutcome([row], RECOVERED);
      }
      // account_number is assigned by the database trigger per type range.
      const created = await ctx.db.insert('chart_of_accounts', values);
      return uniformOutcome([row], { outcome: 'imported', detail: { id: created.id } });
    },
  }));
}

// ── Registry glue ───────────────────────────────────────────────────────────

export function validateMasterData(entity: ImportEntityType, rows: WorkRow[], ctx: ValidateContext): void {
  switch (entity) {
    case 'customers':
      return validateParties(rows, ctx, 'customers');
    case 'vendors':
      return validateParties(rows, ctx, 'vendors');
    case 'products':
      return validateProducts(rows, ctx);
    case 'chart_of_accounts':
      return validateAccounts(rows, ctx);
    default:
      throw new Error(`Not a master-data entity: ${entity}`);
  }
}

export function planMasterDataCommit(entity: ImportEntityType, rows: CommitRowInput[]): CommitUnit[] {
  switch (entity) {
    case 'customers':
      return planPartyCommit(rows, 'customers');
    case 'vendors':
      return planPartyCommit(rows, 'vendors');
    case 'products':
      return planProductCommit(rows);
    case 'chart_of_accounts':
      return planAccountCommit(rows);
    default:
      throw new Error(`Not a master-data entity: ${entity}`);
  }
}

export type { RowIssue };
