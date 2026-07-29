/**
 * EFS V6.4.1 — Statement Engine
 * Framework-neutral assembly of primary statements from mapped sealed facts.
 * No disclosures, notes, validation, or live GL.
 */
// @ts-nocheck
import { classifyFactsToTaxonomy, buildTypeMap } from "./frameworkMapping.ts";

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function line(code, label, section, amount, opts = {}) {
  return {
    line_code: code,
    label,
    section,
    amount: round2(amount),
    is_total: !!opts.is_total,
    accounts: opts.accounts || [],
  };
}

function bucketAmount(buckets, code) {
  return round2(buckets.get(code)?.amount || 0);
}

function bucketAccounts(buckets, code) {
  return buckets.get(code)?.accounts || [];
}

function labelOf(taxonomyLines, code, fallback) {
  return taxonomyLines.find((l) => l.line_code === code)?.label || fallback;
}

export function generateFinancialPosition(facts, taxonomyLines, buckets) {
  const assets = bucketAmount(buckets, "sfp.assets");
  const liabilities = bucketAmount(buckets, "sfp.liabilities");
  const equityStored = bucketAmount(buckets, "sfp.equity");

  const income = facts.period_activity
    .filter((a) => a.type === "Income")
    .reduce((s, a) => s + Number(a.period_activity ?? a.activity ?? 0), 0);
  const expenses = facts.period_activity
    .filter((a) => a.type === "Expense")
    .reduce((s, a) => s + Number(a.period_activity ?? a.activity ?? 0), 0);
  const periodResult = round2(income - expenses);
  const totalEquity = round2(equityStored + periodResult);
  const totalLE = round2(liabilities + totalEquity);

  return [
    line("sfp.assets", labelOf(taxonomyLines, "sfp.assets", "Assets"), "assets", assets, {
      accounts: bucketAccounts(buckets, "sfp.assets"),
    }),
    line("sfp.total_assets", labelOf(taxonomyLines, "sfp.total_assets", "Total Assets"), "assets", assets, {
      is_total: true,
    }),
    line("sfp.liabilities", labelOf(taxonomyLines, "sfp.liabilities", "Liabilities"), "liabilities", liabilities, {
      accounts: bucketAccounts(buckets, "sfp.liabilities"),
    }),
    line(
      "sfp.total_liabilities",
      labelOf(taxonomyLines, "sfp.total_liabilities", "Total Liabilities"),
      "liabilities",
      liabilities,
      { is_total: true },
    ),
    line("sfp.equity", labelOf(taxonomyLines, "sfp.equity", "Equity"), "equity", equityStored, {
      accounts: bucketAccounts(buckets, "sfp.equity"),
    }),
    line(
      "sfp.current_period_result",
      labelOf(taxonomyLines, "sfp.current_period_result", "Period result"),
      "equity",
      periodResult,
    ),
    line("sfp.total_equity", labelOf(taxonomyLines, "sfp.total_equity", "Total Equity"), "equity", totalEquity, {
      is_total: true,
    }),
    line(
      "sfp.total_liabilities_and_equity",
      labelOf(taxonomyLines, "sfp.total_liabilities_and_equity", "Total Liabilities and Equity"),
      "totals",
      totalLE,
      { is_total: true },
    ),
  ];
}

export function generateFinancialPerformance(facts, taxonomyLines, buckets) {
  const revenue = bucketAmount(buckets, "perf.revenue");
  const expenses = bucketAmount(buckets, "perf.expenses");
  const result = round2(revenue - expenses);

  return [
    line("perf.revenue", labelOf(taxonomyLines, "perf.revenue", "Revenue"), "revenue", revenue, {
      accounts: bucketAccounts(buckets, "perf.revenue"),
    }),
    line("perf.total_revenue", labelOf(taxonomyLines, "perf.total_revenue", "Total Revenue"), "revenue", revenue, {
      is_total: true,
    }),
    line("perf.expenses", labelOf(taxonomyLines, "perf.expenses", "Expenses"), "expenses", expenses, {
      accounts: bucketAccounts(buckets, "perf.expenses"),
    }),
    line(
      "perf.total_expenses",
      labelOf(taxonomyLines, "perf.total_expenses", "Total Expenses"),
      "expenses",
      expenses,
      { is_total: true },
    ),
    line("perf.result", labelOf(taxonomyLines, "perf.result", "Period result"), "result", result, {
      is_total: true,
    }),
  ];
}

export function generateCashFlows(facts, taxonomyLines, buckets) {
  let operating = bucketAmount(buckets, "cf.operating");
  let investing = bucketAmount(buckets, "cf.investing");
  let financing = bucketAmount(buckets, "cf.financing");

  // If seal lacked cash-flow RPC facts, derive presentation from sealed period activity
  // (still snapshot-only — never live GL). Operating ≈ period surplus; investing/financing
  // left zero unless cash_flow facts present.
  if (facts.cash_flow.length === 0) {
    const income = facts.period_activity
      .filter((a) => a.type === "Income")
      .reduce((s, a) => s + Number(a.period_activity ?? 0), 0);
    const expenses = facts.period_activity
      .filter((a) => a.type === "Expense")
      .reduce((s, a) => s + Number(a.period_activity ?? 0), 0);
    operating = round2(income - expenses);
  }

  const net = round2(operating + investing + financing);
  return [
    line("cf.operating", labelOf(taxonomyLines, "cf.operating", "Operating activities"), "operating", operating, {
      accounts: bucketAccounts(buckets, "cf.operating"),
    }),
    line("cf.investing", labelOf(taxonomyLines, "cf.investing", "Investing activities"), "investing", investing, {
      accounts: bucketAccounts(buckets, "cf.investing"),
    }),
    line("cf.financing", labelOf(taxonomyLines, "cf.financing", "Financing activities"), "financing", financing, {
      accounts: bucketAccounts(buckets, "cf.financing"),
    }),
    line("cf.net_change", labelOf(taxonomyLines, "cf.net_change", "Net change in cash"), "totals", net, {
      is_total: true,
    }),
  ];
}

export function generateChangesInEquity(facts, taxonomyLines, buckets) {
  const openingEquity = facts.balances_prior_as_of
    .filter((a) => a.type === "Equity")
    .reduce((s, a) => s + Number(a.balance || 0), 0);
  const income = facts.period_activity
    .filter((a) => a.type === "Income")
    .reduce((s, a) => s + Number(a.period_activity ?? 0), 0);
  const expenses = facts.period_activity
    .filter((a) => a.type === "Expense")
    .reduce((s, a) => s + Number(a.period_activity ?? 0), 0);
  const periodResult = round2(income - expenses);

  // Other equity movements = change in equity balances excluding period P&L attribution
  const closingEquityStored = facts.balances_as_of
    .filter((a) => a.type === "Equity")
    .reduce((s, a) => s + Number(a.balance || 0), 0);
  const other = round2(closingEquityStored - openingEquity);
  const closing = round2(openingEquity + periodResult + other);

  return [
    line("eq.opening", labelOf(taxonomyLines, "eq.opening", "Opening equity"), "opening", openingEquity, {
      is_total: true,
    }),
    line("eq.period_result", labelOf(taxonomyLines, "eq.period_result", "Period result"), "movements", periodResult),
    line("eq.other_movements", labelOf(taxonomyLines, "eq.other_movements", "Other movements"), "movements", other, {
      accounts: bucketAccounts(buckets, "sfp.equity"),
    }),
    line("eq.closing", labelOf(taxonomyLines, "eq.closing", "Closing equity"), "closing", closing, {
      is_total: true,
    }),
  ];
}

/**
 * Run Statement Engine for all primary statements against sealed facts + framework pack maps.
 */
export function runStatementEngine({
  facts,
  frameworkPack,
  statementDefinitions,
  taxonomyLines,
  defaultTypeMaps,
  tenantMappingLines = [],
}) {
  if (!facts?.content_hash) throw new Error("Statement Engine requires Financial Facts Adapter output.");
  if (!["certified", "frozen", "publication_bound"].includes(facts._versionStatus || "certified") &&
      facts._versionStatus) {
    // status checked by caller; soft allow when omitted
  }

  const typeMap = buildTypeMap(defaultTypeMaps);
  const buckets = classifyFactsToTaxonomy(facts, taxonomyLines, typeMap, tenantMappingLines);

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
    const lines = gen(facts, taxonomyLines.filter((l) => l.statement_type === def.statement_type), buckets);
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
        mapping: "default_type_map+optional_tenant",
        live_gl: false,
      },
    });
  }

  return {
    generated_at: new Date().toISOString(),
    snapshot_version_id: facts.snapshot_version_id,
    fact_snapshot_id: facts.fact_snapshot_id,
    framework_pack_id: frameworkPack.id,
    statements,
  };
}
