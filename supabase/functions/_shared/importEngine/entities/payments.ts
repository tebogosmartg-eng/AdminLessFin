/**
 * Payment imports: money received from customers and money paid to
 * suppliers. One row is one payment. Allocation to a named invoice/bill goes
 * through the same allocation RPCs the payment screens use; without a
 * document number the payment sits on the party's account.
 */

import { importIdempotencyKey } from '../types.ts';
import {
  type ValidateContext,
  type WorkRow,
  addRunIssue,
  amt,
  checkPeriodOpen,
  err,
  hasErrors,
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

function validatePayments(rows: WorkRow[], ctx: ValidateContext, isCustomer: boolean): void {
  const controlRole = ctx.resolver.accountByRole(isCustomer ? 'trade_receivable' : 'trade_payable');
  if (!controlRole) {
    addRunIssue(ctx, err(
      'missing_role_account',
      isCustomer
        ? 'No account is mapped as the Trade Receivables control account. Map it under Chart of Accounts before importing customer payments.'
        : 'No account is mapped as the Trade Payables control account. Map it under Chart of Accounts before importing supplier payments.',
    ));
  }
  const accountField = isCustomer ? 'deposit_account' : 'payment_account';
  const defaultAccountId = typeof ctx.options[isCustomer ? 'default_deposit_account_id' : 'default_payment_account_id'] === 'string'
    ? String(ctx.options[isCustomer ? 'default_deposit_account_id' : 'default_payment_account_id'])
    : null;

  for (const row of rows) {
    if (row.blank) continue;
    if (!controlRole) row.issues.push(err('missing_role_account', 'The receivables/payables control account is not mapped.'));

    const amount = amt(row, 'amount');
    if (amount != null && amount <= 0) {
      row.issues.push(err('bad_amount', 'The payment amount must be greater than zero.', 'amount'));
    }
    checkPeriodOpen(ctx, row, 'payment_date');

    // The money account: named per row, or the default chosen for the file.
    const accountName = str(row, accountField);
    if (accountName) {
      const match = ctx.resolver.account(accountName);
      if (match.kind === 'missing') {
        row.issues.push(err('account_not_found', `Account "${accountName}" was not found.`, accountField));
      } else if (match.kind === 'ambiguous') {
        row.issues.push(err('account_ambiguous', `Account "${accountName}" matches more than one account: ${match.candidates.join('; ')}.`, accountField));
      } else if (match.value.type !== 'Asset') {
        row.issues.push(err('account_wrong_type', `"${match.value.name}" is a ${match.value.type} account; the money account must be a bank or cash (Asset) account.`, accountField));
      } else if (!match.value.is_active || match.value.posting_blocked) {
        row.issues.push(err('account_unpostable', `"${match.value.name}" cannot be posted to.`, accountField));
      } else {
        row.normalized.money_account_id = match.value.id;
      }
    } else if (defaultAccountId) {
      row.normalized.money_account_id = defaultAccountId;
    } else {
      row.issues.push(err('money_account_missing', `Each payment needs a ${isCustomer ? '"deposited into"' : '"paid from"'} account — name one in the file or choose a default for the whole import.`, accountField));
    }

    // Party.
    const partyName = str(row, isCustomer ? 'customer' : 'vendor');
    if (partyName) {
      const match = isCustomer ? ctx.resolver.customer(partyName) : ctx.resolver.vendor(partyName);
      if (match.kind === 'found') {
        row.normalized.party_id = match.value.id;
      } else if (match.kind === 'ambiguous') {
        row.issues.push(err('party_ambiguous', `"${partyName}" matches more than one record: ${match.candidates.join('; ')}.`));
      } else {
        row.issues.push(err('party_not_found', `${isCustomer ? 'Customer' : 'Supplier'} "${partyName}" was not found. Import ${isCustomer ? 'customers' : 'suppliers'} first.`));
      }
    }

    // Optional allocation target.
    const docField = isCustomer ? 'invoice_number' : 'bill_number';
    const docNumber = str(row, docField);
    if (docNumber) {
      const doc = isCustomer ? ctx.resolver.invoiceByNumber(docNumber) : ctx.resolver.billByNumber(docNumber);
      if (!doc) {
        row.issues.push(err('document_not_found', `${isCustomer ? 'Invoice' : 'Bill'} "${docNumber}" was not found. Import it first, or clear the column to hold the payment on account.`, docField));
      } else {
        const partyId = row.normalized.party_id;
        const docPartyId = isCustomer
          ? (doc as { customer_id: string }).customer_id
          : (doc as { vendor_id: string }).vendor_id;
        if (partyId && docPartyId !== partyId) {
          row.issues.push(err('document_wrong_party', `${isCustomer ? 'Invoice' : 'Bill'} "${docNumber}" belongs to a different ${isCustomer ? 'customer' : 'supplier'}.`, docField));
        } else {
          row.normalized.document_id = doc.id;
        }
        if (isCustomer) {
          const status = (doc as { status?: string | null }).status;
          if (status === 'paid') {
            row.normalized.already_paid = true;
            row.issues.push(warn('already_paid', `Invoice "${docNumber}" is already marked paid; the payment will sit on the customer's account for review.`, docField));
          }
        }
      }
    } else if (!isCustomer) {
      row.issues.push(warn('on_account', 'No bill number given — the payment will be held on the supplier’s account.', docField));
    }

    if (!hasErrors(row)) row.planned_action = 'create';
  }
}

function planPaymentsCommit(rows: CommitRowInput[], isCustomer: boolean): CommitUnit[] {
  return rows.map(row => ({
    rows: [row],
    execute: async (ctx: CommitContext): Promise<Map<string, UnitOutcome>> => {
      if (row.planned_action === 'skip') {
        return uniformOutcome([row], { outcome: 'skipped' });
      }
      const partyId = nstr(row, 'party_id');
      const moneyAccountId = nstr(row, 'money_account_id');
      const paymentDate = nstr(row, 'payment_date');
      const amount = nnum(row, 'amount');
      if (!partyId || !moneyAccountId || !paymentDate || amount == null) {
        throw new Error('The payment row is incomplete.');
      }
      const control = ctx.resolver.accountByRole(isCustomer ? 'trade_receivable' : 'trade_payable');
      if (!control) throw new Error('The receivables/payables control account is not mapped.');
      const reference = nstr(row, 'reference');
      const documentId = nstr(row, 'document_id');
      const idempotencyKey = importIdempotencyKey(ctx.runId, `row:${row.row_number}`);

      if (isCustomer) {
        const invoiceIsPaid = row.normalized.already_paid === true;
        const allocations = documentId && !invoiceIsPaid ? [{ invoice_id: documentId, amount }] : [];
        const result = await ctx.db.rpc<{ journal_id?: string; posting_status?: string }>(
          'record_customer_receipt_atomic',
          {
            p_company_id: ctx.companyId,
            p_customer_id: partyId,
            p_payment_date: paymentDate,
            p_deposit_account_id: moneyAccountId,
            p_amount: amount,
            p_allocations: ctx.options.allocate_to_oldest && !documentId ? null : allocations,
            p_description: reference ?? 'Imported customer payment',
            p_idempotency_key: idempotencyKey,
            p_actor_user_id: ctx.actorUserId,
            p_accounts_receivable_id: control.id,
          },
        );
        return uniformOutcome([row], { outcome: 'imported', detail: { journal_id: result?.journal_id } });
      }

      if (documentId) {
        const result = await ctx.db.rpc<{ journal_id?: string }>('pay_specific_bill', {
          p_company_id: ctx.companyId,
          p_bill_id: documentId,
          p_payment_date: paymentDate,
          p_payment_account_id: moneyAccountId,
          p_ap_account_id: control.id,
          p_amount: amount,
          p_actor_user_id: ctx.actorUserId,
        });
        return uniformOutcome([row], { outcome: 'imported', detail: { journal_id: (result as { journal_id?: string })?.journal_id } });
      }

      const result = await ctx.db.rpc<{ journal_id?: string }>('record_vendor_payment_on_account_atomic', {
        p_company_id: ctx.companyId,
        p_vendor_id: partyId,
        p_payment_date: paymentDate,
        p_payment_account_id: moneyAccountId,
        p_accounts_payable_id: control.id,
        p_amount: amount,
        p_description: reference ?? 'Imported supplier payment',
        p_idempotency_key: idempotencyKey,
        p_actor_user_id: ctx.actorUserId,
      });
      return uniformOutcome([row], { outcome: 'imported', detail: { journal_id: (result as { journal_id?: string })?.journal_id } });
    },
  }));
}

export function validateCustomerPayments(rows: WorkRow[], ctx: ValidateContext): void {
  validatePayments(rows, ctx, true);
}
export function validateSupplierPayments(rows: WorkRow[], ctx: ValidateContext): void {
  validatePayments(rows, ctx, false);
}
export function planCustomerPaymentCommit(rows: CommitRowInput[]): CommitUnit[] {
  return planPaymentsCommit(rows, true);
}
export function planSupplierPaymentCommit(rows: CommitRowInput[]): CommitUnit[] {
  return planPaymentsCommit(rows, false);
}
