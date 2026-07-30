/**
 * EFS Statement Engine — presentation only.
 * Monetary amounts come exclusively from Canonical Financial Aggregation.
 * Never recalculates Revenue/Expenses/Profit/Assets from raw facts.
 */
// @ts-nocheck
import { classifyFactsToTaxonomy, buildTypeMap } from "./frameworkMapping.ts";
import {
  buildCanonicalFinancialAggregation,
  canonicalToPerformanceLines,
  canonicalToPositionLines,
  canonicalToCashFlowLines,
  canonicalToEquityLines,
} from "../canonicalFinancialAggregation.ts";

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function labelMap(taxonomyLines) {
  const map = {};
  for (const l of taxonomyLines || []) {
    if (l?.line_code) map[l.line_code] = l.label;
  }
  return map;
}

function factsToCanonical(facts) {
  if (facts?.canonical_aggregation) {
    return facts.canonical_aggregation;
  }
  return buildCanonicalFinancialAggregation({
    balancesAsOf: facts.balances_as_of,
    periodActivity: (facts.period_activity || []).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      activity: Number(a.period_activity ?? a.activity ?? 0),
      account_role: a.account_role,
      category: a.category,
      subcategory: a.subcategory,
      account_code: a.account_code != null ? String(a.account_code) : null,
      tax_treatment: a.tax_treatment,
      cash_flow_classification: a.cash_flow_classification,
    })),
    cashFlowData: facts.cash_flow,
    openingBalances: facts.balances_prior_as_of,
  });
}

export function generateFinancialPosition(facts, taxonomyLines, _buckets, agg) {
  const canonical = agg || factsToCanonical(facts);
  return canonicalToPositionLines(canonical, labelMap(taxonomyLines)).map((ln) => ({
    ...ln,
    amount: round2(ln.amount),
    accounts: ln.accounts || [],
  }));
}

export function generateFinancialPerformance(facts, taxonomyLines, _buckets, agg) {
  const canonical = agg || factsToCanonical(facts);
  return canonicalToPerformanceLines(canonical, labelMap(taxonomyLines)).map((ln) => ({
    ...ln,
    amount: round2(ln.amount),
    accounts: ln.accounts || [],
  }));
}

export function generateCashFlows(facts, taxonomyLines, _buckets, agg) {
  let canonical = agg || factsToCanonical(facts);
  // If seal lacked cash-flow RPC facts, operating ≈ period NI (still from canonical).
  if ((!facts.cash_flow || facts.cash_flow.length === 0) && canonical.netCashFlow === 0) {
    canonical = {
      ...canonical,
      cashOperating: canonical.netProfit,
      cashInvesting: 0,
      cashFinancing: 0,
      netCashFlow: canonical.netProfit,
    };
  }
  return canonicalToCashFlowLines(canonical, labelMap(taxonomyLines)).map((ln) => ({
    ...ln,
    amount: round2(ln.amount),
    accounts: ln.accounts || [],
  }));
}

export function generateChangesInEquity(facts, taxonomyLines, _buckets, agg) {
  const canonical = agg || factsToCanonical(facts);
  return canonicalToEquityLines(canonical, labelMap(taxonomyLines)).map((ln) => ({
    ...ln,
    amount: round2(ln.amount),
    accounts: ln.accounts || [],
  }));
}

/**
 * Run Statement Engine for all primary statements against sealed facts.
 * Totals are consumed from Canonical Financial Aggregation — not recalculated.
 */
export function runStatementEngine({
  facts,
  frameworkPack,
  statementDefinitions,
  taxonomyLines,
  defaultTypeMaps,
  tenantMappingLines = [],
  canonicalAggregation = null,
}) {
  if (!facts?.content_hash) throw new Error("Statement Engine requires Financial Facts Adapter output.");

  const typeMap = buildTypeMap(defaultTypeMaps);
  const buckets = classifyFactsToTaxonomy(facts, taxonomyLines, typeMap, tenantMappingLines);
  const agg = canonicalAggregation || factsToCanonical(facts);

  const generators = {
    financial_position: generateFinancialPosition,
    financial_performance: generateFinancialPerformance,
    cash_flows: generateCashFlows,
    changes_in_equity: generateChangesInEquity,
  };

  const defs = [...(statementDefinitions || [])].sort((a, b) => a.sort_order - b.sort_order);
  const statements = [];

  for (const def of defs) {
    const gen = generators[def.statement_type];
    if (!gen) continue;
    const lines = gen(
      facts,
      taxonomyLines.filter((l) => l.statement_type === def.statement_type),
      buckets,
      agg,
    );
    statements.push({
      statement_type: def.statement_type,
      title: def.title,
      framework_key: frameworkPack.framework_key,
      framework_pack_id: frameworkPack.id,
      framework_version: frameworkPack.version_id,
      lines,
      provenance: {
        fact_snapshot_id: facts.fact_snapshot_id,
        snapshot_version_id: facts.snapshot_version_id,
        content_hash: facts.content_hash,
        mapping: "canonical_financial_aggregation",
        live_gl: false,
        canonical_schema: agg.schema_version,
      },
    });
  }

  return {
    generated_at: new Date().toISOString(),
    snapshot_version_id: facts.snapshot_version_id,
    fact_snapshot_id: facts.fact_snapshot_id,
    framework_pack_id: frameworkPack.id,
    canonical_aggregation: agg,
    statements,
  };
}
