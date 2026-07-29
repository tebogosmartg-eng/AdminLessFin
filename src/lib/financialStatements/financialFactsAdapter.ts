/**
 * Frontend mirror of Financial Facts Adapter contract (display / docs).
 * Runtime statement generation executes in the edge Statement Engine —
 * this module must never call Accounting RPCs.
 */
export type SealedAccountFact = {
  id: string;
  name: string;
  type: string;
  balance?: number;
  period_activity?: number;
};

export type SealedFinancialFactsView = {
  content_hash: string;
  fact_snapshot_id: string;
  snapshot_version_id: string;
  live_gl: false;
  period: { start_date: string; end_date: string };
  balances_as_of: SealedAccountFact[];
  period_activity: SealedAccountFact[];
};
