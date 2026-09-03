/**
 * The control account as a general ledger, on exactly the same basis as the age
 * analysis: same accounts, same as-at date, same sign convention.
 *
 * That shared basis is the whole point. An auditor asks "does the age analysis
 * agree with the creditors control account?", and a ledger produced by a
 * separate routine could answer differently for reasons that have nothing to do
 * with the books. Here the closing balance and the age analysis come from one
 * definition, and the tie is stated in the result rather than left to be
 * recomputed by hand.
 */
import {
  AGEING_SIDES,
  computeControlAgeAnalysis,
  round2,
  type AgeingSide,
} from './controlAccountAgeing.ts';

type Db = {
  from: (t: string) => { select: (s: string, o?: unknown) => any };
};

export type ControlLedgerRow = {
  entry_date: string;
  journal_number: string | null;
  description: string | null;
  party_name: string | null;
  document: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type ControlLedger = {
  side: AgeingSide;
  date_from: string | null;
  as_of: string;
  control_accounts: Array<{ id: string; account_number: number; name: string }>;
  opening_balance: number;
  rows: ControlLedgerRow[];
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  truncated: boolean;
  /** The tie an auditor is checking. */
  tie: {
    ledger_closing_balance: number;
    age_analysis_control_balance: number;
    age_analysis_total: number;
    not_open_documents: number;
    ties: boolean;
  };
};

/** Guard rail: a ledger this long is a data problem, not a report. */
const MAX_LEDGER_ROWS = 20000;
const PAGE = 1000;

async function readAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

type Raw = {
  amount: number;
  type: string;
  journal_entries: {
    entry_date: string;
    description: string | null;
    journal_number: string | null;
    vendor_id: string | null;
    customer_id: string | null;
    bill_id: string | null;
    invoice_id: string | null;
  };
};

export async function computeControlAccountLedger(
  db: Db,
  companyId: string,
  asOf: string,
  side: AgeingSide,
  dateFrom?: string | null,
): Promise<ControlLedger> {
  // A ledger cannot open after it closes. The opening balance would sweep in
  // transactions the closing balance never sees, so the closing balance would
  // stop agreeing with the age analysis - the one thing this report exists to
  // demonstrate. Refused outright rather than returned with ties: false,
  // because a ledger that does not tie is not a document worth handing anyone.
  if (dateFrom && dateFrom > asOf) {
    throw new Error(
      `The period start (${dateFrom}) is after the as-at date (${asOf}). ` +
      'A control account ledger must open on or before the date it is drawn up to.',
    );
  }

  const spec = AGEING_SIDES[side];
  const signOf = (type: string) => (type === spec.increasesOn ? 1 : -1);
  const docField = side === 'payable' ? 'bill_id' : 'invoice_id';

  const { data: controlAccounts, error: accErr } = await db
    .from('chart_of_accounts')
    .select('id, account_number, name')
    .eq('company_id', companyId)
    .eq('type', spec.accountType)
    .eq('account_role', spec.accountRole);
  if (accErr) throw accErr;
  const accounts = (controlAccounts ?? []) as Array<{ id: string; account_number: number; name: string }>;
  const ids = accounts.map((a) => a.id);

  // Computed here, not passed in, so the ledger can never be shown beside an
  // age analysis prepared on a different basis.
  const analysis = await computeControlAgeAnalysis(db, companyId, asOf, side);

  if (!ids.length) {
    return {
      side, date_from: dateFrom ?? null, as_of: asOf, control_accounts: [],
      opening_balance: 0, rows: [], total_debit: 0, total_credit: 0,
      closing_balance: 0, truncated: false,
      tie: {
        ledger_closing_balance: 0, age_analysis_control_balance: 0,
        age_analysis_total: 0, not_open_documents: 0, ties: true,
      },
    };
  }

  // Opening balance: everything strictly before the period start.
  let opening = 0;
  if (dateFrom) {
    const before = await readAll<Raw>((from, to) =>
      db.from('journal_entry_items')
        .select('amount, type, journal_entries!inner ( company_id, entry_date )')
        .in('account_id', ids)
        .eq('journal_entries.company_id', companyId)
        .lt('journal_entries.entry_date', dateFrom)
        .range(from, to));
    for (const m of before) opening += signOf(m.type) * Number(m.amount);
  }

  const movements = await readAll<Raw>((from, to) => {
    let q = db.from('journal_entry_items')
      .select(
        'amount, type, journal_entries!inner ( company_id, entry_date, description, journal_number, ' +
        'vendor_id, customer_id, bill_id, invoice_id )',
      )
      .in('account_id', ids)
      .eq('journal_entries.company_id', companyId)
      .lte('journal_entries.entry_date', asOf);
    if (dateFrom) q = q.gte('journal_entries.entry_date', dateFrom);
    return q.range(from, to);
  });

  // Names and document references resolved in bulk, not per row.
  const partyIds = [...new Set(movements.map((m) => m.journal_entries?.[spec.partyField]).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  for (let i = 0; i < partyIds.length; i += 200) {
    const { data } = await db.from(spec.partyTable).select('id, name').in('id', partyIds.slice(i, i + 200));
    for (const p of data ?? []) names[(p as { id: string }).id] = (p as { name: string }).name;
  }
  const docIds = [...new Set(movements.map((m) => m.journal_entries?.[docField]).filter(Boolean))] as string[];
  const docs: Record<string, string> = {};
  for (let i = 0; i < docIds.length; i += 200) {
    const { data } = await db.from(spec.documentTable)
      .select('id, ' + spec.documentNumberField)
      .in('id', docIds.slice(i, i + 200));
    for (const d of data ?? []) {
      docs[(d as { id: string }).id] = String((d as Record<string, unknown>)[spec.documentNumberField] ?? '');
    }
  }

  const sorted = movements.slice().sort((a, b) => {
    const byDate = String(a.journal_entries.entry_date).localeCompare(String(b.journal_entries.entry_date));
    if (byDate !== 0) return byDate;
    return String(a.journal_entries.journal_number ?? '').localeCompare(String(b.journal_entries.journal_number ?? ''));
  });

  const truncated = sorted.length > MAX_LEDGER_ROWS;
  const use = truncated ? sorted.slice(0, MAX_LEDGER_ROWS) : sorted;

  let running = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: ControlLedgerRow[] = use.map((m) => {
    const j = m.journal_entries;
    const amount = Number(m.amount);
    const debit = m.type === 'debit' ? amount : 0;
    const credit = m.type === 'credit' ? amount : 0;
    totalDebit += debit;
    totalCredit += credit;
    running += signOf(m.type) * amount;
    const pid = j[spec.partyField];
    const did = j[docField];
    return {
      entry_date: j.entry_date,
      journal_number: j.journal_number,
      description: j.description,
      party_name: pid ? (names[pid] ?? null) : null,
      document: did ? (docs[did] ?? null) : null,
      debit: round2(debit),
      credit: round2(credit),
      balance: round2(running),
    };
  });

  const closing = round2(running);
  const rec = analysis.reconciliation;
  return {
    side,
    date_from: dateFrom ?? null,
    as_of: asOf,
    control_accounts: accounts,
    opening_balance: round2(opening),
    rows,
    total_debit: round2(totalDebit),
    total_credit: round2(totalCredit),
    closing_balance: closing,
    truncated,
    tie: {
      ledger_closing_balance: closing,
      age_analysis_control_balance: rec.general_ledger_control_balance,
      age_analysis_total: rec.age_analysis_total,
      // Everything on the control account that is not an open document. This is
      // what the age analysis reconciliation already explains line by line.
      not_open_documents: round2(rec.unallocated_to_parties + rec.unattributed_to_any_party),
      // A truncated ledger cannot be said to tie, even if the totals happen to.
      ties: !truncated && Math.abs(closing - rec.general_ledger_control_balance) < 0.005,
    },
  };
}
