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
  result_label: "Profit / (loss) for the year",
  revenue_label: "Revenue",
  retained_earnings_label: "Retained earnings",
  total_assets_label: "Total assets",
  total_liabilities_label: "Total liabilities",
  total_equity_and_liabilities_label: "Total equity and liabilities",
  gross_profit_label: "Gross profit",
  split_current_non_current: true,
};

/** "28 February 2027" — for the balance rows of the equity statement. */
function longDate(iso) {
  const raw = String(iso || "").slice(0, 10);
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function presentationFor(frameworkPack) {
  const p = frameworkPack?.presentation;
  if (!p || typeof p !== "object") return { ...DEFAULT_PRESENTATION };
  const merged = { ...DEFAULT_PRESENTATION, ...p };
  // A framework decides what a total is called; a published statement states
  // it in sentence case ("Total equity and liabilities").
  for (const key of ["total_assets_label", "total_liabilities_label", "total_equity_and_liabilities_label"]) {
    const v = String(merged[key] || "");
    if (v) merged[key] = v.charAt(0) + v.slice(1).toLowerCase();
  }
  return merged;
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
  "Finance Costs": "perf.finance_costs",
  Taxation: "perf.taxation",
};

/**
 * The chart's classification vocabulary is Title Case; a published statement
 * reads in sentence case ("Cost of sales", "Trade and other receivables").
 */
const STATEMENT_LABELS = {
  "Non-Current Assets": "Non-current assets",
  "Current Assets": "Current assets",
  "Non-Current Liabilities": "Non-current liabilities",
  "Current Liabilities": "Current liabilities",
  "Property, Plant and Equipment": "Property, plant and equipment",
  "Intangible Assets": "Intangible assets",
  "Trade and Other Receivables": "Trade and other receivables",
  "Cash and Cash Equivalents": "Cash and cash equivalents",
  "Issued Capital": "Share capital",
  "Interest-bearing Borrowings": "Interest-bearing borrowings",
  "Trade and Other Payables": "Trade and other payables",
  "Statutory Payables": "Statutory payables",
  "Related-party Payables": "Loans from related parties",
  "Cost of Sales": "Cost of sales",
  "Other Income": "Other income",
  "Operating Expenses": "Operating expenses",
  "Employee Costs": "Employee costs",
  "Finance Costs": "Finance costs",
  "Other Expenses": "Other expenses",
};
function present(label) {
  return STATEMENT_LABELS[label] || label;
}

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
function sectionLines({ prefix, section, groups, priors, level = 0, flatten = false, priorKnown = true }) {
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
        ? present(g.subcategory)
        : hasNamedChildren
          ? `Other ${present(category).toLowerCase()}`
          : present(category);
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
        // Unknown is not nil: without the comparative year's movements the
        // figure is left blank rather than printed as a dash.
        prior_amount: priorKnown ? round2(prior) : null,
        accounts: g.accounts,
      });
    }

    // A category that is nil in both periods is left off the statement entirely.
    if (childLines.length === 0) continue;

    if (hasNamedChildren && !flatten) {
      lines.push({
        line_code: categoryCode,
        label: present(category),
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
        label: `Total ${present(category).toLowerCase()}`,
        section,
        level,
        is_subtotal: true,
        amount: round2(categoryTotal),
        prior_amount: priorKnown ? round2(categoryPrior) : null,
        accounts: [],
      });
    } else {
      // One line in the category: print it flat, under the category's name.
      for (const child of childLines) {
        lines.push({
          ...child,
          level,
          label: hasNamedChildren ? child.label : present(category),
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

  // ── Equity and Liabilities ───────────────────────────────────────────────
  // The claims side of the statement opens under its own banner, the way a
  // published set reads: Equity and Liabilities → Equity → Liabilities.
  lines.push({
    line_code: "sfp.equity_and_liabilities",
    label: "Equity and liabilities",
    section: "equity",
    level: 0,
    is_header: true,
    amount: null,
    prior_amount: null,
    accounts: [],
  });
  // Stored equity excluding retained earnings, then retained earnings, then the
  // current period result — which is canonical.netProfit, never re-derived.
  const equityGroups = sortGroups(
    group(closing, "Equity", balanceOf, (r) => !isRetainedEarnings(r) && !isDistribution(r)),
    CATEGORY_ORDER.Equity,
  );
  const equityPriors = priorLookup(prior, "Equity", balanceOf, (r) => !isRetainedEarnings(r) && !isDistribution(r));
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
  // Retained earnings as a balance sheet states them: the retained earnings
  // account plus every period's profit still held in the income and expense
  // accounts — this year's and any earlier year's not yet closed off. It used
  // to add only this year's profit, which left last year's out of equity and
  // put the statement out of balance by exactly that amount.
  // Dividends and drawings are appropriations of retained earnings.
  const inRetained = (r) => isRetainedEarnings(r) || isDistribution(r);
  const retainedGroups = group(closing, "Equity", balanceOf, inRetained);
  const retainedPriors = priorLookup(prior, "Equity", balanceOf, inRetained);
  const profitAccounts = (rows) =>
    (rows || [])
      .filter((r) => r.type === "Income" || r.type === "Expense")
      .map((r) => ({
        id: r.id,
        name: r.name,
        account_code: r.account_code ?? r.account_number ?? null,
        amount: round2((r.type === "Income" ? 1 : -1) * n(balanceOf(r))),
      }));
  const profitNow = profitAccounts(closing);
  const profitThen = profitAccounts(prior);
  // This year's figure is taken from the canonical scalars, so it holds even
  // where the balances carry no income or expense accounts; the accounts are
  // listed alongside only to trace it.
  const retainedAmount =
    groupsTotal(retainedGroups) + n(canonical.unclosedPriorEarnings) + n(canonical.netProfit);
  const retainedPrior =
    groupsPriorTotal(retainedGroups, retainedPriors) + profitThen.reduce((a, r) => a + r.amount, 0);
  if (Math.abs(retainedAmount) >= 0.005 || Math.abs(retainedPrior) >= 0.005) {
    lines.push({
      line_code: "sfp.equity.retained_earnings",
      label: p.retained_earnings_label,
      section: "equity",
      level: 1,
      amount: round2(retainedAmount),
      prior_amount: round2(retainedPrior),
      accounts: [...retainedGroups.flatMap((g) => g.accounts), ...profitNow.filter((a) => a.amount !== 0)],
    });
  }
  const equityDetail = groupsTotal(equityGroups) + retainedAmount;
  const equityRecon = reconcilingLine({
    code: "sfp.equity.unreconciled",
    section: "equity",
    detail: equityDetail,
    canonical: canonical.equity,
    level: 1,
    label: "Equity not reconciled to the ledger",
  });
  if (equityRecon) lines.push(equityRecon);
  const equityPrior = groupsPriorTotal(equityGroups, equityPriors) + retainedPrior;
  lines.push({
    line_code: "sfp.total_equity",
    label: `Total ${p.equity_label.toLowerCase()}`,
    section: "equity",
    level: 0,
    is_subtotal: true,
    amount: round2(canonical.equity),
    prior_amount: round2(equityPrior),
    accounts: [],
  });

  // ── Liabilities ──────────────────────────────────────────────────────────
  lines.push({
    line_code: "sfp.liabilities",
    label: "Liabilities",
    section: "liabilities",
    level: 0,
    is_header: true,
    amount: null,
    prior_amount: null,
    accounts: [],
  });
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
  const liabilitiesPrior = groupsPriorTotal(liabilityGroups, liabilityPriors);
  lines.push({
    line_code: "sfp.total_liabilities",
    label: p.total_liabilities_label,
    section: "liabilities",
    level: 0,
    is_subtotal: true,
    amount: round2(canonical.liabilities),
    prior_amount: round2(liabilitiesPrior),
    accounts: [],
  });

  lines.push({
    line_code: "sfp.total_liabilities_and_equity",
    label: p.total_equity_and_liabilities_label,
    section: "totals",
    level: 0,
    is_grand_total: true,
    amount: round2(canonical.liabilitiesAndEquity),
    prior_amount: round2(liabilitiesPrior + equityPrior),
    accounts: [],
  });

  return lines;
}

/**
 * The face of the statement of comprehensive income, read the way a published
 * set reads: revenue, cost of sales, gross profit, other income, the expense
 * lines, the result, other comprehensive income and total comprehensive
 * income. The final result is the canonical scalar; the gross-profit tier is
 * a subtotal of the very lines printed above it, and any classified detail
 * that does not add up to the canonical totals is shown as a reconciling
 * line, never absorbed.
 */
export function buildPerformanceLines({ activity, canonical, presentation, priorActivity = null, priorCanonical = null }) {
  const p = presentation || DEFAULT_PRESENTATION;
  const lines = [];
  const activityOf = (row) => row.period_activity ?? row.activity ?? 0;
  // Last year's revenue and expenses are last year's movements, sealed with
  // this year's. A seal without them leaves the comparatives blank.
  const priorKnown = Array.isArray(priorActivity) && priorCanonical != null;
  const incomePriors = priorKnown ? priorLookup(priorActivity, "Income", activityOf) : new Map();
  const expensePriors = priorKnown ? priorLookup(priorActivity, "Expense", activityOf) : new Map();
  const priorOf = (key) => (priorKnown ? round2(priorCanonical[key]) : null);
  const groupPrior = (groups, priors) => (priorKnown ? round2(groupsPriorTotal(groups, priors)) : null);

  // ── Revenue ──────────────────────────────────────────────────────────────
  const incomeGroups = sortGroups(group(activity, "Income", activityOf), ["Revenue", "Other Income"]);
  const revenueGroups = incomeGroups.filter((g) => g.category !== "Other Income");
  const otherIncomeGroups = incomeGroups.filter((g) => g.category === "Other Income");
  const revenueLines = sectionLines({
    prefix: "perf.income",
    section: "revenue",
    groups: revenueGroups,
    priors: incomePriors,
    priorKnown,
  });
  lines.push(...revenueLines);
  if (revenueLines.filter((l) => !l.is_header).length > 1) {
    lines.push({
      line_code: "perf.total_revenue",
      label: `Total ${p.revenue_label.toLowerCase()}`,
      section: "revenue",
      level: 0,
      is_subtotal: true,
      amount: round2(groupsTotal(revenueGroups)),
      prior_amount: groupPrior(revenueGroups, incomePriors),
      accounts: [],
    });
  }

  // ── Cost of sales and the gross-profit tier ──────────────────────────────
  const expenseGroups = sortGroups(group(activity, "Expense", activityOf), [
    "Cost of Sales",
    "Operating Expenses",
    "Other Expenses",
    "Finance Costs",
    "Taxation",
  ]);
  const cosGroups = expenseGroups.filter((g) => g.category === "Cost of Sales");
  const financeGroups = expenseGroups.filter((g) => g.category === "Finance Costs");
  const taxGroups = expenseGroups.filter((g) => g.category === "Taxation");
  const otherExpenseGroups = expenseGroups.filter(
    (g) => !["Cost of Sales", "Finance Costs", "Taxation"].includes(g.category),
  );
  if (cosGroups.length) {
    lines.push(
      ...sectionLines({ prefix: "perf.expenses", section: "expenses", groups: cosGroups, priors: expensePriors, priorKnown }),
    );
    lines.push({
      line_code: "perf.gross_profit",
      label: p.gross_profit_label,
      section: "gross",
      level: 0,
      is_subtotal: true,
      amount: round2(groupsTotal(revenueGroups) - groupsTotal(cosGroups)),
      prior_amount: priorKnown
        ? round2(groupsPriorTotal(revenueGroups, incomePriors) - groupsPriorTotal(cosGroups, expensePriors))
        : null,
      accounts: [],
    });
  }

  // ── Other income, then the remaining expense lines ───────────────────────
  lines.push(
    ...sectionLines({ prefix: "perf.income", section: "revenue", groups: otherIncomeGroups, priors: incomePriors, priorKnown }),
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

  lines.push(
    ...sectionLines({
      prefix: "perf.expenses",
      section: "expenses",
      groups: otherExpenseGroups,
      priors: expensePriors,
      priorKnown,
    }),
  );
  // Below the operating result: finance costs, then tax — each with the
  // subtotal a published statement states before it.
  const nowOf = (groups) => groupsTotal(groups);
  const thenOf = (groups) => groupsPriorTotal(groups, expensePriors);
  const operatingNow = groupsTotal(incomeGroups) - nowOf(cosGroups) - nowOf(otherExpenseGroups);
  const operatingThen = priorKnown
    ? groupsPriorTotal(incomeGroups, incomePriors) - thenOf(cosGroups) - thenOf(otherExpenseGroups)
    : null;
  if (financeGroups.length || taxGroups.length) {
    lines.push({
      line_code: "perf.operating_profit",
      label: "Operating profit / (loss)",
      section: "result",
      level: 0,
      is_subtotal: true,
      amount: round2(operatingNow),
      prior_amount: operatingThen == null ? null : round2(operatingThen),
      accounts: [],
    });
  }
  if (financeGroups.length) {
    lines.push(
      ...sectionLines({ prefix: "perf.expenses", section: "expenses", groups: financeGroups, priors: expensePriors, priorKnown }),
    );
  }
  if (taxGroups.length) {
    lines.push({
      line_code: "perf.profit_before_tax",
      label: "Profit / (loss) before taxation",
      section: "result",
      level: 0,
      is_subtotal: true,
      amount: round2(operatingNow - nowOf(financeGroups)),
      prior_amount: operatingThen == null ? null : round2(operatingThen - thenOf(financeGroups)),
      accounts: [],
    });
    lines.push(
      ...sectionLines({ prefix: "perf.expenses", section: "expenses", groups: taxGroups, priors: expensePriors, priorKnown }),
    );
  }

  const expenseRecon = reconcilingLine({
    code: "perf.expenses.unreconciled",
    section: "expenses",
    detail: groupsTotal(expenseGroups),
    canonical: canonical.totalExpenses,
    level: 0,
    label: "Expenditure not reconciled to the ledger",
  });
  if (expenseRecon) lines.push(expenseRecon);

  // ── Result and comprehensive income ──────────────────────────────────────
  lines.push({
    line_code: "perf.result",
    label: p.result_label,
    section: "result",
    level: 0,
    is_total: true,
    amount: round2(canonical.netProfit),
    prior_amount: priorOf("netProfit"),
    accounts: [],
  });
  lines.push({
    line_code: "perf.oci",
    label: "Other comprehensive income",
    section: "result",
    level: 0,
    amount: 0,
    prior_amount: priorKnown ? 0 : null,
    accounts: [],
  });
  lines.push({
    line_code: "perf.total_comprehensive",
    label: "Total comprehensive income for the year",
    section: "result",
    level: 0,
    is_grand_total: true,
    amount: round2(canonical.netProfit),
    prior_amount: priorOf("netProfit"),
    accounts: [],
  });

  return lines;
}

/** Distributions to owners (dividends, drawings) — they reduce retained earnings. */
function isDistribution(row) {
  return String(row?.subcategory || "") === "Distributions";
}

/** Share capital and other non-retained equity at a balance date. */
function capitalAt(balances) {
  return round2(
    (balances || [])
      .filter((r) => r.type === "Equity" && !isRetainedEarnings(r) && !isDistribution(r))
      .reduce((sum, r) => sum + n(balanceOf(r)), 0),
  );
}

/** Cumulative distributions at a balance date (a debit, so negative). */
function distributionsAt(balances) {
  return round2(
    (balances || [])
      .filter((r) => r.type === "Equity" && isDistribution(r))
      .reduce((sum, r) => sum + n(balanceOf(r)), 0),
  );
}

/**
 * The Statement of Changes in Equity as a published set states it: one column
 * per component — share capital where the company has it, retained earnings,
 * total equity — with both years' movements as rows between the opening and
 * closing balance of each year. The totals column is canonical scalars
 * throughout; the retained-earnings column is the total less the capital
 * accounts, so the matrix cross-adds to the cent by construction.
 *
 * The line codes the platform articulates on are unchanged: `eq.period_result`
 * is the current year's profit row and `eq.closing` the closing balance, each
 * still carrying `prior_amount` for the comparative-year checks.
 */
export function buildEquityLines({
  canonical,
  priorCanonical = null,
  closing = [],
  prior = [],
  priorOpening = [],
  period = {},
}) {
  const priorKnown = priorCanonical != null && priorCanonical.openingEquity != null;
  const lines = [];

  const capitalClose = capitalAt(closing);
  const capitalOpen = capitalAt(prior);
  const capitalPriorOpen = capitalAt(priorOpening);
  // No capital accounts anywhere: the statement presents retained earnings and
  // the total only, rather than a column of dashes.
  const hasCapital = [capitalClose, capitalOpen, capitalPriorOpen].some(
    (v) => Math.abs(v) >= 0.005,
  );
  const cell = (capital, total) => ({
    capital: hasCapital ? round2(capital) : null,
    retained: round2(n(total) - (hasCapital ? n(capital) : 0)),
    total: round2(total),
  });
  const movement = (retained) => ({
    capital: hasCapital ? 0 : null,
    retained: round2(retained),
    total: round2(retained),
  });

  const endLong = longDate(period.end_date);
  const priorEndLong = longDate(period.prior_as_of);
  const priorOpeningLong = longDate(period.prior_opening_as_of);
  const balanceLabel = (dateLong, fallback) => (dateLong ? `Balance at ${dateLong}` : fallback);

  const push = (line) => lines.push({ level: 0, accounts: [], ...line });

  // Transactions with owners, each in the column it belongs to: shares issued
  // in share capital, dividends in retained earnings, and anything else the
  // ledger moved in equity outside profit as other movements.
  const ownerMovements = ({ prefix, other, capitalMove, dividendMove, priorAmounts }) => {
    const total = round2(other);
    const cap = hasCapital ? capitalMove : 0;
    const residual = round2(total - cap - dividendMove);
    const rows = [
      {
        code: `${prefix}shares_issued`,
        label: "Issue of shares",
        amount: cap,
        prior: priorAmounts ? (hasCapital ? priorAmounts.capitalMove : 0) : null,
        columns: { capital: hasCapital ? cap : null, retained: 0, total: cap },
      },
      {
        code: `${prefix}dividends`,
        label: "Dividends",
        amount: dividendMove,
        prior: priorAmounts ? priorAmounts.dividendMove : null,
        columns: { capital: hasCapital ? 0 : null, retained: dividendMove, total: dividendMove },
      },
      {
        code: prefix === "eq." ? "eq.other_movements" : `${prefix}other`,
        label: "Other movements in equity",
        amount: residual,
        prior: priorAmounts
          ? round2(priorAmounts.other - (hasCapital ? priorAmounts.capitalMove : 0) - priorAmounts.dividendMove)
          : null,
        columns: { capital: hasCapital ? 0 : null, retained: residual, total: residual },
      },
    ].filter((r) => Math.abs(r.amount) >= 0.005);
    for (const r of rows) {
      push({
        line_code: r.code,
        label: r.label,
        section: "movements",
        level: 1,
        amount: r.amount,
        prior_amount: r.prior,
        columns: r.columns,
      });
    }
    if (rows.length > 1) {
      push({
        line_code: `${prefix}owner_total`,
        label: "Total contributions by and distributions to owners of company recognised directly in equity",
        section: "movements",
        level: 1,
        is_subtotal: true,
        amount: total,
        prior_amount: priorAmounts ? round2(priorAmounts.other) : null,
        columns: {
          capital: hasCapital ? cap : null,
          retained: round2(total - cap),
          total,
        },
      });
    }
  };

  if (priorKnown) {
    // ── The comparative year ────────────────────────────────────────────────
    push({
      line_code: "eq.prior_opening",
      label: balanceLabel(priorOpeningLong, "Balance at the beginning of the comparative year"),
      section: "opening",
      is_total: true,
      amount: round2(priorCanonical.openingEquity),
      prior_amount: null,
      columns: cell(capitalPriorOpen, priorCanonical.openingEquity),
    });
    push({
      line_code: "eq.prior_result",
      label: "Profit / (loss) for the year",
      section: "movements",
      level: 1,
      amount: round2(priorCanonical.netProfit),
      prior_amount: null,
      columns: movement(priorCanonical.netProfit),
    });
    push({
      line_code: "eq.prior_oci",
      label: "Other comprehensive income",
      section: "movements",
      level: 1,
      amount: 0,
      prior_amount: null,
      columns: movement(0),
    });
    push({
      line_code: "eq.prior_tci",
      label: "Total comprehensive income for the year",
      section: "movements",
      level: 1,
      is_subtotal: true,
      amount: round2(priorCanonical.netProfit),
      prior_amount: null,
      columns: movement(priorCanonical.netProfit),
    });
    ownerMovements({
      prefix: "eq.prior_",
      other: priorCanonical.otherEquityMovements,
      capitalMove: round2(capitalOpen - capitalPriorOpen),
      dividendMove: round2(distributionsAt(prior) - distributionsAt(priorOpening)),
      priorAmounts: null,
    });
  }

  // ── This year ─────────────────────────────────────────────────────────────
  push({
    line_code: "eq.opening",
    label: balanceLabel(priorEndLong, "Balance at the beginning of the year"),
    section: "opening",
    is_total: true,
    amount: round2(canonical.openingEquity ?? canonical.openingStoredEquity),
    prior_amount: priorKnown ? round2(priorCanonical.openingEquity) : null,
    columns: cell(capitalOpen, canonical.openingEquity ?? canonical.openingStoredEquity),
  });
  push({
    line_code: "eq.period_result",
    label: "Profit / (loss) for the year",
    section: "movements",
    level: 1,
    amount: round2(canonical.netProfit),
    prior_amount: priorKnown ? round2(priorCanonical.netProfit) : null,
    columns: movement(canonical.netProfit),
  });
  push({
    line_code: "eq.oci",
    label: "Other comprehensive income",
    section: "movements",
    level: 1,
    amount: 0,
    prior_amount: priorKnown ? 0 : null,
    columns: movement(0),
  });
  push({
    line_code: "eq.tci",
    label: "Total comprehensive income for the year",
    section: "movements",
    level: 1,
    is_subtotal: true,
    amount: round2(canonical.netProfit),
    prior_amount: priorKnown ? round2(priorCanonical.netProfit) : null,
    columns: movement(canonical.netProfit),
  });
  ownerMovements({
    prefix: "eq.",
    other: canonical.otherEquityMovements,
    capitalMove: round2(capitalClose - capitalOpen),
    dividendMove: round2(distributionsAt(closing) - distributionsAt(prior)),
    priorAmounts: priorKnown
      ? {
          capitalMove: round2(capitalOpen - capitalPriorOpen),
          dividendMove: round2(distributionsAt(prior) - distributionsAt(priorOpening)),
          other: round2(priorCanonical.otherEquityMovements),
        }
      : null,
  });
  push({
    line_code: "eq.closing",
    label: balanceLabel(endLong, "Balance at the end of the year"),
    section: "closing",
    is_grand_total: true,
    amount: round2(canonical.equity),
    prior_amount: priorKnown ? round2(priorCanonical.equity) : null,
    columns: cell(capitalClose, canonical.equity),
  });
  return lines;
}

/** True when the sealed facts carry the classification these lines need. */
export function hasClassification(rows) {
  return (rows || []).some((r) => r && (r.category || r.subcategory || r.account_role));
}
