/**
 * Bank transaction imports: statement lines for one bank account, inserted
 * through create_bank_statement_import_atomic so reconciliation sees them
 * exactly as a manually captured statement. Duplicate protection rides on
 * the (bank_account_id, external_reference) uniqueness; lines without a
 * bank reference get a deterministic fallback so re-importing the same file
 * cannot double them, while identical lines WITHIN one file are preserved.
 */

import { roundMoney } from '../normalize.ts';
import {
  type ValidateContext,
  type WorkRow,
  addRunIssue,
  amt,
  err,
  fnv1a,
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
} from './db.ts';

export function validateBankTransactions(rows: WorkRow[], ctx: ValidateContext): void {
  const bankAccountId = typeof ctx.options.bank_account_id === 'string' ? ctx.options.bank_account_id : null;
  if (!bankAccountId) {
    addRunIssue(ctx, err('bank_account_required', 'Choose which bank account these transactions belong to.'));
  } else if (!ctx.resolver.refs.bankAccounts.some(b => b.id === bankAccountId)) {
    addRunIssue(ctx, err('bank_account_unknown', 'The chosen bank account no longer exists.'));
  }

  // Count identical (date, amount, description) lines so fallback references
  // stay unique inside the file but identical across re-imports of the file.
  const occurrence = new Map<string, number>();

  for (const row of rows) {
    if (row.blank) continue;
    if (!bankAccountId) row.issues.push(err('bank_account_required', 'No bank account chosen for this import.'));

    const signed = amt(row, 'amount');
    const moneyIn = amt(row, 'money_in');
    const moneyOut = amt(row, 'money_out');
    let amount: number | null = null;
    if (signed != null && (moneyIn != null || moneyOut != null)) {
      row.issues.push(err('amount_conflict', 'Map either a single signed amount column or the money in/out columns, not both.', 'amount'));
    } else if (signed != null) {
      amount = signed;
    } else if (moneyIn != null || moneyOut != null) {
      const inAmt = moneyIn ?? 0;
      const outAmt = moneyOut ?? 0;
      if (inAmt !== 0 && outAmt !== 0) {
        row.issues.push(err('amount_conflict', 'A line cannot have both money in and money out.', 'money_in'));
      } else {
        amount = inAmt !== 0 ? Math.abs(inAmt) : -Math.abs(outAmt);
      }
    } else {
      row.issues.push(err('amount_missing', 'Each line needs an amount (signed), or a money in / money out value.', 'amount'));
    }
    if (amount != null) {
      if (amount === 0) {
        row.issues.push(err('zero_amount', 'A zero-value line cannot be imported.', 'amount'));
      } else {
        row.normalized.amount = roundMoney(amount);
      }
    }

    const date = str(row, 'line_date');
    const description = str(row, 'description');
    if (date && description && amount != null) {
      let reference = str(row, 'external_reference');
      if (!reference) {
        const identity = `${date}|${roundMoney(amount).toFixed(2)}|${description.toLowerCase()}`;
        const n = (occurrence.get(identity) ?? 0) + 1;
        occurrence.set(identity, n);
        reference = `imp-${fnv1a(identity)}-${n}`;
        row.normalized.generated_reference = true;
      }
      row.normalized.external_reference = reference;
      if (ctx.existingBankRefs.has(reference)) {
        row.planned_action = 'skip';
        row.issues.push(warn('duplicate_existing', 'This line was imported before (same bank reference) and will be skipped.'));
      }
    }

    if (!hasErrors(row) && row.planned_action !== 'skip') row.planned_action = 'create';
  }

  const generated = rows.filter(r => r.normalized.generated_reference === true).length;
  if (generated > 0) {
    addRunIssue(ctx, warn(
      'generated_references',
      `${generated} line(s) have no bank reference. A fingerprint of date, amount and description stands in, so re-importing this file will not duplicate them — but a genuinely identical transaction in a FUTURE file would be skipped. Include the bank's reference column when you can.`,
    ));
  }
}

export function planBankCommit(rows: CommitRowInput[]): CommitUnit[] {
  const toInsert = rows.filter(r => r.planned_action === 'create');
  const toSkip = rows.filter(r => r.planned_action !== 'create');
  if (rows.length === 0) return [];

  // One statement import for the whole file: all-or-nothing insert, with the
  // database's own reference uniqueness as the last line of defence.
  return [{
    rows,
    execute: async (ctx: CommitContext): Promise<Map<string, UnitOutcome>> => {
      const outcomes = new Map<string, UnitOutcome>();
      for (const row of toSkip) {
        outcomes.set(row.id, { outcome: 'skipped', detail: { reason: 'duplicate bank reference' } });
      }
      if (toInsert.length === 0) return outcomes;

      const bankAccountId = String(ctx.options.bank_account_id);
      const lines = toInsert.map(r => ({
        line_date: nstr(r, 'line_date'),
        description: nstr(r, 'description'),
        amount: nnum(r, 'amount'),
        external_reference: nstr(r, 'external_reference'),
      }));
      const dates = lines.map(l => l.line_date!).sort();
      const result = await ctx.db.rpc<{ import_id?: string; inserted_count?: number; duplicate_count?: number }>(
        'create_bank_statement_import_atomic',
        {
          p_company_id: ctx.companyId,
          p_bank_account_id: bankAccountId,
          p_period_start: dates[0],
          p_period_end: dates[dates.length - 1],
          p_opening_balance: ctx.options.opening_balance ?? 0,
          p_closing_balance: ctx.options.closing_balance ?? 0,
          p_file_name: `import:${ctx.runId}`,
          p_lines: lines,
          p_actor_user_id: ctx.actorUserId,
        },
      );
      const duplicates = result?.duplicate_count ?? 0;
      for (const row of toInsert) {
        outcomes.set(row.id, {
          outcome: 'imported',
          detail: { statement_import_id: result?.import_id },
        });
      }
      if (duplicates > 0) {
        // The database skipped lines whose reference raced in since validation.
        outcomes.set(toInsert[0].id, {
          outcome: 'imported',
          detail: { statement_import_id: result?.import_id, note: `${duplicates} line(s) were already present and were skipped by the bank reference check.` },
        });
      }
      return outcomes;
    },
  }];
}
