/**
 * Journal entry and opening balance imports. Both post exclusively through
 * posting_engine_submit under the manual_journal module — the engine's
 * balance check, period lock, control-account rules and policy evaluation
 * all apply, and the import refuses up front what the engine would refuse.
 *
 * Opening balances additionally:
 *  - refuse AR/AP control accounts (open invoices and bills carry those
 *    balances so the subledgers reconcile);
 *  - refuse bank-linked GL accounts (the Banking opening-balance flow posts
 *    those and marks the bank account);
 *  - balance any difference to a chosen balancing account, or to an
 *    "Opening Balance Equity" account the import creates on demand.
 */

import { roundMoney } from '../normalize.ts';
import { importIdempotencyKey } from '../types.ts';
import type { AccountRef } from '../types.ts';
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

function resolvePostableAccount(row: WorkRow, ctx: ValidateContext): AccountRef | null {
  const value = str(row, 'account');
  if (!value) return null;
  const match = ctx.resolver.account(value);
  if (match.kind === 'missing') {
    row.issues.push(err('account_not_found', `Account "${value}" was not found in the chart of accounts.`, 'account'));
    return null;
  }
  if (match.kind === 'ambiguous') {
    row.issues.push(err('account_ambiguous', `Account "${value}" matches more than one account: ${match.candidates.join('; ')}.`, 'account'));
    return null;
  }
  const account = match.value;
  if (!account.is_active) {
    row.issues.push(err('account_inactive', `Account "${account.name}" is inactive.`, 'account'));
    return null;
  }
  if (account.posting_blocked) {
    row.issues.push(err('account_unpostable', `Account "${account.name}" is blocked for posting.`, 'account'));
    return null;
  }
  if (account.control_account && !account.allow_manual_posting) {
    row.issues.push(err('control_account', `"${account.name}" is a control account. Import the underlying documents (invoices, bills, payments) instead of journal lines.`, 'account'));
    return null;
  }
  return account;
}

function readDebitCredit(row: WorkRow, zeroAllowed = false): { debit: number; credit: number } | null {
  const debit = amt(row, 'debit');
  const credit = amt(row, 'credit');
  const d = debit ?? 0;
  const c = credit ?? 0;
  if (d === 0 && c === 0) {
    if (zeroAllowed) return { debit: 0, credit: 0 };
    row.issues.push(err('amount_missing', 'Each line needs a debit or a credit amount.', 'debit'));
    return null;
  }
  if (d !== 0 && c !== 0) {
    row.issues.push(err('both_sides', 'A line cannot carry both a debit and a credit.', 'debit'));
    return null;
  }
  if (d < 0 || c < 0) {
    row.issues.push(err('negative_amount', 'Amounts must be positive — put the value in the other column instead of using a minus sign.', d < 0 ? 'debit' : 'credit'));
    return null;
  }
  return { debit: roundMoney(d), credit: roundMoney(c) };
}

// ── Journal entries ─────────────────────────────────────────────────────────

export function validateJournalEntries(rows: WorkRow[], ctx: ValidateContext): void {
  const groups = groupRows(rows, r => {
    const reference = str(r, 'reference');
    if (reference) return `ref:${groupKeyOf(reference)}`;
    const date = str(r, 'entry_date');
    const description = str(r, 'description');
    if (!date || !description) return null;
    return `dd:${date}|${groupKeyOf(description)}`;
  });

  for (const [, groupList] of groups) {
    let totalDebit = 0;
    let totalCredit = 0;
    let amountsComplete = true;

    const firstDate = str(groupList[0], 'entry_date');
    for (const row of groupList) {
      const date = str(row, 'entry_date');
      if (date && firstDate && date !== firstDate) {
        row.issues.push(err('inconsistent_group', `Rows of journal "${str(row, 'reference') ?? ''}" carry different dates (${date} vs ${firstDate}).`, 'entry_date'));
      }
      checkPeriodOpen(ctx, row, 'entry_date');

      const account = resolvePostableAccount(row, ctx);
      if (account) row.normalized.account_id = account.id;

      const sides = readDebitCredit(row);
      if (sides) {
        totalDebit += sides.debit;
        totalCredit += sides.credit;
        row.normalized.debit = sides.debit;
        row.normalized.credit = sides.credit;
      } else {
        amountsComplete = false;
      }

      for (const [field, kind] of [['customer', 'customer'], ['vendor', 'vendor'], ['project', 'project']] as const) {
        const name = str(row, field);
        if (!name) continue;
        const match = kind === 'customer' ? ctx.resolver.customer(name)
          : kind === 'vendor' ? ctx.resolver.vendor(name)
          : ctx.resolver.project(name);
        if (match.kind === 'found') row.normalized[`${field}_id`] = match.value.id;
        else row.issues.push(err(`${kind}_not_found`, `${field === 'vendor' ? 'Supplier' : field[0].toUpperCase() + field.slice(1)} "${name}" was not found.`, field));
      }
    }

    if (amountsComplete && Math.abs(roundMoney(totalDebit) - roundMoney(totalCredit)) > 0.01) {
      issueAll(groupList, err(
        'unbalanced',
        `This journal does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}.`,
      ));
    }

    if (groupList.length === 1) {
      groupList[0].issues.push(err('single_line', 'A journal needs at least a debit line and a credit line. Give both rows the same reference (or the same date and description).'));
    }

    // Possible duplicate of an existing journal: same date, description, total.
    const description = str(groupList[0], 'description');
    if (firstDate && description && amountsComplete) {
      const total = roundMoney(totalDebit);
      const existing = ctx.resolver.refs.existingJournals.some(j =>
        j.entry_date === firstDate &&
        (j.description ?? '').trim().toLowerCase() === description.trim().toLowerCase() &&
        Math.abs(j.total - total) <= 0.01);
      if (existing) {
        groupList[0].issues.push(warn('possible_duplicate', `A journal with this date, description and total already exists. It will still be imported — delete one afterwards if it is a true duplicate.`));
      }
    }

    for (const row of groupList) {
      if (!hasErrors(row)) row.planned_action = 'create';
    }
  }
}

export function planJournalCommit(rows: CommitRowInput[]): CommitUnit[] {
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
        return uniformOutcome(groupList, { outcome: 'skipped' });
      }
      const request = {
        company_id: ctx.companyId,
        posting_date: nstr(first, 'entry_date'),
        module: 'manual_journal',
        document_type: 'manual_journal',
        description: nstr(first, 'description'),
        reference: nstr(first, 'reference'),
        source: 'import',
        created_by: ctx.actorUserId,
        customer_id: nstr(first, 'customer_id'),
        vendor_id: nstr(first, 'vendor_id'),
        idempotency_key: importIdempotencyKey(ctx.runId, `je:${groupKey}`),
        lines: groupList.map(r => ({
          account_id: nstr(r, 'account_id'),
          debit: nnum(r, 'debit') ?? 0,
          credit: nnum(r, 'credit') ?? 0,
          description: nstr(r, 'line_description'),
          project_id: nstr(r, 'project_id'),
        })),
      };
      const result = await ctx.db.rpc<{ journal_id?: string; journal_number?: string; posting_status?: string }>(
        'posting_engine_submit',
        { p_request: request, p_mode: 'commit' },
      );
      return uniformOutcome(groupList, {
        outcome: 'imported',
        detail: { journal_id: result?.journal_id, journal_number: result?.journal_number, posting_status: result?.posting_status },
      });
    },
  }));
}

// ── Opening balances ────────────────────────────────────────────────────────
//
// The file is the old system's trial balance as at the take-on date — the
// TARGET. Each account posts only the difference between that target and
// what this ledger already holds on that date, the way Xero's conversion
// balances work. Unpaid invoices and bills imported first keep their detail,
// and their income, VAT and debtors are never counted twice.

function targetNet(row: { normalized: Record<string, unknown> }): number {
  return roundMoney(Number(row.normalized.debit ?? 0) - Number(row.normalized.credit ?? 0));
}

function money(n: number): string {
  return `R ${Math.abs(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Debit or credit to post so an account lands on its target balance. */
export function takeOnDelta(target: number, current: number): { debit: number; credit: number } {
  const delta = roundMoney(target - current);
  return delta >= 0 ? { debit: delta, credit: 0 } : { debit: 0, credit: -delta };
}

export function validateOpeningBalances(rows: WorkRow[], ctx: ValidateContext): void {
  const asAt = typeof ctx.options.as_at_date === 'string' ? ctx.options.as_at_date : null;
  if (!asAt || !/^\d{4}-\d{2}-\d{2}$/.test(asAt)) {
    addRunIssue(ctx, err('as_at_required', 'Choose the take-on date these balances are stated at.'));
  } else if (ctx.closedDates.has(asAt)) {
    addRunIssue(ctx, err('period_locked', `${asAt} falls in a closed or locked accounting period.`));
  }

  const ledger = ctx.ledgerNet ?? new Map<string, number>();
  const bankLinked = ctx.resolver.bankLinkedAccountIds();
  const seen = new Map<string, number>();
  let totalDebit = 0;
  let totalCredit = 0;
  let postDebit = 0;
  let postCredit = 0;
  let complete = true;

  for (const row of rows) {
    if (row.blank) continue;
    const sides = readDebitCredit(row, true);
    if (sides) {
      totalDebit += sides.debit;
      totalCredit += sides.credit;
      row.normalized.debit = sides.debit;
      row.normalized.credit = sides.credit;
    } else {
      complete = false;
    }

    const value = str(row, 'account');
    const match = value ? ctx.resolver.account(value) : null;
    if (match?.kind === 'missing') {
      row.issues.push(err('account_not_found', `Account "${value}" was not found in the chart of accounts. Import the chart of accounts first, or add the account.`, 'account'));
    } else if (match?.kind === 'ambiguous') {
      row.issues.push(err('account_ambiguous', `Account "${value}" matches more than one account: ${match.candidates.join('; ')}.`, 'account'));
    } else if (match?.kind === 'found') {
      const account = match.value;
      row.normalized.account_id = account.id;
      const firstRow = seen.get(account.id);
      if (firstRow != null) {
        row.issues.push(err('duplicate_in_file', `Account "${account.name}" also appears on row ${firstRow}. A trial balance lists each account once.`));
      } else {
        seen.set(account.id, row.row_number);
      }
      if (sides) {
        const current = ledger.get(account.id) ?? 0;
        const post = takeOnDelta(targetNet(row), current);
        row.normalized.post_debit = post.debit;
        row.normalized.post_credit = post.credit;
        const moves = post.debit + post.credit > 0.005;
        const isDebtors = account.account_role === 'trade_receivable';
        const isCreditors = account.account_role === 'trade_payable';
        if ((isDebtors || isCreditors) && moves) {
          row.issues.push(err(
            'subledger_mismatch',
            isDebtors
              ? `Your old system shows ${money(targetNet(row))} owed by customers, but the unpaid invoices imported here come to ${money(current)}. Import the missing unpaid invoices first, then check again.`
              : `Your old system shows ${money(targetNet(row))} owed to suppliers, but the unpaid bills imported here come to ${money(current)}. Import the missing unpaid bills first, then check again.`,
            'account',
          ));
        } else if (bankLinked.has(account.id) && moves) {
          row.issues.push(err(
            'bank_balance_mismatch',
            `"${account.name}" is a bank account holding ${money(current)} here but ${money(targetNet(row))} in your old system. Set the opening balance on the bank account itself (Banking), then check again.`,
            'account',
          ));
        } else if (moves) {
          if (!account.is_active || account.posting_blocked) {
            row.issues.push(err('account_unpostable', `Account "${account.name}" cannot be posted to.`, 'account'));
          } else if (account.control_account && !account.allow_manual_posting) {
            row.issues.push(err('control_account', `"${account.name}" is a control account; its balance must come from the documents behind it.`, 'account'));
          } else {
            postDebit += post.debit;
            postCredit += post.credit;
          }
        } else {
          row.issues.push(warn('already_in_ledger', Math.abs(targetNet(row)) < 0.005
            ? 'Zero balance — nothing to post.'
            : 'Already carried by what you imported earlier — nothing more to post.'));
        }
      }
    }
    if (!hasErrors(row)) row.planned_action = 'create';
  }

  if (complete && Math.abs(roundMoney(totalDebit - totalCredit)) > 0.01) {
    addRunIssue(ctx, warn(
      'tb_unbalanced',
      `This trial balance does not balance: debits ${money(totalDebit)}, credits ${money(totalCredit)}. Check it was exported in full.`,
    ));
  }
  // The balancing figure only means something once every row is accepted.
  if (complete && !rows.some(r => !r.blank && hasErrors(r))) {
    const difference = roundMoney(postDebit - postCredit);
    if (Math.abs(difference) > 0.01) {
      const balancingId = typeof ctx.options.balancing_account_id === 'string' ? ctx.options.balancing_account_id : null;
      const target = balancingId
        ? ctx.resolver.refs.accounts.find(a => a.id === balancingId)?.name ?? 'the chosen balancing account'
        : 'a new "Opening Balance Equity" account';
      addRunIssue(ctx, warn(
        'tb_difference',
        `${money(difference)} will be posted to ${target} to keep the books in balance. This is usually a balance from your old system that is not in this file — move it to the right account afterwards.`,
      ));
    }
  }
}

async function ensureBalancingAccount(ctx: CommitContext): Promise<string> {
  const chosen = typeof ctx.options.balancing_account_id === 'string' ? ctx.options.balancing_account_id : null;
  if (chosen) return chosen;
  const existing = ctx.resolver.refs.accounts.find(
    a => a.name.trim().toLowerCase() === 'opening balance equity' && a.is_active,
  );
  if (existing) return existing.id;
  const created = await ctx.db.insert('chart_of_accounts', {
    company_id: ctx.companyId,
    name: 'Opening Balance Equity',
    type: 'Equity',
    category: 'Equity',
    description: 'Difference arising from imported opening balances. Transfer to the correct equity account.',
    source: 'import',
    is_active: true,
  });
  return created.id;
}

export function planOpeningBalanceCommit(rows: CommitRowInput[]): CommitUnit[] {
  if (rows.length === 0) return [];
  return [{
    rows,
    execute: async (ctx: CommitContext): Promise<Map<string, UnitOutcome>> => {
      const postable = rows.filter(r => r.planned_action === 'create');
      const outcomes = new Map<string, UnitOutcome>();
      for (const row of rows) {
        if (row.planned_action !== 'create') outcomes.set(row.id, { outcome: 'skipped' });
      }
      if (postable.length === 0) return outcomes;

      const asAt = String(ctx.options.as_at_date);
      const ledger = ctx.ledgerNet ?? new Map<string, number>();
      const bankLinked = ctx.resolver.bankLinkedAccountIds();
      const lines: Array<{ account_id: string | null; debit: number; credit: number; description: string }> = [];
      const posting = new Set<string>();
      for (const r of postable) {
        const accountId = nstr(r, 'account_id');
        if (!accountId) continue;
        const post = takeOnDelta(targetNet(r), ledger.get(accountId) ?? 0);
        if (post.debit + post.credit <= 0.005) continue;
        posting.add(r.id);
        const account = ctx.resolver.refs.accounts.find(a => a.id === accountId);
        if (account?.account_role === 'trade_receivable' || account?.account_role === 'trade_payable' || bankLinked.has(accountId)) {
          throw new Error(`The books changed since this file was checked ("${account?.name}" no longer matches). Check the file again.`);
        }
        lines.push({ account_id: accountId, debit: post.debit, credit: post.credit, description: 'Opening balance take-on' });
      }
      if (lines.length === 0) {
        for (const row of postable) {
          outcomes.set(row.id, { outcome: 'skipped', detail: { reason: 'Already matches your old system — nothing to post.' } });
        }
        return outcomes;
      }
      const totalDebit = roundMoney(lines.reduce((s, l) => s + l.debit, 0));
      const totalCredit = roundMoney(lines.reduce((s, l) => s + l.credit, 0));
      const difference = roundMoney(totalDebit - totalCredit);
      if (Math.abs(difference) > 0.01) {
        const balancingId = await ensureBalancingAccount(ctx);
        lines.push({
          account_id: balancingId,
          debit: difference < 0 ? Math.abs(difference) : 0,
          credit: difference > 0 ? difference : 0,
          description: 'Opening balance difference',
        });
      }

      const result = await ctx.db.rpc<{ journal_id?: string; journal_number?: string }>(
        'posting_engine_submit',
        {
          p_request: {
            company_id: ctx.companyId,
            posting_date: asAt,
            module: 'manual_journal',
            document_type: 'opening_balance',
            description: `Opening balances as at ${asAt}`,
            source: 'import',
            created_by: ctx.actorUserId,
            idempotency_key: importIdempotencyKey(ctx.runId, 'opening'),
            lines,
          },
          p_mode: 'commit',
        },
      );
      for (const row of postable) {
        outcomes.set(row.id, posting.has(row.id)
          ? { outcome: 'imported', detail: { journal_id: result?.journal_id, journal_number: result?.journal_number } }
          : { outcome: 'skipped', detail: { reason: 'Already matches your old system — nothing to post.', journal_id: result?.journal_id } });
      }
      return outcomes;
    },
  }];
}
