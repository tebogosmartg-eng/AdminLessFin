/**
 * EFS Statement Engine — presentation only.
 * Monetary amounts come exclusively from Canonical Financial Aggregation.
 * Never recalculates Revenue/Expenses/Profit/Assets from raw facts.
 */
// @ts-nocheck
import { classifyFactsToTaxonomy, buildTypeMap } from "./frameworkMapping.ts";
import {
  buildEquityLines,
  buildPerformanceLines,
  buildPositionLines,
  hasClassification,
  presentationFor,
} from "./detailedLines.ts";
import {
  buildCanonicalFinancialAggregation,
  canonicalToPerformanceLines,
  canonicalToPositionLines,
  canonicalToCashFlowLines,
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

/**
 * A sealed aggregation from before equity carried unclosed earlier profit is
 * computed afresh from the same sealed facts — still no live ledger — so an
 * older seal is not printed with an equity figure now known to be incomplete.
 */
function isCurrentAggregation(agg) {
  return agg != null && agg.unclosedPriorEarnings !== undefined;
}

function factsToCanonical(facts) {
  if (isCurrentAggregation(facts?.canonical_aggregation)) {
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

/**
 * The comparative year's aggregation, from the comparative year's sealed
 * movements. Null for a seal that predates them: its comparatives stay blank.
 */
function priorCanonicalOf(facts) {
  if (isCurrentAggregation(facts?.prior_canonical_aggregation)) return facts.prior_canonical_aggregation;
  if (!Array.isArray(facts?.prior_period_activity)) return null;
  return buildCanonicalFinancialAggregation({
    balancesAsOf: facts.balances_prior_as_of,
    openingBalances: facts.balances_prior_opening_as_of || [],
    periodActivity: facts.prior_period_activity.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      activity: Number(a.period_activity ?? a.activity ?? 0),
      account_role: a.account_role,
      category: a.category,
      subcategory: a.subcategory,
      account_code: a.account_code != null ? String(a.account_code) : null,
    })),
    cashFlowData: facts.prior_cash_flow || [],
  });
}

export function generateFinancialPosition(facts, taxonomyLines, _buckets, agg, frameworkPack) {
  const canonical = agg || factsToCanonical(facts);
  // Present from the ledger's own classification where the seal carries it.
  // Snapshots sealed before classification was part of the fact fall back to the
  // five type-level lines rather than being restated from today's chart.
  if (hasClassification(facts.balances_as_of)) {
    return buildPositionLines({
      closing: facts.balances_as_of,
      prior: facts.balances_prior_as_of,
      canonical,
      presentation: presentationFor(frameworkPack),
    });
  }
  return canonicalToPositionLines(canonical, labelMap(taxonomyLines)).map((ln) => ({
    ...ln,
    amount: round2(ln.amount),
    accounts: ln.accounts || [],
  }));
}

export function generateFinancialPerformance(facts, taxonomyLines, _buckets, agg, frameworkPack) {
  const canonical = agg || factsToCanonical(facts);
  if (hasClassification(facts.period_activity)) {
    return buildPerformanceLines({
      activity: facts.period_activity,
      canonical,
      presentation: presentationFor(frameworkPack),
      priorActivity: facts.prior_period_activity,
      priorCanonical: priorCanonicalOf(facts),
    });
  }
  return canonicalToPerformanceLines(canonical, labelMap(taxonomyLines)).map((ln) => ({
    ...ln,
    amount: round2(ln.amount),
    accounts: ln.accounts || [],
  }));
}

/** A liability that holds income tax owed to the revenue authority. */
const INCOME_TAX_PAYABLE = /income tax|current tax|provisional tax/i;

/**
 * The cash flow statement as a published set states it: each activity headed,
 * its main classes of cash flow listed, and the net cash from the activity as
 * the subtotal. The sealed cash flow facts attribute every cash movement to
 * the account on the other side of it; those are grouped here into the
 * classes the standard names (purchase of property, plant and equipment,
 * repayment of borrowings, dividends paid, ...). The subtotals remain the
 * sealed section totals, so nothing is recomputed.
 */
function withCashFlowDetail(sectionLines, facts) {
  const accounts = new Map();
  for (const r of [...(facts.balances_as_of || []), ...(facts.balances_prior_as_of || [])]) {
    if (r?.name && !accounts.has(r.name)) accounts.set(r.name, r);
  }
  const classify = (section, name, amount) => {
    const a = accounts.get(name) || {};
    const sub = String(a.subcategory || "");
    const cat = String(a.category || "");
    if (section === "Operating") {
      if (a.type === "Liability" && INCOME_TAX_PAYABLE.test(name)) return "Tax paid";
      return "Cash generated from operations";
    }
    if (section === "Investing") {
      if (sub === "Property, Plant and Equipment") {
        return amount < 0
          ? "Purchase of property, plant and equipment"
          : "Proceeds on disposal of property, plant and equipment";
      }
      if (sub === "Intangible Assets") {
        return amount < 0 ? "Purchase of intangible assets" : "Proceeds on disposal of intangible assets";
      }
      if (a.type === "Income") return cat === "Other Income" ? "Interest received" : "Investment income received";
      return name;
    }
    if (sub === "Interest-bearing Borrowings") return amount < 0 ? "Repayment of borrowings" : "Proceeds from borrowings";
    if (sub === "Related-party Payables") return "Movement in loans from related parties";
    if (cat === "Finance Costs") return "Finance costs paid";
    if (sub === "Distributions") return "Dividends paid";
    if (sub === "Issued Capital") return "Proceeds on share issue";
    return name;
  };
  const group = (items) => {
    const out = new Map();
    for (const it of items || []) {
      const section = String(it.section || "");
      const label = classify(section, it.category, Number(it.amount || 0));
      const key = `${section}||${label}`;
      out.set(key, round2((out.get(key) || 0) + Number(it.amount || 0)));
    }
    return out;
  };
  const now = group(facts.cash_flow);
  const priorKnown = Array.isArray(facts.prior_cash_flow);
  const then = priorKnown ? group(facts.prior_cash_flow) : new Map();

  const sectionOf = { "cf.operating": "Operating", "cf.investing": "Investing", "cf.financing": "Financing" };
  const headings = {
    Operating: ["Cash flows from operating activities", "Net cash from operating activities"],
    Investing: ["Cash flows from investing activities", "Net cash from investing activities"],
    Financing: ["Cash flows from financing activities", "Net cash from financing activities"],
  };
  const order = [
    "Cash generated from operations",
    "Tax paid",
    "Purchase of property, plant and equipment",
    "Proceeds on disposal of property, plant and equipment",
    "Purchase of intangible assets",
    "Proceeds on disposal of intangible assets",
    "Interest received",
    "Proceeds on share issue",
    "Proceeds from borrowings",
    "Repayment of borrowings",
    "Movement in loans from related parties",
    "Finance costs paid",
    "Dividends paid",
  ];
  const rank = (label) => {
    const i = order.indexOf(label);
    return i === -1 ? order.length : i;
  };

  const out = [];
  for (const line of sectionLines) {
    const section = sectionOf[line.line_code];
    if (!section) {
      out.push(line.line_code === "cf.net_change" ? { ...line, label: "Total cash movement for the year" } : line);
      continue;
    }
    const labels = new Set();
    for (const key of [...now.keys(), ...then.keys()]) {
      const [s, label] = key.split("||");
      if (s === section) labels.add(label);
    }
    const details = [...labels]
      .map((label) => ({
        label,
        amount: now.get(`${section}||${label}`) ?? 0,
        prior: priorKnown ? then.get(`${section}||${label}`) ?? 0 : null,
      }))
      .filter((d) => Math.abs(d.amount) >= 0.005 || (d.prior != null && Math.abs(d.prior) >= 0.005))
      .sort((a, b) => rank(a.label) - rank(b.label));
    const slug = section.toLowerCase();
    out.push({
      line_code: `cf.${slug}.header`,
      label: headings[section][0],
      section: slug,
      level: 0,
      is_header: true,
      amount: null,
      prior_amount: null,
      accounts: [],
    });
    details.forEach((d, i) => {
      out.push({
        line_code: d.label === "Cash generated from operations" ? "cf.operating.cash_generated" : `cf.${slug}.${i}`,
        label: d.label,
        section: slug,
        level: 1,
        amount: d.amount,
        prior_amount: d.prior,
        accounts: [],
      });
    });
    out.push({ ...line, label: headings[section][1], is_subtotal: true, level: 0 });
  }
  return out;
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
  const prior = Array.isArray(facts.prior_cash_flow) ? priorCanonicalOf(facts) : null;
  const priorFor = {
    "cf.operating": "cashOperating",
    "cf.investing": "cashInvesting",
    "cf.financing": "cashFinancing",
    "cf.net_change": "netCashFlow",
  };
  const sectionLines = canonicalToCashFlowLines(canonical, labelMap(taxonomyLines)).map((ln) => ({
    ...ln,
    amount: round2(ln.amount),
    prior_amount: prior && priorFor[ln.line_code] ? round2(prior[priorFor[ln.line_code]]) : null,
    accounts: ln.accounts || [],
  }));
  const flows = withCashFlowDetail(sectionLines, facts);
  // A statement of cash flows closes by reconciling to the cash on the
  // balance sheet: cash at the start of the year, the year's net movement,
  // cash at the end.
  const cashIn = (rows) =>
    round2(
      (rows || [])
        .filter((r) => {
          if (r.type !== "Asset") return false;
          const role = String(r.account_role || "").toLowerCase();
          return role === "bank" || role === "cash" || String(r.subcategory || "") === "Cash and Cash Equivalents";
        })
        .reduce((sum, r) => sum + Number(r.balance ?? 0), 0),
    );
  const hasCash = [...(facts.balances_as_of || []), ...(facts.balances_prior_as_of || [])].some(
    (r) => r.subcategory === "Cash and Cash Equivalents" || ["bank", "cash"].includes(String(r.account_role || "").toLowerCase()),
  );
  if (!hasCash) return flows;
  const priorOpening = Array.isArray(facts.prior_period_activity) ? cashIn(facts.balances_prior_opening_as_of) : null;
  return [
    ...flows,
    {
      line_code: "cf.cash_opening",
      label: "Cash and cash equivalents at the beginning of the year",
      section: "totals",
      amount: cashIn(facts.balances_prior_as_of),
      prior_amount: priorOpening,
      accounts: [],
    },
    {
      line_code: "cf.cash_closing",
      label: "Cash and cash equivalents at the end of the year",
      section: "totals",
      is_grand_total: true,
      amount: cashIn(facts.balances_as_of),
      prior_amount: Array.isArray(facts.prior_period_activity) ? cashIn(facts.balances_prior_as_of) : null,
      accounts: [],
    },
  ];
}

export function generateChangesInEquity(facts, _taxonomyLines, _buckets, agg) {
  const canonical = agg || factsToCanonical(facts);
  return buildEquityLines({
    canonical,
    priorCanonical: priorCanonicalOf(facts),
    closing: facts.balances_as_of || [],
    prior: facts.balances_prior_as_of || [],
    priorOpening: facts.balances_prior_opening_as_of || [],
    period: facts.period || {},
  });
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
  const agg = isCurrentAggregation(canonicalAggregation) ? canonicalAggregation : factsToCanonical(facts);

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
      frameworkPack,
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
