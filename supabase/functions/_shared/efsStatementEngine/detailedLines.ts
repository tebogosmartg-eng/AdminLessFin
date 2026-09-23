/**
 * Detailed statement lines, presented from the chart of accounts.
 *
 * The Statement of Financial Position used to have five lines — Assets, Total
 * Assets, Liabilities, Total Liabilities, Net Assets — because accounts were
 * mapped to taxonomy lines by ACCOUNT TYPE alone, five buckets for the whole
 * ledger. The classification an annual financial statement actually needs was
 * already in the ledger and was being thrown away.
 *
 * This module groups the sealed account balances by their own
 * `category` / `subcategory` and presents them under framework-driven headings.
 *
 * Two rules keep it from becoming a second accounting truth:
 *
 *   1. Every TOTAL is taken from Canonical Financial Aggregation — the same
 *      scalars the dashboard and the operational reports use. Nothing here adds
 *      up a total of its own.
 *   2. The detail must reconcile to those totals. Where the grouped accounts do
 *      not sum to the canonical total, the difference is shown as its own line
 *      rather than absorbed, so a disagreement is visible instead of hidden.
 */
// @ts-nocheck

function n(v) {
  return Number(v || 0);
}

function round2(v) {
  return Math.round(n(v) * 100) / 100;
}

/** Presentation options a framework pack may set. Defaults suit a private entity. */
export const DEFAULT_PRESENTATION = {
  equity_label: "Equity",
  equity_section_label: "Equity",
  result_label: "Profit / (loss) for the period",
  revenue_label: "Revenue",
  retained_earnings_label: "Retained earnings",
  total_assets_label: "Total Assets",
  total_liabilities_label: "Total Liabilities",
  total_equity_and_liabilities_label: "Total Equity and Liabilities",
  gross_profit_label: "Gross profit",
  split_current_non_current: true,
};

export function presentationFor(frameworkPack) {
  const p = frameworkPack?.presentation;
  if (!p || typeof p !== "object") return { ...DEFAULT_PRESENTATION };
  return { ...DEFAULT_PRESENTATION, ...p };
}

/** Order categories the way a statement reads, then anything else alphabetically. */
const CATEGORY_ORDER = {
  Asset: ["Non-Current Assets", "Current Assets"],
  Liability: ["Non-Current Liabilities", "Current Liabilities"],
  Equity: ["Equity"],
};

const SUBCATEGORY_ORDER = [
  // Non-current assets
  "Property, Plant and Equipment",
  "Intangible Assets",
  "Investments",
  // Current assets
  "Inventory",
  "Trade and Other Receivables",
  "Cash and Cash Equivalents",
  // Equity
  "Issued Capital",
  "Reserves",
  "Distributions",
  // Liabilities
  "Interest-bearing Borrowings",
  "Trade and Other Payables",
  "Statutory Payables",
  "Related-party Payables",
  "Provisions",
];

/**
 * Stable codes for the lines other parts of the module bind to — note tables
 * auto-fill from the statement by line code, so these must not drift with
 * position or wording. Anything not listed falls back to a derived code.
 */
const WELL_KNOWN_LINE_CODES = {
  "Property, Plant and Equipment": "sfp.ppe",
  "Intangible Assets": "sfp.intangibles",
  Investments: "sfp.investments",
  Inventory: "sfp.inventory",
  "Trade and Other Receivables": "sfp.receivables",
  "Cash and Cash Equivalents": "sfp.cash",
  "Issued Capital": "sfp.issued_capital",
  Reserves: "sfp.reserves",
  Distributions: "sfp.distributions",
  "Trade and Other Payables": "sfp.payables",
  "Statutory Payables": "sfp.statutory_payables",
  "Related-party Payables": "sfp.related_party_payables",
  Provisions: "sfp.provisions",
  "Interest-bearing Borrowings": "sfp.borrowings",
  Revenue: "perf.revenue",
  "Other Income": "perf.other_income",
  "Cost of Sales": "perf.cost_of_sales",
  "Operating Expenses": "perf.operating_expenses",
  "Other Expenses": "perf.other_expenses",
  "Employee Costs": "perf.employee_costs",
};

function lineCodeFor(category, subcategory, fallback) {
  return WELL_KNOWN_LINE_CODES[subcategory] || WELL_KNOWN_LINE_CODES[category] || fallback;
}

function orderIndex(list, value) {
  const i = list.indexOf(value);
  return i < 0 ? list.length : i;
}

function sortGroups(groups, categoryOrder) {
  return groups.sort((a, b) => {
    const ca = orderIndex(categoryOrder, a.category) - orderIndex(categoryOrder, b.category);
    if (ca !== 0) return ca;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const sa = orderIndex(SUBCATEGORY_ORDER, a.subcategory) - orderIndex(SUBCATEGORY_ORDER, b.subcategory);
    if (sa !== 0) return sa;
    return a.subcategory.localeCompare(b.subcategory);
  });
}

const UNCLASSIFIED = "Unclassified";

function slug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "other";
}

/**
 * Group accounts of one type into {category, subcategory} buckets.
 * `amountOf` reads the figure so the same grouping serves current and prior.
 */
function group(rows, type, amountOf, predicate) {
  const buckets = new Map();
  for (const row of rows || []) {
    if (row.type !== type) continue;
    if (predicate && !predicate(row)) continue;
    const category = String(row.category || "").trim() || UNCLASSIFIED;
    const subcategory = String(row.subcategory || "").trim() || "";
    const key = `${category}||${subcategory}`;
    if (!buckets.has(key)) {
      buckets.set(key, { category, subcategory, amount: 0, accounts: [] });
    }
    const bucket = buckets.get(key);
    const amount = n(amountOf(row));
    bucket.amount += amount;
    bucket.accounts.push({
      id: row.id,
      name: row.name,
      account_code: row.account_code ?? row.account_number ?? null,
      amount: round2(amount),
    });
  }
  return [...buckets.values()];
}

function priorLookup(rows, type, amountOf, predicate) {
  const map = new Map();
  for (const g of group(rows, type, amountOf, predicate)) {
    map.set(`${g.category}||${g.subcategory}`, g.amount);
  }
  return map;
}

function balanceOf(row) {
  return row.balance ?? row.closing_balance ?? 0;
}

function isRetainedEarnings(row) {
  return String(row.account_role || "").toLowerCase() === "retained_earnings";
}

/**
 * Emit the lines for one statement section: a heading per category, a line per
 * subcategory, and the category subtotal. Subtotals here are sums of the very
 * accounts printed directly above them, which is what makes the section add up
 * on the page; the SECTION total still comes from the canonical scalar.
 */
function sectionLines({ prefix, section, groups, priors, level = 0, flatten = false }) {
  const lines = [];
  let index = 0;
  const byCategory = new Map();
  for (const g of groups) {
    if (!byCategory.has(g.category)) byCategory.set(g.category, []);
    byCategory.get(g.category).push(g);
  }

  for (const [category, catGroups] of byCategory) {
    const categoryCode = `${prefix}.${slug(category)}`;
    let categoryTotal = 0;
    let categoryPrior = 0;
    const childLines = [];
    const hasNamedChildren = catGroups.some((g) => g.subcategory);

    for (const g of catGroups) {
      const prior = priors.get(`${g.category}||${g.subcategory}`) ?? 0;
      categoryTotal += g.amount;
      categoryPrior += prior;
      // A statement does not print a line that is nil in both periods. An
      // unclassified bucket is the exception: it is the signal that accounts
      // are missing a classification, so it is printed whenever it is not nil.
      if (Math.abs(g.amount) < 0.005 && Math.abs(prior) < 0.005) continue;
      // Accounts carrying the category but no subcategory sit alongside named
      // subcategories; "Other current assets" reads as a statement line,
      // "Current Assets" repeated under itself does not.
      const label = g.subcategory
        ? g.subcategory
        : hasNamedChildren
          ? `Other ${category.toLowerCase()}`
          : category;
      childLines.push({
        line_code: lineCodeFor(
          g.subcategory ? null : category,
          g.subcategory,
          `${categoryCode}.${slug(g.subcategory || "other")}_${index++}`,
        ),
        label,
        section,
        level: level + 1,
        amount: round2(g.amount),
        prior_amount: round2(prior),
        accounts: g.accounts,
      });
    }

    // A category that is nil in both periods is left off the statement entirely.
    if (childLines.length === 0) continue;

    if (hasNamedChildren && !flatten) {
      lines.push({
        line_code: categoryCode,
        label: category,
        section,
        level,
        is_header: true,
        amount: null,
        prior_amount: null,
        accounts: [],
      });
      lines.push(...childLines);
      lines.push({
        line_code: `${categoryCode}.subtotal`,
        label: `Total ${category}`,
        section,
        level,
        is_subtotal: true,
        amount: round2(categoryTotal),
        prior_amount: round2(categoryPrior),
        accounts: [],
      });
    } else {
      // One line in the category: print it flat, under the category's name.
      for (const child of childLines) {
        lines.push({
          ...child,
          level,
          label: hasNamedChildren ? child.label : category,
        });
      }
    }
  }
  return lines;
}

/** Total of the groups themselves (not of the emitted lines, which include subtotals). */
function groupsTotal(groups) {
  return groups.reduce((acc, g) => acc + n(g.amount), 0);
}

function groupsPriorTotal(groups, priors) {
  return groups.reduce((acc, g) => acc + n(priors.get(`${g.category}||${g.subcategory}`) ?? 0), 0);
}

/**
 * A reconciling line, emitted only when the classified detail does not add up to
 * the canonical total. It is never silently absorbed into another line.
 */
function reconcilingLine({ code, section, detail, canonical, level, label }) {
  const diff = round2(n(canonical) - n(detail));
  if (Math.abs(diff) < 0.005) return null;
  return {
    line_code: code,
    label,
    section,
    level,
    amount: diff,
    prior_amount: null,
    is_reconciling: true,
    accounts: [],
  };
}

export function buildPositionLines({ closing, prior, canonical, presentation }) {
  const p = presentation || DEFAULT_PRESENTATION;
  const lines = [];

  // ── Assets ───────────────────────────────────────────────────────────────
  const assetGroups = sortGroups(group(closing, "Asset", balanceOf), CATEGORY_ORDER.Asset);
  const assetPriors = priorLookup(prior, "Asset", balanceOf);
  lines.push(...sectionLines({ prefix: "sfp.assets", section: "assets", groups: assetGroups, priors: assetPriors }));
  const assetRecon = reconcilingLine({
    code: "sfp.assets.unreconciled",
    section: "assets",
    detail: groupsTotal(assetGroups),
    canonical: canonical.assets,
    level: 0,
    label: "Assets not reconciled to the ledger",
  });
  if (assetRecon) lines.push(assetRecon);
  lines.push({
    line_code: "sfp.total_assets",
    label: p.total_assets_label,
    section: "assets",
    level: 0,
    is_total: true,
    amount: round2(canonical.assets),
    prior_amount: round2(groupsPriorTotal(assetGroups, assetPriors)),
    accounts: [],
  });

  // ── Equity / Net assets ──────────────────────────────────────────────────
  // Stored equity excluding retained earnings, then retained earnings, then the
  // current period result — which is canonical.netProfit, never re-derived.
  const equityGroups = sortGroups(
    group(closing, "Equity", balanceOf, (r) => !isRetainedEarnings(r)),
    CATEGORY_ORDER.Equity,
  );
  const equityPriors = priorLookup(prior, "Equity", balanceOf, (r) => !isRetainedEarnings(r));
  // One heading for the whole section. The accounts' own category is also
  // "Equity", so the per-category heading is flattened away rather than nested
  // under an identical parent.
  lines.push({
    line_code: "sfp.equity",
    label: p.equity_section_label,
    section: "equity",
    level: 0,
    is_header: true,
    amount: null,
    prior_amount: null,
    accounts: [],
  });
  lines.push(
    ...sectionLines({
      prefix: "sfp.equity",
      section: "equity",
      groups: equityGroups,
      priors: equityPriors,
      level: 1,
      flatten: true,
    }),
  );
  const retainedGroups = group(closing, "Equity", balanceOf, isRetainedEarnings);
  const retainedPriors = priorLookup(prior, "Equity", balanceOf, isRetainedEarnings);
  const retainedAmount = groupsTotal(retainedGroups);
  const retainedPrior = groupsPriorTotal(retainedGroups, retainedPriors);
  if (Math.abs(retainedAmount) >= 0.005 || Math.abs(retainedPrior) >= 0.005) {
    lines.push({
      line_code: "sfp.equity.retained_earnings",
      label: p.retained_earnings_label,
      section: "equity",
      level: 1,
      amount: round2(retainedAmount),
      prior_amount: round2(retainedPrior),
      accounts: retainedGroups.flatMap((g) => g.accounts),
    });
  }
  lines.push({
    line_code: "sfp.equity.current_result",
    label: p.result_label,
    section: "equity",
    level: 1,
    amount: round2(canonical.netProfit),
    prior_amount: null,
    accounts: [],
  });
  const equityDetail = groupsTotal(equityGroups) + groupsTotal(retainedGroups) + n(canonical.netProfit);
  const equityRecon = reconcilingLine({
    code: "sfp.equity.unreconciled",
    section: "equity",
    detail: equityDetail,
    canonical: canonical.equity,
    level: 1,
    label: "Equity not reconciled to the ledger",
  });
  if (equityRecon) lines.push(equityRecon);
  lines.push({
    line_code: "sfp.total_equity",
    label: `Total ${p.equity_label}`,
    section: "equity",
    level: 0,
    is_subtotal: true,
    amount: round2(canonical.equity),
    prior_amount: null,
    accounts: [],
  });

  // ── Liabilities ──────────────────────────────────────────────────────────
  const liabilityGroups = sortGroups(
    group(closing, "Liability", balanceOf),
    CATEGORY_ORDER.Liability,
  );
  const liabilityPriors = priorLookup(prior, "Liability", balanceOf);
  lines.push(
    ...sectionLines({
      prefix: "sfp.liabilities",
      section: "liabilities",
      groups: liabilityGroups,
      priors: liabilityPriors,
    }),
  );
  const liabilityRecon = reconcilingLine({
    code: "sfp.liabilities.unreconciled",
    section: "liabilities",
    detail: groupsTotal(liabilityGroups),
    canonical: canonical.liabilities,
    level: 0,
    label: "Liabilities not reconciled to the ledger",
  });
  if (liabilityRecon) lines.push(liabilityRecon);
  lines.push({
    line_code: "sfp.total_liabilities",
    label: p.total_liabilities_label,
    section: "liabilities",
    level: 0,
    is_subtotal: true,
    amount: round2(canonical.liabilities),
    prior_amount: round2(groupsPriorTotal(liabilityGroups, liabilityPriors)),
    accounts: [],
  });

  lines.push({
    line_code: "sfp.total_liabilities_and_equity",
    label: p.total_equity_and_liabilities_label,
    section: "totals",
    level: 0,
    is_grand_total: true,
    amount: round2(canonical.liabilitiesAndEquity),
    prior_amount: null,
    accounts: [],
  });

  return lines;
}

export function buildPerformanceLines({ activity, canonical, presentation }) {
  const p = presentation || DEFAULT_PRESENTATION;
  const lines = [];
  const activityOf = (row) => row.period_activity ?? row.activity ?? 0;

  // Income, split by the ledger's own categories, totalling to the canonical
  // income figure.
  const incomeGroups = sortGroups(group(activity, "Income", activityOf), ["Revenue", "Other Income"]);
  lines.push(
    ...sectionLines({ prefix: "perf.income", section: "revenue", groups: incomeGroups, priors: new Map() }),
  );
  const incomeRecon = reconcilingLine({
    code: "perf.income.unreconciled",
    section: "revenue",
    detail: groupsTotal(incomeGroups),
    canonical: canonical.totalIncome,
    level: 0,
    label: "Income not reconciled to the ledger",
  });
  if (incomeRecon) lines.push(incomeRecon);
  lines.push({
    line_code: "perf.total_revenue",
    label: `Total ${p.revenue_label}`,
    section: "revenue",
    level: 0,
    is_subtotal: true,
    amount: round2(canonical.totalIncome),
    prior_amount: null,
    accounts: [],
  });

  const expenseGroups = sortGroups(group(activity, "Expense", activityOf), [
    "Cost of Sales",
    "Operating Expenses",
    "Other Expenses",
  ]);
  lines.push(
    ...sectionLines({ prefix: "perf.expenses", section: "expenses", groups: expenseGroups, priors: new Map() }),
  );
  const expenseRecon = reconcilingLine({
    code: "perf.expenses.unreconciled",
    section: "expenses",
    detail: groupsTotal(expenseGroups),
    canonical: canonical.totalExpenses,
    level: 0,
    label: "Expenditure not reconciled to the ledger",
  });
  if (expenseRecon) lines.push(expenseRecon);
  lines.push({
    line_code: "perf.total_expenses",
    label: "Total Expenditure",
    section: "expenses",
    level: 0,
    is_subtotal: true,
    amount: round2(canonical.totalExpenses),
    prior_amount: null,
    accounts: [],
  });

  lines.push({
    line_code: "perf.result",
    label: p.result_label,
    section: "result",
    level: 0,
    is_grand_total: true,
    amount: round2(canonical.netProfit),
    prior_amount: null,
    accounts: [],
  });

  return lines;
}

/** True when the sealed facts carry the classification these lines need. */
export function hasClassification(rows) {
  return (rows || []).some((r) => r && (r.category || r.subcategory || r.account_role));
}
