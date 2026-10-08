/**
 * Invoice and bill imports. One file row is one document line; rows sharing
 * a document number form one document, posted atomically through the same
 * RPCs the invoice and bill screens use (post_sales_invoice_atomic /
 * record_bill_with_taxes). Nothing writes to the ledger directly.
 */

import { roundMoney } from '../normalize.ts';
import { importIdempotencyKey } from '../types.ts';
import type { Resolver } from '../resolve.ts';
import {
  type ValidateContext,
  type WorkRow,
  addRunIssue,
  amt,
  checkPeriodOpen,
  err,
  groupKeyOf,
  groupRows,
  hasErrors,
  issueAll,
  str,
  warn,
} from './common.ts';
import {
  type CommitContext,
  type CommitRowInput,
  type CommitUnit,
  type UnitOutcome,
  nnum,
  nstr,
  uniformOutcome,
} from './db.ts';

/**
 * The VAT account a document posts to, chosen exactly as the invoice and bill
 * screens choose it: the dedicated output (input) VAT account, else the single
 * VAT control account many South African charts use for both.
 */
function vatAccount(resolver: Resolver, isInvoice: boolean) {
  return resolver.accountByRole(isInvoice ? 'output_vat' : 'input_vat') ?? resolver.accountByRole('vat_control');
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** First non-null value of a field across the group; conflicts are errors. */
function consistent(
  rows: WorkRow[],
  key: string,
  label: string,
): string | null {
  let value: string | null = null;
  for (const row of rows) {
    const v = str(row, key);
    if (v == null) continue;
    if (value == null) value = v;
    else if (v !== value) {
      row.issues.push(err('inconsistent_group', `${label} "${v}" differs from "${value}" on an earlier row of the same document.`, key));
    }
  }
  return value;
}

function resolveLineAccount(
  row: WorkRow,
  resolver: Resolver,
  field: string,
  label: string,
  wantTypes: string[] | null,
): string | null {
  const value = str(row, field);
  if (!value) return null;
  const match = resolver.account(value);
  if (match.kind === 'missing') {
    row.issues.push(err('account_not_found', `${label} "${value}" was not found in the chart of accounts.`, field));
    return null;
  }
  if (match.kind === 'ambiguous') {
    row.issues.push(err('account_ambiguous', `${label} "${value}" matches more than one account: ${match.candidates.join('; ')}.`, field));
    return null;
  }
  const account = match.value;
  if (!account.is_active || account.posting_blocked) {
    row.issues.push(err('account_unpostable', `${label} "${account.name}" is ${account.is_active ? 'blocked for posting' : 'inactive'}.`, field));
    return null;
  }
  if (wantTypes && !wantTypes.includes(account.type)) {
    row.issues.push(err('account_wrong_type', `${label} "${account.name}" is a ${account.type} account; expected ${wantTypes.join(' or ')}.`, field));
    return null;
  }
  return account.id;
}

interface DocumentShape {
  entity: 'invoices' | 'bills';
  numberField: 'invoice_number' | 'bill_number';
  partyField: 'customer' | 'vendor';
  dateField: 'invoice_date' | 'bill_date';
  priceField: 'unit_price' | 'unit_cost';
  lineAccountField: 'income_account' | 'expense_account';
  partyLabel: string;
  docLabel: string;
}

const INVOICE_SHAPE: DocumentShape = {
  entity: 'invoices',
  numberField: 'invoice_number',
  partyField: 'customer',
  dateField: 'invoice_date',
  priceField: 'unit_price',
  lineAccountField: 'income_account',
  partyLabel: 'Customer',
  docLabel: 'Invoice',
};

const BILL_SHAPE: DocumentShape = {
  entity: 'bills',
  numberField: 'bill_number',
  partyField: 'vendor',
  dateField: 'bill_date',
  priceField: 'unit_cost',
  lineAccountField: 'expense_account',
  partyLabel: 'Supplier',
  docLabel: 'Bill',
};

function validateDocuments(rows: WorkRow[], ctx: ValidateContext, shape: DocumentShape): void {
  const isInvoice = shape.entity === 'invoices';
  const arRole = ctx.resolver.accountByRole(isInvoice ? 'trade_receivable' : 'trade_payable');
  const taxRole = vatAccount(ctx.resolver, isInvoice);
  const inventoryRole = ctx.resolver.accountByRole('inventory_asset');

  if (!arRole) {
    addRunIssue(ctx, err(
      'missing_role_account',
      isInvoice
        ? 'No account is mapped as the Trade Receivables control account. Map it under Chart of Accounts before importing invoices.'
        : 'No account is mapped as the Trade Payables control account. Map it under Chart of Accounts before importing bills.',
    ));
  }

  const groups = groupRows(rows, r => {
    const n = str(r, shape.numberField);
    return n ? groupKeyOf(n) : null;
  });

  for (const [, groupRowsList] of groups) {
    const docNumber = str(groupRowsList[0], shape.numberField)!;
    const partyName = consistent(groupRowsList, shape.partyField, shape.partyLabel);
    const docDate = consistent(groupRowsList, shape.dateField, `${shape.docLabel} date`);
    const dueDate = consistent(groupRowsList, 'due_date', 'Due date');
    consistent(groupRowsList, 'document_description', `${shape.docLabel} description`);

    if (!arRole) issueAll(groupRowsList, err('missing_role_account', 'The receivables/payables control account is not mapped.'));

    // The whole document is skipped when its number already exists.
    const existing = isInvoice
      ? ctx.resolver.invoiceByNumber(docNumber)
      : ctx.resolver.billByNumber(docNumber);
    if (existing) {
      for (const row of groupRowsList) {
        row.planned_action = 'skip';
        row.normalized.existing_id = existing.id;
        row.issues.push(warn('duplicate_existing', `${shape.docLabel} ${docNumber} already exists and will be skipped.`));
      }
    }

    // Party resolution, with optional auto-create.
    let partyTerms: number | null = null;
    if (partyName) {
      const match = isInvoice ? ctx.resolver.customer(partyName) : ctx.resolver.vendor(partyName);
      if (match.kind === 'found') {
        for (const row of groupRowsList) row.normalized.party_id = match.value.id;
        partyTerms = match.value.payment_terms;
      } else if (match.kind === 'ambiguous') {
        issueAll(groupRowsList, err('party_ambiguous', `${shape.partyLabel} "${partyName}" matches more than one record: ${match.candidates.join('; ')}.`, shape.partyField));
      } else if (ctx.options.auto_create_parties) {
        for (const row of groupRowsList) row.normalized.new_party_name = partyName;
        groupRowsList[0].issues.push(warn('party_will_be_created', `${shape.partyLabel} "${partyName}" is new and will be created by this import.`, shape.partyField));
      } else {
        issueAll(groupRowsList, err('party_not_found', `${shape.partyLabel} "${partyName}" was not found. Import your ${isInvoice ? 'customers' : 'suppliers'} first, or turn on "create new ${isInvoice ? 'customers' : 'suppliers'} automatically".`, shape.partyField));
      }
    }

    if (docDate) {
      for (const row of groupRowsList) {
        row.normalized.doc_date = docDate;
        row.normalized.doc_due_date = dueDate ??
          (partyTerms != null ? addDaysIso(docDate, partyTerms) : docDate);
      }
      if (dueDate && dueDate < docDate) {
        groupRowsList[0].issues.push(warn('due_before_date', `The due date ${dueDate} is before the ${shape.docLabel.toLowerCase()} date ${docDate}.`, 'due_date'));
      }
      checkPeriodOpen(ctx, groupRowsList[0], shape.dateField);
      if (ctx.closedDates.has(docDate)) {
        issueAll(groupRowsList.slice(1), err('period_locked', `${docDate} falls in a closed or locked accounting period.`, shape.dateField));
      }
    }

    // Line-by-line.
    for (const row of groupRowsList) {
      let productId: string | null = null;
      let productIncome: string | null = null;
      let productExpense: string | null = null;
      let productPrice: number | null = null;
      let productIsStock = false;
      const productName = str(row, 'product');
      if (productName) {
        const match = ctx.resolver.product(productName);
        if (match.kind === 'found') {
          productId = match.value.id;
          productIncome = match.value.income_account_id;
          productExpense = match.value.inventory_asset_account_id ?? match.value.cogs_account_id;
          productPrice = isInvoice ? match.value.price : match.value.cost;
          productIsStock = match.value.type === 'inventory';
          row.normalized.product_id = productId;
        } else if (match.kind === 'ambiguous') {
          row.issues.push(err('product_ambiguous', `Product "${productName}" matches more than one item: ${match.candidates.join('; ')}.`, 'product'));
        } else {
          row.issues.push(err('product_not_found', `Product "${productName}" was not found. Import Products & services first, or leave the column blank and name the account instead.`, 'product'));
        }
      }

      const lineAccountId =
        resolveLineAccount(row, ctx.resolver, shape.lineAccountField,
          isInvoice ? 'Income account' : 'Expense account',
          isInvoice ? ['Income'] : null) ??
        (isInvoice ? productIncome : productExpense);
      if (lineAccountId) {
        row.normalized.line_account_id = lineAccountId;
      } else if (!hasErrors(row)) {
        row.issues.push(err(
          'line_account_missing',
          isInvoice
            ? 'Each line needs an income account — name one in the file or use a product that has one.'
            : 'Each line needs an expense account — name one in the file or use a product that has one.',
          shape.lineAccountField,
        ));
      }

      if (productIsStock && isInvoice && !inventoryRole) {
        row.issues.push(err('missing_role_account', 'Selling stock requires the Inventory control account to be mapped under Chart of Accounts.'));
      }

      // Quantity / price / amount.
      const qtyRaw = amt(row, 'quantity');
      const priceRaw = amt(row, shape.priceField);
      const lineAmount = amt(row, 'line_amount');
      let quantity = qtyRaw ?? 1;
      let unitPrice = priceRaw;
      if (unitPrice == null && lineAmount != null) {
        if (qtyRaw != null && qtyRaw !== 0) {
          unitPrice = lineAmount / qtyRaw;
        } else {
          quantity = 1;
          unitPrice = lineAmount;
        }
      }
      if (unitPrice == null && productPrice != null) unitPrice = productPrice;
      if (quantity <= 0) {
        row.issues.push(err('bad_quantity', 'Quantity must be greater than zero.', 'quantity'));
      }
      if (unitPrice == null) {
        row.issues.push(err('price_missing', `Each line needs a ${isInvoice ? 'unit price' : 'unit cost'} or a line amount.`, shape.priceField));
      } else if (unitPrice < 0) {
        row.issues.push(err('negative_price', `A negative line cannot be imported — use a ${isInvoice ? 'credit note' : 'supplier credit'} instead.`, shape.priceField));
      } else {
        row.normalized.quantity = quantity;
        // Keep four decimals on unit prices (derived prices can repeat).
        row.normalized.unit_price = Math.round(unitPrice * 10000) / 10000;
      }

      // Tax.
      const taxName = str(row, 'tax_rate');
      if (taxName) {
        const match = ctx.resolver.taxRate(taxName);
        if (match.kind === 'found') {
          row.normalized.tax_rate_id = match.value.id;
          if (!taxRole) {
            row.issues.push(err('missing_role_account', isInvoice
              ? 'VAT on invoices needs a VAT Output or VAT Control account mapped under Chart of Accounts.'
              : 'VAT on bills needs a VAT Input or VAT Control account mapped under Chart of Accounts.'));
          }
          const given = amt(row, 'tax_amount');
          if (given != null && unitPrice != null && quantity > 0) {
            const expected = roundMoney((quantity * unitPrice) * match.value.rate / 100);
            if (Math.abs(expected - given) > 0.02) {
              row.issues.push(warn('tax_mismatch', `The VAT amount ${given.toFixed(2)} differs from the calculated ${expected.toFixed(2)} at ${match.value.rate}%. The calculated amount will be posted.`, 'tax_amount'));
            }
          }
        } else if (match.kind === 'ambiguous') {
          row.issues.push(err('tax_ambiguous', `Tax rate "${taxName}" matches more than one rate: ${match.candidates.join('; ')}.`, 'tax_rate'));
        } else {
          row.issues.push(err('tax_not_found', `Tax rate "${taxName}" was not found. Create it under Tax Rates first, or use a percentage that matches an existing rate.`, 'tax_rate'));
        }
      } else if (amt(row, 'tax_amount')) {
        row.issues.push(warn('tax_amount_ignored', 'A VAT amount was given without a tax rate; the line will be imported without VAT.', 'tax_amount'));
      }

      const projectName = str(row, 'project');
      if (projectName) {
        const match = ctx.resolver.project(projectName);
        if (match.kind === 'found') row.normalized.project_id = match.value.id;
        else row.issues.push(err('project_not_found', `Project "${projectName}" was not found.`, 'project'));
      }
    }

    for (const row of groupRowsList) {
      if (row.planned_action !== 'skip' && !hasErrors(row)) row.planned_action = 'create';
    }
  }
}

async function ensureParty(
  ctx: CommitContext,
  table: 'customers' | 'vendors',
  name: string,
): Promise<string> {
  const key = `${table}:${name.toLowerCase().trim()}`;
  const cached = ctx.createdParties.get(key);
  if (cached) return cached;
  const existing = table === 'customers' ? ctx.resolver.customer(name) : ctx.resolver.vendor(name);
  if (existing.kind === 'found') {
    ctx.createdParties.set(key, existing.value.id);
    return existing.value.id;
  }
  const created = await ctx.db.insert(table, { company_id: ctx.companyId, name });
  ctx.createdParties.set(key, created.id);
  return created.id;
}

function planDocumentCommit(rows: CommitRowInput[], shape: DocumentShape): CommitUnit[] {
  const isInvoice = shape.entity === 'invoices';
  const groups = new Map<string, CommitRowInput[]>();
  for (const row of rows) {
    const key = row.group_key ?? `row:${row.row_number}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()].map(([groupKey, groupList]) => ({
    rows: groupList,
    execute: async (ctx: CommitContext): Promise<Map<string, UnitOutcome>> => {
      const first = groupList[0];
      if (first.planned_action === 'skip') {
        return uniformOutcome(groupList, { outcome: 'skipped', detail: { id: nstr(first, 'existing_id') } });
      }
      const docNumber = nstr(first, shape.numberField);
      const docDate = nstr(first, 'doc_date');
      const dueDate = nstr(first, 'doc_due_date') ?? docDate;
      if (!docNumber || !docDate) throw new Error('The document number or date is missing.');

      let partyId = nstr(first, 'party_id');
      if (!partyId) {
        const newName = nstr(first, 'new_party_name');
        if (!newName) throw new Error(`The ${shape.partyLabel.toLowerCase()} could not be resolved.`);
        partyId = await ensureParty(ctx, isInvoice ? 'customers' : 'vendors', newName);
      }

      const control = ctx.resolver.accountByRole(isInvoice ? 'trade_receivable' : 'trade_payable');
      if (!control) throw new Error('The receivables/payables control account is not mapped.');
      const anyTax = groupList.some(r => nstr(r, 'tax_rate_id'));
      const taxControl = anyTax
        ? vatAccount(ctx.resolver, isInvoice)
        : null;
      if (anyTax && !taxControl) throw new Error('The VAT control account is not mapped.');

      const items = groupList.map(r => {
        const base: Record<string, unknown> = {
          quantity: nnum(r, 'quantity') ?? 1,
          description: nstr(r, 'line_description') ?? nstr(r, 'document_description') ?? docNumber,
        };
        const productId = nstr(r, 'product_id');
        if (productId) base.product_id = productId;
        const taxId = nstr(r, 'tax_rate_id');
        if (taxId) base.tax_rate_id = taxId;
        const projectId = nstr(r, 'project_id');
        if (projectId) base.project_id = projectId;
        if (isInvoice) {
          base.income_account_id = nstr(r, 'line_account_id');
          base.unit_price = nnum(r, 'unit_price');
        } else {
          base.expense_account_id = nstr(r, 'line_account_id');
          base.unit_cost = nnum(r, 'unit_price');
        }
        return base;
      });

      const idempotencyKey = importIdempotencyKey(ctx.runId, `${isInvoice ? 'inv' : 'bill'}:${groupKey}`);
      const description = nstr(first, 'document_description') ?? `Imported ${shape.docLabel.toLowerCase()} ${docNumber}`;

      if (isInvoice) {
        const inventoryRole = ctx.resolver.accountByRole('inventory_asset');
        const invoiceId = await ctx.db.rpc<string>('post_sales_invoice_atomic', {
          p_company_id: ctx.companyId,
          p_customer_id: partyId,
          p_invoice_date: docDate,
          p_due_date: dueDate,
          p_invoice_number: docNumber,
          p_ar_account_id: control.id,
          p_inventory_asset_account_id: inventoryRole?.id ?? null,
          p_tax_payable_account_id: taxControl?.id ?? null,
          p_description: description,
          p_items: items,
          p_notes: null,
          p_actor_user_id: ctx.actorUserId,
          p_idempotency_key: idempotencyKey,
        });
        return uniformOutcome(groupList, { outcome: 'imported', detail: { id: invoiceId, document_number: docNumber } });
      }

      const result = await ctx.db.rpc<{ bill_id?: string; journal_id?: string; posting_status?: string }>(
        'record_bill_with_taxes',
        {
          p_company_id: ctx.companyId,
          p_vendor_id: partyId,
          p_bill_date: docDate,
          p_due_date: dueDate,
          p_bill_number: docNumber,
          p_accounts_payable_id: control.id,
          p_tax_receivable_account_id: taxControl?.id ?? null,
          p_description: description,
          p_items: items,
          p_idempotency_key: idempotencyKey,
        },
      );
      return uniformOutcome(groupList, {
        outcome: 'imported',
        detail: { id: result?.bill_id, journal_id: result?.journal_id, document_number: docNumber },
      });
    },
  }));
}

export function validateInvoices(rows: WorkRow[], ctx: ValidateContext): void {
  validateDocuments(rows, ctx, INVOICE_SHAPE);
}
export function validateBills(rows: WorkRow[], ctx: ValidateContext): void {
  validateDocuments(rows, ctx, BILL_SHAPE);
}
export function planInvoiceCommit(rows: CommitRowInput[]): CommitUnit[] {
  return planDocumentCommit(rows, INVOICE_SHAPE);
}
export function planBillCommit(rows: CommitRowInput[]): CommitUnit[] {
  return planDocumentCommit(rows, BILL_SHAPE);
}
