/**
 * Shared table asset index (V14.2).
 * Statutory table builders remain in the pack content library. Future amendments
 * may extract individual table factories into this folder without changing the
 * Framework Content Engine.
 */
export const TABLE_ASSET_KEYS = [
  'ppe_rollforward',
  'intangibles_rollforward',
  'investment_property',
  'revenue_disaggregation',
  'receivables_ageing',
  'payables',
  'lease_maturity',
  'borrowings',
  'deferred_tax',
  'tax_reconciliation',
  'share_capital',
  'cash_flow_reconciliation',
  'financial_instrument_categories',
  'related_party',
  'key_management',
  'provisions',
  'commitments',
  'contingencies',
  'inventories',
  'employee_benefits',
  'non_exchange_revenue',
  'exchange_revenue',
  'budget_comparison',
] as const;

export type TableAssetKey = (typeof TABLE_ASSET_KEYS)[number];
