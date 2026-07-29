/**
 * Shared statement asset index (V14.2).
 * Statement definitions remain authored in the pack content library and are
 * exposed through the Knowledge Repository registry — this module documents
 * the asset boundary for future versioned statement packs.
 */
export const STATEMENT_ASSET_KEYS = [
  'financial_position',
  'financial_performance',
  'changes_in_equity',
  'cash_flows',
] as const;

export type StatementAssetKey = (typeof STATEMENT_ASSET_KEYS)[number];
