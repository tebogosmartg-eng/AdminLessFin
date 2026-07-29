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
  source_rpc_refs: unknown[];
  /** Framework-neutral account classification helpers (no amount mutation). */
  byType: (type: string, basis: "closing" | "opening" | "activity") => AccountFact[];
};

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeActivity(rows) {
  return asArray(rows).map((a) => ({
    id: a.id,
    account_number: a.account_number,
    name: a.name,
    type: a.type,
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
    balance: Number(a.balance ?? 0),
  }));
  const balances_prior_as_of = asArray(ds.balances_prior_as_of?.accounts ?? ds.balances_prior_as_of).map((a) => ({
    id: a.id,
    account_number: a.account_number,
    name: a.name,
    type: a.type,
    balance: Number(a.balance ?? 0),
  }));
  const period_activity = normalizeActivity(ds.period_activity ?? ds.periodActivity);
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
    },
    balances_as_of,
    balances_prior_as_of,
    period_activity,
    cash_flow,
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
  Object.freeze(facts);

  return facts;
}
