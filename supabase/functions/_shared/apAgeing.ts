/**
 * Creditors (accounts payable) age analysis — one implementation.
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

export type SupplierAgeing = {
  vendor_id: string;
  vendor_name: string;
  buckets: AgeingBuckets;
  total: number;
  ap_control_balance: number;
  unallocated: number;
  oldest_days_overdue: number;
  open_bill_count: number;
};

export type ApAgeAnalysis = {
  as_of: string;
  ap_account_ids: string[];
  suppliers: SupplierAgeing[];
  totals: AgeingBuckets & {
    total: number;
    ap_control_balance: number;
    unallocated: number;
  };
  reconciliation: {
    age_analysis_total: number;
    unallocated_to_suppliers: number;
    unattributed_to_any_supplier: number;
    general_ledger_ap_balance: number;
    variance: number;
    reconciles: boolean;
  };
};

/**
 * Computes the creditors age analysis for EVERY supplier in one pass.
 *
 * Four queries regardless of how many suppliers there are, so this does not
 * degrade as a company grows: AP accounts, open bills, the AP movements on
 * those bills' journals, and the control-account movements.
 */
export async function computeApAgeAnalysis(
  db: Db,
  companyId: string,
  asOf: string,
): Promise<ApAgeAnalysis> {
  // 1. The control accounts. Identified by role, never by display name.
  const { data: apAccounts, error: apErr } = await db
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('type', 'Liability')
    .eq('account_role', 'trade_payable');
  if (apErr) throw apErr;
  const apAccountIds = (apAccounts ?? []).map((a: { id: string }) => a.id);
  const apIdSet = new Set(apAccountIds);

  const empty: ApAgeAnalysis = {
    as_of: asOf,
    ap_account_ids: [],
    suppliers: [],
    totals: { ...emptyBuckets(), total: 0, ap_control_balance: 0, unallocated: 0 },
    reconciliation: {
      age_analysis_total: 0,
      unallocated_to_suppliers: 0,
      unattributed_to_any_supplier: 0,
      general_ledger_ap_balance: 0,
      variance: 0,
      reconciles: true,
    },
  };
  if (!apAccountIds.length) return empty;

  // 2. Open bills. A voided or fully paid bill is not owed.
  const { data: openBills, error: billErr } = await db
    .from('bills')
    .select('id, vendor_id, bill_number, bill_date, due_date, status, journal_entry_id')
    .eq('company_id', companyId)
    .not('status', 'in', '("void","paid")');
  if (billErr) throw billErr;

  // 3. What each bill still owes: the AP credit its own journal raised, less any
  //    AP debits later posted against that same journal.
  const journalIds = (openBills ?? [])
    .map((b: { journal_entry_id: string | null }) => b.journal_entry_id)
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
      if (!apIdSet.has(m.account_id)) continue;
      const signed = m.type === 'credit' ? Number(m.amount) : -Number(m.amount);
      outstandingByJournal[m.journal_entry_id] = (outstandingByJournal[m.journal_entry_id] ?? 0) + signed;
    }
  }

  // 4. Every control-account movement up to the reporting date.
  const movements = await readAll<{
    amount: number;
    type: string;
    account_id: string;
    journal_entries: { vendor_id: string | null };
  }>((from, to) =>
    db.from('journal_entry_items')
      .select('amount, type, account_id, journal_entries!inner ( company_id, vendor_id, entry_date )')
      .in('account_id', apAccountIds)
      .eq('journal_entries.company_id', companyId)
      .lte('journal_entries.entry_date', asOf)
      .range(from, to),
  );

  let glTotal = 0;
  let unattributed = 0;
  const controlByVendor: Record<string, number> = {};
  for (const m of movements) {
    const signed = m.type === 'credit' ? Number(m.amount) : -Number(m.amount);
    glTotal += signed;
    const vid = m.journal_entries?.vendor_id ?? null;
    if (vid) controlByVendor[vid] = (controlByVendor[vid] ?? 0) + signed;
    else unattributed += signed;
  }

  // 5. Age the open bills into buckets, per supplier.
  const bucketsByVendor: Record<string, AgeingBuckets> = {};
  const oldestByVendor: Record<string, number> = {};
  const countByVendor: Record<string, number> = {};
  for (const b of openBills ?? []) {
    const bill = b as {
      vendor_id: string | null; due_date: string | null; bill_date: string | null; journal_entry_id: string | null;
    };
    if (!bill.vendor_id || !bill.journal_entry_id) continue;
    const outstanding = round2(outstandingByJournal[bill.journal_entry_id] ?? 0);
    if (outstanding <= 0) continue;
    const days = daysOverdue(asOf, bill.due_date || bill.bill_date);
    const key = bucketForDaysOverdue(days);
    bucketsByVendor[bill.vendor_id] ??= emptyBuckets();
    bucketsByVendor[bill.vendor_id][key] += outstanding;
    oldestByVendor[bill.vendor_id] = Math.max(oldestByVendor[bill.vendor_id] ?? 0, days);
    countByVendor[bill.vendor_id] = (countByVendor[bill.vendor_id] ?? 0) + 1;
  }

  // 6. Names. Every supplier that has either an aged bill or a control balance.
  const vendorIds = [...new Set([...Object.keys(bucketsByVendor), ...Object.keys(controlByVendor)])];
  const names: Record<string, string> = {};
  for (let i = 0; i < vendorIds.length; i += 200) {
    const { data: vs, error: vErr } = await db
      .from('vendors')
      .select('id, name')
      .in('id', vendorIds.slice(i, i + 200));
    if (vErr) throw vErr;
    for (const v of vs ?? []) names[(v as { id: string }).id] = (v as { name: string }).name;
  }

  const suppliers: SupplierAgeing[] = vendorIds
    .map((id) => {
      const buckets = bucketsByVendor[id] ?? emptyBuckets();
      const total = round2(bucketTotal(buckets));
      const control = round2(controlByVendor[id] ?? 0);
      return {
        vendor_id: id,
        vendor_name: names[id] ?? 'Unknown supplier',
        buckets: {
          current: round2(buckets.current),
          days_1_30: round2(buckets.days_1_30),
          days_31_60: round2(buckets.days_31_60),
          days_61_90: round2(buckets.days_61_90),
          days_120_plus: round2(buckets.days_120_plus),
        },
        total,
        ap_control_balance: control,
        unallocated: round2(control - total),
        oldest_days_overdue: oldestByVendor[id] ?? 0,
        open_bill_count: countByVendor[id] ?? 0,
      };
    })
    .filter((s) => s.total !== 0 || s.ap_control_balance !== 0)
    .sort((a, b) => b.ap_control_balance - a.ap_control_balance || a.vendor_name.localeCompare(b.vendor_name));

  const totals = suppliers.reduce(
    (acc, s) => {
      for (const { key } of AGEING_BUCKETS) acc[key] += s.buckets[key];
      acc.total += s.total;
      acc.ap_control_balance += s.ap_control_balance;
      acc.unallocated += s.unallocated;
      return acc;
    },
    { ...emptyBuckets(), total: 0, ap_control_balance: 0, unallocated: 0 },
  );
  for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] = round2(totals[k]);

  const ageTotal = totals.total;
  const unallocatedTotal = totals.unallocated;
  const glBalance = round2(glTotal);
  const variance = round2(ageTotal + unallocatedTotal + round2(unattributed) - glBalance);

  return {
    as_of: asOf,
    ap_account_ids: apAccountIds,
    suppliers,
    totals,
    reconciliation: {
      age_analysis_total: ageTotal,
      unallocated_to_suppliers: unallocatedTotal,
      unattributed_to_any_supplier: round2(unattributed),
      general_ledger_ap_balance: glBalance,
      variance,
      reconciles: Math.abs(variance) < 0.005,
    },
  };
}
