/**
 * EFS V6.4.1 — Financial Facts Adapter
 * Consumes sealed Reporting Snapshot Fact datasets only.
 * NEVER calls Accounting RPCs / live GL.
 */
// @ts-nocheck

export type AccountFact = {
  id: string;
  account_number?: number;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Income" | "Expense" | string;
  balance?: number;
  opening_balance?: number;
  closing_balance?: number;
  period_activity?: number;
  activity?: number;
  /**
   * Account classification, as it stood when the snapshot was sealed. The
   * statements are presented from this, so it has to be part of the sealed
   * fact — not looked up live, which would let a later re-classification
   * silently restate a frozen statement.
   */
  category?: string | null;
  subcategory?: string | null;
  account_role?: string | null;
  account_code?: string | null;
};

export type CashFlowFact = {
  section: "Operating" | "Investing" | "Financing" | string;
  category: string;
  amount: number;
};

export type ImmutableFinancialFacts = {
  schema_version: string;
  company_id: string;
  snapshot_version_id: string;
  fact_snapshot_id: string;
  content_hash: string;
  period: {
    start_date: string;
    end_date: string;
    prior_as_of?: string;
    period_key?: string;
  };
  balances_as_of: AccountFact[];
  balances_prior_as_of: AccountFact[];
  period_activity: AccountFact[];
  cash_flow: CashFlowFact[];
  /** Balances at the start of the comparative year (empty on older seals). */
  balances_prior_opening_as_of: AccountFact[];
  /** The comparative year's movement per account; null where not sealed. */
  prior_period_activity: AccountFact[] | null;
  /** The comparative year's cash flows; null where not sealed. */
  prior_cash_flow: CashFlowFact[] | null;
  source_rpc_refs: unknown[];
  /** Framework-neutral account classification helpers (no amount mutation). */
  byType: (type: string, basis: "closing" | "opening" | "activity") => AccountFact[];
};

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** Carry sealed classification through untouched (absent on pre-classification snapshots). */
function classification(a) {
  return {
    category: a.category ?? null,
    subcategory: a.subcategory ?? null,
    account_role: a.account_role ?? null,
    account_code: a.account_code ?? null,
  };
}

function normalizeActivity(rows) {
  return asArray(rows).map((a) => ({
    id: a.id,
    account_number: a.account_number,
    name: a.name,
    type: a.type,
    ...classification(a),
    opening_balance: Number(a.opening_balance ?? 0),
    closing_balance: Number(a.closing_balance ?? a.balance ?? 0),
    period_activity: Number(
      a.period_activity ?? a.activity ?? (Number(a.closing_balance ?? a.balance ?? 0) - Number(a.opening_balance ?? 0)),
    ),
    activity: Number(a.period_activity ?? a.activity ?? 0),
    balance: Number(a.closing_balance ?? a.balance ?? 0),
  }));
}

/**
 * Adapt a sealed Fact Snapshot row into immutable financial facts.
 * @param factRow efs_fact_snapshots record (must include dataset)
 * @param snapshotVersionId bound version id
 */
export function adaptFinancialFacts(factRow, snapshotVersionId) {
  if (!factRow?.dataset) {
    throw new Error("Financial Facts Adapter requires a sealed Fact Snapshot dataset.");
  }
  if (!factRow.content_hash) {
    throw new Error("Financial Facts Adapter requires content_hash (immutability identity).");
  }

  const ds = factRow.dataset;
  const balances_as_of = asArray(ds.balances_as_of?.accounts ?? ds.balances_as_of).map((a) => ({
    id: a.id,
    account_number: a.account_number,
    name: a.name,
    type: a.type,
    ...classification(a),
    balance: Number(a.balance ?? 0),
  }));
  const balances_prior_as_of = asArray(ds.balances_prior_as_of?.accounts ?? ds.balances_prior_as_of).map((a) => ({
    id: a.id,
    account_number: a.account_number,
    name: a.name,
    type: a.type,
    ...classification(a),
    balance: Number(a.balance ?? 0),
  }));
  const period_activity = normalizeActivity(ds.period_activity ?? ds.periodActivity);
  // The comparative year's movements, where the seal carries them. A snapshot
  // sealed before these were captured has none, and the comparatives that need
  // them are left blank rather than estimated from a running balance.
  const balances_prior_opening_as_of = asArray(
    ds.balances_prior_opening_as_of?.accounts ?? ds.balances_prior_opening_as_of,
  ).map((a) => ({
    id: a.id,
    account_number: a.account_number,
    name: a.name,
    type: a.type,
    ...classification(a),
    balance: Number(a.balance ?? 0),
  }));
  const prior_period_activity = Array.isArray(ds.prior_period_activity)
    ? normalizeActivity(ds.prior_period_activity)
    : null;
  const prior_cash_flow = Array.isArray(ds.prior_cash_flow)
    ? ds.prior_cash_flow.map((c) => ({
        section: c.section,
        category: c.category ?? c.name ?? "Other",
        amount: Number(c.amount ?? 0),
      }))
    : null;
  const cash_flow = asArray(ds.cash_flow ?? ds.cashFlowData ?? ds.cash_flow_statement).map((c) => ({
    section: c.section,
    category: c.category ?? c.name ?? "Other",
    amount: Number(c.amount ?? 0),
  }));

  const facts: ImmutableFinancialFacts = {
    schema_version: ds.schema_version || "6.4.1",
    company_id: factRow.company_id || ds.company_id,
    snapshot_version_id: snapshotVersionId,
    fact_snapshot_id: factRow.id,
    content_hash: factRow.content_hash,
    period: {
      start_date: factRow.period_start || ds.period?.start_date,
      end_date: factRow.period_end || ds.period?.end_date,
      prior_as_of: factRow.prior_as_of || ds.period?.prior_as_of,
      period_key: ds.period?.period_key,
      prior_start_date: ds.period?.prior_start_date,
      prior_opening_as_of: ds.period?.prior_opening_as_of,
    },
    balances_as_of,
    balances_prior_as_of,
    period_activity,
    cash_flow,
    balances_prior_opening_as_of,
    prior_period_activity,
    prior_cash_flow,
    source_rpc_refs: factRow.source_rpc_refs || ds.source_rpc_refs || [],
    byType(type, basis) {
      if (basis === "opening") return balances_prior_as_of.filter((a) => a.type === type);
      if (basis === "activity") return period_activity.filter((a) => a.type === type);
      return balances_as_of.filter((a) => a.type === type);
    },
  };

  // Freeze surface amounts — consumers must not mutate shared arrays
  Object.freeze(facts.balances_as_of);
  Object.freeze(facts.balances_prior_as_of);
  Object.freeze(facts.period_activity);
  Object.freeze(facts.cash_flow);
  Object.freeze(facts.period);
  // Preserve sealed canonical aggregation (presentation consumers must not recalculate).
  if (ds.canonical_aggregation) {
    (facts as any).canonical_aggregation = Object.freeze({ ...ds.canonical_aggregation });
  }
  if (ds.prior_canonical_aggregation) {
    (facts as any).prior_canonical_aggregation = Object.freeze({ ...ds.prior_canonical_aggregation });
  }
  // Gross debits/credits per account and the fixed asset register, where the
  // seal carries them (snapshots sealed before they were captured do not).
  if (Array.isArray(ds.gross_movements)) (facts as any).gross_movements = ds.gross_movements;
  if (Array.isArray(ds.prior_gross_movements)) (facts as any).prior_gross_movements = ds.prior_gross_movements;
  if (Array.isArray(ds.fixed_asset_register)) (facts as any).fixed_asset_register = ds.fixed_asset_register;
  Object.freeze(facts);

  return facts;
}
