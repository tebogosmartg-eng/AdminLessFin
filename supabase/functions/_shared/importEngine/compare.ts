/**
 * "Does it match my old system?" — compares a trial balance exported from
 * the previous accounting system with this ledger as at the same date.
 * Read-only by construction: it takes balances in and returns differences.
 */

import { applyMapping, normNumber, normText, roundMoney } from './normalize.ts';
import type { Resolver } from './resolve.ts';
import type { RawRow } from './types.ts';

export const TB_COMPARE_FIELDS = [
  { key: 'account', label: 'Account', required: true, aliases: ['account', 'account name', 'account description', 'description', 'ledger account', 'gl account', 'name'] },
  { key: 'account_code', label: 'Account code', required: false, aliases: ['account code', 'account number', 'code', 'account no', 'nominal code', 'gl code'] },
  { key: 'debit', label: 'Debit', required: false, aliases: ['debit', 'debits', 'dr', 'debit balance', 'closing debit', 'balance debit'] },
  { key: 'credit', label: 'Credit', required: false, aliases: ['credit', 'credits', 'cr', 'credit balance', 'closing credit', 'balance credit'] },
  { key: 'balance', label: 'Balance', required: false, aliases: ['balance', 'closing balance', 'net balance', 'amount'], help: 'Signed: debit positive, credit negative' },
];

export interface LedgerBalance {
  account_id: string;
  /** Debit minus credit, as at the comparison date. */
  net: number;
}

export type CompareStatus = 'match' | 'differs' | 'not_found' | 'ambiguous' | 'only_here';

export interface CompareLine {
  row_number: number | null;
  label: string;
  account_id: string | null;
  account_name: string | null;
  old_net: number | null;
  new_net: number | null;
  difference: number | null;
  status: CompareStatus;
  note?: string;
}

export interface CompareResult {
  lines: CompareLine[];
  old_total_debit: number;
  old_total_credit: number;
  matched: number;
  differs: number;
  unmatched: number;
  only_here: number;
  all_match: boolean;
}

/**
 * Lines that cannot be read are reported, never dropped. Several file lines
 * naming one account are summed (exports often split an account by
 * department or sub-account).
 */
export function compareTrialBalance(input: {
  rows: Array<{ row_number: number; raw: RawRow }>;
  mapping: Record<string, string>;
  resolver: Resolver;
  ledger: LedgerBalance[];
}): CompareResult {
  const lines: CompareLine[] = [];
  const oldByAccount = new Map<string, { net: number; rows: number[]; label: string }>();
  let oldDebit = 0;
  let oldCredit = 0;

  for (const row of input.rows) {
    const record = applyMapping(row.raw, input.mapping);
    const name = normText(record.account ?? null);
    const code = normText(record.account_code ?? null);
    const label = [code, name].filter(Boolean).join(' ') || `Row ${row.row_number}`;
    const debit = normNumber(record.debit ?? null) ?? 0;
    const credit = normNumber(record.credit ?? null) ?? 0;
    const balance = normNumber(record.balance ?? null);
    if (!name && !code) continue;
    const net = roundMoney(balance != null && debit === 0 && credit === 0 ? balance : debit - credit);
    if (net === 0 && balance == null && debit === 0 && credit === 0) {
      // Headings and subtotal lines carry no figures.
      continue;
    }
    if (net > 0) oldDebit += net;
    else oldCredit -= net;

    const match = code ? input.resolver.account(code) : { kind: 'missing' as const };
    const resolved = match.kind === 'found' ? match : name ? input.resolver.account(name) : match;
    if (resolved.kind === 'ambiguous') {
      lines.push({ row_number: row.row_number, label, account_id: null, account_name: null, old_net: net, new_net: null, difference: null, status: 'ambiguous', note: `Matches more than one account: ${resolved.candidates.join('; ')}` });
      continue;
    }
    if (resolved.kind === 'missing') {
      lines.push({ row_number: row.row_number, label, account_id: null, account_name: null, old_net: net, new_net: null, difference: null, status: 'not_found', note: 'No account with this name or code here.' });
      continue;
    }
    const existing = oldByAccount.get(resolved.value.id);
    if (existing) {
      existing.net = roundMoney(existing.net + net);
      existing.rows.push(row.row_number);
    } else {
      oldByAccount.set(resolved.value.id, { net, rows: [row.row_number], label });
    }
  }

  const names = new Map(input.resolver.refs.accounts.map(a => [a.id, a.name]));
  const ledger = new Map(input.ledger.map(l => [l.account_id, roundMoney(l.net)]));
  for (const [accountId, old] of oldByAccount) {
    const current = ledger.get(accountId) ?? 0;
    const difference = roundMoney(current - old.net);
    lines.push({
      row_number: old.rows[0],
      label: old.label,
      account_id: accountId,
      account_name: names.get(accountId) ?? null,
      old_net: old.net,
      new_net: current,
      difference,
      status: Math.abs(difference) < 0.005 ? 'match' : 'differs',
      note: old.rows.length > 1 ? `Rows ${old.rows.join(', ')} combined.` : undefined,
    });
  }
  for (const [accountId, net] of ledger) {
    if (oldByAccount.has(accountId) || Math.abs(net) < 0.005) continue;
    lines.push({
      row_number: null,
      label: names.get(accountId) ?? 'Unknown account',
      account_id: accountId,
      account_name: names.get(accountId) ?? null,
      old_net: null,
      new_net: net,
      difference: net,
      status: 'only_here',
      note: 'Has a balance here but is not in the file.',
    });
  }

  const order: Record<CompareStatus, number> = { differs: 0, not_found: 1, ambiguous: 2, only_here: 3, match: 4 };
  lines.sort((a, b) => order[a.status] - order[b.status] || a.label.localeCompare(b.label));
  const count = (s: CompareStatus) => lines.filter(l => l.status === s).length;
  return {
    lines,
    old_total_debit: roundMoney(oldDebit),
    old_total_credit: roundMoney(oldCredit),
    matched: count('match'),
    differs: count('differs'),
    unmatched: count('not_found') + count('ambiguous'),
    only_here: count('only_here'),
    all_match: count('differs') + count('not_found') + count('ambiguous') + count('only_here') === 0,
  };
}

/** Ledger rows from get_balances_as_of_date are type-signed; make them debit-minus-credit. */
export function ledgerFromTypeSigned(rows: Array<{ id: string; type: string; balance: number | string | null }>): LedgerBalance[] {
  return rows.map(r => {
    const balance = Number(r.balance ?? 0);
    const debitNormal = r.type === 'Asset' || r.type === 'Expense';
    return { account_id: r.id, net: roundMoney(debitNormal ? balance : -balance) };
  });
}
