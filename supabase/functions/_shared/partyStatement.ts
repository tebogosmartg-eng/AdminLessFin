/**
 * The one place a statement of account is worked out.
 *
 * A statement was computed in three places -- the customers function, the
 * vendors function and the statement email -- and all three made the same
 * mistake: the opening balance summed every line of the party's journals
 * instead of the control-account lines. A balanced journal has equal debits
 * and credits, so that sum is zero by construction, and every statement opened
 * at 0.00 whatever the party actually owed. Fixing one copy would have left the
 * emailed statement -- the one the customer receives -- still wrong, which is
 * why the arithmetic now lives here and nowhere else.
 *
 * The rule throughout: only movements on a trade receivable (customer) or trade
 * payable (supplier) control account change what a party owes. A journal that
 * moves neither did not move the balance and does not appear on the statement.
 *
 * Pure except for `fetchOpeningBalance`, and free of remote imports so the
 * arithmetic can be unit-tested directly.
 */

export type StatementSide = 'receivable' | 'payable';

export type JournalItemLike = {
  amount: number | string;
  type: 'debit' | 'credit' | string;
  account_id: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The chart-of-accounts role and type that hold a party's balance. */
export function controlAccountFilter(side: StatementSide) {
  return side === 'receivable'
    ? { type: 'Asset', account_role: 'trade_receivable' }
    : { type: 'Liability', account_role: 'trade_payable' };
}

/**
 * The movement a set of journal lines made on the party's balance.
 *
 * Positive raises what is owed: a debit to receivables, a credit to payables.
 * Lines on any other account are ignored -- that is the entire fix.
 */
export function controlMovement(
  items: JournalItemLike[] | null | undefined,
  controlIds: Set<string>,
  side: StatementSide,
): number {
  let net = 0;
  for (const item of items ?? []) {
    if (!controlIds.has(item.account_id)) continue;
    const amount = Number(item.amount) || 0;
    const raises = side === 'receivable' ? item.type === 'debit' : item.type === 'credit';
    net += raises ? amount : -amount;
  }
  return round2(net);
}

export type StatementRow<Extra> = Extra & {
  id: string;
  date: string;
  description: string | null;
  /** 'invoice' | 'payment' for receivables; 'bill' | 'payment' for payables. */
  type: 'invoice' | 'bill' | 'payment';
  amount: number;
};

/**
 * One row per journal that moved the control account, in the order given.
 *
 * The net across a journal's control lines decides the row, not its gross
 * debits: a journal that both raises and settles resolves to the one movement
 * it actually made, and a journal whose control lines net to nothing is left
 * off because it changed nothing a reader needs to account for.
 */
export function buildStatementRows<T extends {
  id: string;
  entry_date: string;
  description?: string | null;
  journal_entry_items?: JournalItemLike[] | null;
}, Extra>(
  transactions: T[] | null | undefined,
  controlIds: Set<string>,
  side: StatementSide,
  extra: (t: T) => Extra,
): Array<StatementRow<Extra>> {
  const rows: Array<StatementRow<Extra>> = [];
  for (const t of transactions ?? []) {
    const net = controlMovement(t.journal_entry_items, controlIds, side);
    if (net === 0) continue;
    rows.push({
      ...extra(t),
      id: t.id,
      date: t.entry_date,
      description: t.description ?? null,
      type: net > 0 ? (side === 'receivable' ? 'invoice' : 'bill') : 'payment',
      amount: Math.abs(net),
    });
  }
  return rows;
}

/** Opening balance plus every row: the figure the statement closes on. */
export function closingBalance(
  opening: number,
  rows: Array<{ type: string; amount: number }>,
): number {
  return round2(
    rows.reduce((sum, row) => sum + (row.type === 'payment' ? -row.amount : row.amount), opening),
  );
}

/**
 * What to call the closing figure, and what it means.
 *
 * "Balance due" over a credit balance asks for money the party does not owe --
 * the one thing a statement must never do. Mirrors headlineLabel/closingWording
 * in src/lib/statements/statementDocument.ts so the email and the PDF use the
 * same words for the same state.
 */
export function describeClosing(side: StatementSide, closing: number, known: boolean): {
  label: string;
  wording: string;
} {
  if (!known) {
    return {
      label: 'Balance',
      wording: side === 'receivable'
        ? 'No trade receivable control account is classified in the chart of accounts, so a balance cannot be stated.'
        : 'No trade payable control account is classified in the chart of accounts, so a balance cannot be stated.',
    };
  }
  if (closing === 0) return { label: 'Nothing outstanding', wording: 'Nothing is outstanding on this account.' };
  if (closing < 0) {
    return side === 'receivable'
      ? { label: 'In credit', wording: 'This account is in credit. No payment is due.' }
      : { label: 'In debit', wording: 'This supplier account is in debit.' };
  }
  return side === 'receivable'
    ? { label: 'Balance due', wording: 'Please settle the balance due.' }
    : { label: 'Balance outstanding', wording: 'This statement is of amounts owed by us to the supplier named above.' };
}

/**
 * What the control account said the party owed immediately before `dateFrom`.
 *
 * `known` is false when the chart classifies no control account for this side:
 * the balance cannot be derived at all then, and callers must say so rather
 * than print a zero that reads as an answer.
 */
// deno-lint-ignore no-explicit-any
export async function fetchOpeningBalance(admin: any, opts: {
  companyId: string;
  side: StatementSide;
  partyId: string;
  dateFrom: string | null | undefined;
  controlIds: Set<string>;
}): Promise<{ opening_balance: number; opening_balance_known: boolean }> {
  const known = opts.controlIds.size > 0;
  if (!known || !opts.dateFrom) return { opening_balance: 0, opening_balance_known: known };

  const partyColumn = opts.side === 'receivable' ? 'customer_id' : 'vendor_id';
  const { data, error } = await admin
    .from('journal_entry_items')
    .select(`amount, type, account_id, journal_entries!inner (company_id, ${partyColumn}, entry_date)`)
    .eq('journal_entries.company_id', opts.companyId)
    .eq(`journal_entries.${partyColumn}`, opts.partyId)
    .lt('journal_entries.entry_date', opts.dateFrom);
  if (error) throw error;

  return {
    opening_balance: controlMovement(data, opts.controlIds, opts.side),
    opening_balance_known: true,
  };
}

/** The ids of the party's control accounts in this company. */
// deno-lint-ignore no-explicit-any
export async function fetchControlAccountIds(admin: any, companyId: string, side: StatementSide) {
  const filter = controlAccountFilter(side);
  const { data, error } = await admin
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('type', filter.type)
    .eq('account_role', filter.account_role);
  if (error) throw error;
  return new Set<string>((data ?? []).map((a: { id: string }) => a.id));
}
