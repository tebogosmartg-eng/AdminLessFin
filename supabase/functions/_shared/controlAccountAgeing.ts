/**
 * Control-account age analysis — one implementation for BOTH sides.
 *
 * Creditors (trade payables) and debtors (trade receivables) age the same way:
 * open documents bucketed by how overdue they are, reconciled to the control
 * account. Only four things differ — the account role, which side of the entry
 * increases the balance, the document table and the party table — so those are
 * data, and the algorithm is written once.
 *
 * WHY THIS IS SHARED
 * The per-supplier statement, the global age analysis and the Reports card must
 * never disagree about what a supplier owes. They therefore all read the bucket
 * boundaries and the outstanding-per-bill rule from here rather than each
 * recomputing them.
 *
 * WHAT AN AGE ANALYSIS IS, AND IS NOT
 * The analysis ages OPEN BILLS. The creditors control account in the general
 * ledger can legitimately hold more than open bills: payments on account, credit
 * notes, and anything else journalled straight to the control account (on one
 * live tenant a loan liability is booked to the same account, so open bills are
 * R2 645 of a R970 975 control balance). An age analysis presented as if it were
 * the creditors balance would therefore be wrong by construction.
 *
 * So every result carries its own reconciliation:
 *
 *     open bills aged
 *   + movements against a supplier that are not an open bill   (unallocated)
 *   + movements on the control account with no supplier at all  (unattributed)
 *   = creditors control account balance per the general ledger
 *
 * The variance on that identity is reported, and must be zero.
 */

export type AgeingBucketKey =
  | 'current'
  | 'days_1_30'
  | 'days_31_60'
  | 'days_61_90'
  | 'days_120_plus';

/**
 * Bucket order and labels. `days_120_plus` is retained as the KEY because the
 * per-supplier statement, its PDF and the stored evidence already use it;
 * the label is what the reader sees, and it says what the bucket means.
 */
export const AGEING_BUCKETS: ReadonlyArray<{ key: AgeingBucketKey; label: string }> = [
  { key: 'current', label: 'Current' },
  { key: 'days_1_30', label: '1-30 days' },
  { key: 'days_31_60', label: '31-60 days' },
  { key: 'days_61_90', label: '61-90 days' },
  { key: 'days_120_plus', label: '90+ days' },
];

export type AgeingBuckets = Record<AgeingBucketKey, number>;

export const emptyBuckets = (): AgeingBuckets => ({
  current: 0,
  days_1_30: 0,
  days_31_60: 0,
  days_61_90: 0,
  days_120_plus: 0,
});

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole days from a due date to the reporting date. Negative means not yet due. */
export function daysOverdue(asOf: string, due: string | null | undefined): number {
  if (!due) return 0;
  const DAY_MS = 86400000;
  return Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / DAY_MS);
}

/** The single definition of the bucket boundaries. */
export function bucketForDaysOverdue(days: number): AgeingBucketKey {
  if (days <= 0) return 'current';
  if (days <= 30) return 'days_1_30';
  if (days <= 60) return 'days_31_60';
  if (days <= 90) return 'days_61_90';
  return 'days_120_plus';
}

export const bucketTotal = (b: AgeingBuckets) =>
  b.current + b.days_1_30 + b.days_31_60 + b.days_61_90 + b.days_120_plus;

/* ------------------------------------------------------------------------- */

type Db = {
  from: (t: string) => {
    select: (s: string, o?: unknown) => any;
  };
};

/**
 * Reads every row of a query, 1000 at a time.
 *
 * PostgREST caps a response at 1000 rows and says nothing about it, so a
 * company past that many control-account movements would silently report a
 * WRONG creditors balance. Paging is what makes this safe at scale.
 */
async function readAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Which control account is being aged. */
export type AgeingSide = 'payable' | 'receivable';

type SideSpec = {
  accountType: 'Liability' | 'Asset';
  accountRole: 'trade_payable' | 'trade_receivable';
  documentTable: 'bills' | 'invoices';
  documentDateField: 'bill_date' | 'invoice_date';
  documentNumberField: 'bill_number' | 'invoice_number';
  partyTable: 'vendors' | 'customers';
  partyField: 'vendor_id' | 'customer_id';
  /** The entry side that INCREASES what is owed. */
  increasesOn: 'credit' | 'debit';
};

export const AGEING_SIDES: Record<AgeingSide, SideSpec> = {
  payable: {
    accountType: 'Liability',
    accountRole: 'trade_payable',
    documentTable: 'bills',
    documentDateField: 'bill_date',
    documentNumberField: 'bill_number',
    partyTable: 'vendors',
    partyField: 'vendor_id',
    increasesOn: 'credit',
  },
  receivable: {
    accountType: 'Asset',
    accountRole: 'trade_receivable',
    documentTable: 'invoices',
    documentDateField: 'invoice_date',
    documentNumberField: 'invoice_number',
    partyTable: 'customers',
    partyField: 'customer_id',
    increasesOn: 'debit',
  },
};

export type PartyAgeing = {
  party_id: string;
  party_name: string;
  buckets: AgeingBuckets;
  total: number;
  control_balance: number;
  unallocated: number;
  oldest_days_overdue: number;
  open_document_count: number;
};

export type ControlAgeAnalysis = {
  side: AgeingSide;
  as_of: string;
  control_account_ids: string[];
  parties: PartyAgeing[];
  totals: AgeingBuckets & {
    total: number;
    control_balance: number;
    unallocated: number;
  };
  reconciliation: {
    age_analysis_total: number;
    unallocated_to_parties: number;
    unattributed_to_any_party: number;
    general_ledger_control_balance: number;
    variance: number;
    reconciles: boolean;
  };
};


/**
 * Ages one control account for EVERY party, in one pass.
 *
 * Four queries regardless of how many parties there are, so this does not
 * degrade as a company grows: the control accounts, the open documents, the
 * control movements on those documents' journals, and the control movements
 * themselves.
 */
export async function computeControlAgeAnalysis(
  db: Db,
  companyId: string,
  asOf: string,
  side: AgeingSide,
): Promise<ControlAgeAnalysis> {
  const spec = AGEING_SIDES[side];
  const signOf = (type: string) => (type === spec.increasesOn ? 1 : -1);

  // 1. The control accounts. Identified by role, never by display name.
  const { data: controlAccounts, error: accErr } = await db
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('type', spec.accountType)
    .eq('account_role', spec.accountRole);
  if (accErr) throw accErr;
  const controlIds = (controlAccounts ?? []).map((a: { id: string }) => a.id);
  const controlIdSet = new Set(controlIds);

  const empty: ControlAgeAnalysis = {
    side,
    as_of: asOf,
    control_account_ids: [],
    parties: [],
    totals: { ...emptyBuckets(), total: 0, control_balance: 0, unallocated: 0 },
    reconciliation: {
      age_analysis_total: 0,
      unallocated_to_parties: 0,
      unattributed_to_any_party: 0,
      general_ledger_control_balance: 0,
      variance: 0,
      reconciles: true,
    },
  };
  if (!controlIds.length) return empty;

  // 2. Open documents. A voided or fully settled document is not outstanding.
  const { data: openDocs, error: docErr } = await db
    .from(spec.documentTable)
    .select(
      'id, ' + spec.partyField + ', ' + spec.documentDateField + ', due_date, status, journal_entry_id',
    )
    .eq('company_id', companyId)
    .not('status', 'in', '("void","paid")');
  if (docErr) throw docErr;

  // 3. What each document still owes: the control movement its own journal
  //    raised, less anything later posted against that same journal.
  const journalIds = (openDocs ?? [])
    .map((d: { journal_entry_id: string | null }) => d.journal_entry_id)
    .filter(Boolean) as string[];
  const outstandingByJournal: Record<string, number> = {};
  for (let i = 0; i < journalIds.length; i += 200) {
    const chunk = journalIds.slice(i, i + 200);
    const rows = await readAll<{ journal_entry_id: string; account_id: string; type: string; amount: number }>(
      (from, to) =>
        db.from('journal_entry_items')
          .select('journal_entry_id, account_id, type, amount')
          .in('journal_entry_id', chunk)
          .range(from, to),
    );
    for (const m of rows) {
      if (!controlIdSet.has(m.account_id)) continue;
      outstandingByJournal[m.journal_entry_id] =
        (outstandingByJournal[m.journal_entry_id] ?? 0) + signOf(m.type) * Number(m.amount);
    }
  }

  // 4. Every control-account movement up to the reporting date.
  const movements = await readAll<{
    amount: number;
    type: string;
    account_id: string;
    journal_entries: Record<string, string | null>;
  }>((from, to) =>
    db.from('journal_entry_items')
      .select(
        'amount, type, account_id, journal_entries!inner ( company_id, ' + spec.partyField + ', entry_date )',
      )
      .in('account_id', controlIds)
      .eq('journal_entries.company_id', companyId)
      .lte('journal_entries.entry_date', asOf)
      .range(from, to),
  );

  let glTotal = 0;
  let unattributed = 0;
  const controlByParty: Record<string, number> = {};
  for (const m of movements) {
    const signed = signOf(m.type) * Number(m.amount);
    glTotal += signed;
    const pid = m.journal_entries?.[spec.partyField] ?? null;
    if (pid) controlByParty[pid] = (controlByParty[pid] ?? 0) + signed;
    else unattributed += signed;
  }

  // 5. Age the open documents into buckets, per party.
  const bucketsByParty: Record<string, AgeingBuckets> = {};
  const oldestByParty: Record<string, number> = {};
  const countByParty: Record<string, number> = {};
  for (const d of openDocs ?? []) {
    const doc = d as Record<string, string | null>;
    const partyId = doc[spec.partyField];
    const journalId = doc.journal_entry_id;
    if (!partyId || !journalId) continue;
    const outstanding = round2(outstandingByJournal[journalId] ?? 0);
    if (outstanding <= 0) continue;
    const days = daysOverdue(asOf, doc.due_date || doc[spec.documentDateField]);
    const key = bucketForDaysOverdue(days);
    bucketsByParty[partyId] ??= emptyBuckets();
    bucketsByParty[partyId][key] += outstanding;
    oldestByParty[partyId] = Math.max(oldestByParty[partyId] ?? 0, days);
    countByParty[partyId] = (countByParty[partyId] ?? 0) + 1;
  }

  // 6. Names. Every party with either an aged document or a control balance.
  const partyIds = [...new Set([...Object.keys(bucketsByParty), ...Object.keys(controlByParty)])];
  const names: Record<string, string> = {};
  for (let i = 0; i < partyIds.length; i += 200) {
    const { data: ps, error: pErr } = await db
      .from(spec.partyTable)
      .select('id, name')
      .in('id', partyIds.slice(i, i + 200));
    if (pErr) throw pErr;
    for (const v of ps ?? []) names[(v as { id: string }).id] = (v as { name: string }).name;
  }

  const parties: PartyAgeing[] = partyIds
    .map((id) => {
      const buckets = bucketsByParty[id] ?? emptyBuckets();
      const total = round2(bucketTotal(buckets));
      const control = round2(controlByParty[id] ?? 0);
      return {
        party_id: id,
        party_name: names[id] ?? (side === 'payable' ? 'Unknown supplier' : 'Unknown customer'),
        buckets: {
          current: round2(buckets.current),
          days_1_30: round2(buckets.days_1_30),
          days_31_60: round2(buckets.days_31_60),
          days_61_90: round2(buckets.days_61_90),
          days_120_plus: round2(buckets.days_120_plus),
        },
        total,
        control_balance: control,
        unallocated: round2(control - total),
        oldest_days_overdue: oldestByParty[id] ?? 0,
        open_document_count: countByParty[id] ?? 0,
      };
    })
    .filter((p) => p.total !== 0 || p.control_balance !== 0)
    .sort((a, b) => b.control_balance - a.control_balance || a.party_name.localeCompare(b.party_name));

  const totals = parties.reduce(
    (acc, p) => {
      for (const { key } of AGEING_BUCKETS) acc[key] += p.buckets[key];
      acc.total += p.total;
      acc.control_balance += p.control_balance;
      acc.unallocated += p.unallocated;
      return acc;
    },
    { ...emptyBuckets(), total: 0, control_balance: 0, unallocated: 0 },
  );
  for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] = round2(totals[k]);

  const glBalance = round2(glTotal);
  const variance = round2(totals.total + totals.unallocated + round2(unattributed) - glBalance);

  return {
    side,
    as_of: asOf,
    control_account_ids: controlIds,
    parties,
    totals,
    reconciliation: {
      age_analysis_total: totals.total,
      unallocated_to_parties: totals.unallocated,
      unattributed_to_any_party: round2(unattributed),
      general_ledger_control_balance: glBalance,
      variance,
      reconciles: Math.abs(variance) < 0.005,
    },
  };
}

/** Creditors (trade payables) age analysis. */
export const computeApAgeAnalysis = (db: Db, companyId: string, asOf: string) =>
  computeControlAgeAnalysis(db, companyId, asOf, 'payable');

/** Debtors (trade receivables) age analysis. */
export const computeArAgeAnalysis = (db: Db, companyId: string, asOf: string) =>
  computeControlAgeAnalysis(db, companyId, asOf, 'receivable');
