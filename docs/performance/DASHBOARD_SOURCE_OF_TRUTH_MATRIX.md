# Dashboard Source-of-Truth Matrix

**Date:** 2026-07-31
**Scope:** every financial amount displayed on the Dashboard, traced to its exact origin.
**Rule applied:** each displayed amount must come from `buildCanonicalFinancialAggregation()`
via the certified reporting pipeline. No card may compute, re-sum or independently
fetch a balance.
**Accounting logic changed:** none. No aggregation, classification, posting or
statement rule was touched — only which property a card reads.

---

## 1. Headline finding (found during the trace, not caused by it)

The trace compared the repository against what is actually **running in
production**. They do not match:

| Deployed edge function | Returns `statementTotals` / `canonicalAggregation`? |
|---|---|
| `dashboard-data` | **No** — pre-CFA build |
| `reports` | **No** — pre-CFA build |

The entire Canonical Financial Aggregation convergence has **never been
deployed**. Consequences on the live system today, verified by invoking both
functions as an `owner` of a real company:

- `dashboard-data` returns only `periodNetIncome` and non-financial lists.
- `reports` returns only raw RPC arrays (`balancesAsOf`, `periodActivity`,
  `cashFlowData`, `openingBalances`, `agedReceivables`).

Tracing that through the old client code: **Cash, Total Assets, Total
Liabilities, Accounts Receivable and Accounts Payable were rendering R0.00 in
production**, because every CFA property *and* every legacy fallback scalar was
absent from the payload. Only Net Income survived, via `periodNetIncome`.
[FinancialStatements.tsx:109-132](../../src/pages/FinancialStatements.tsx#L109-L132)
degrades the same way — `Number(t?.totalAssets ?? 0)` — so the Financial
Statements page shows account lines with all totals zero.

A zero is the most dangerous possible failure mode here: it is indistinguishable
from a genuine nil balance, so nothing looks broken. That is addressed in §4.

---

## 2. Source-of-truth matrix

`CFA` = `statementTotals`, the `buildStatementTotals()` output, i.e.
`buildCanonicalFinancialAggregation()` over `get_balances_as_of_date` +
`get_period_activity` + `get_cash_flow_statement` — the same GL/TB engine the
Trial Balance and Financial Statements consume.

### 2a. Dashboard KPIs — migrated

| # | Displayed amount | Previous source | New CFA source | Was it CFA before? |
|---|---|---|---|---|
| 1 | Cash Balance card | `cfa.cash ?? cashBalance ?? 0` | `statementTotals.cash` | partly — legacy fallback |
| 2 | **Total Assets card** | `totalAssets` scalar | `statementTotals.totalAssets` | **no — never read CFA** |
| 3 | **Total Liabilities card** | `totalLiabilities` scalar | `statementTotals.totalLiabilities` | **no — never read CFA** |
| 4 | Net Income card | `cfa.netIncome ?? periodNetIncome ?? 0` | `statementTotals.netIncome` | partly — legacy fallback |
| 5 | Cash Position (Banking) | `cfa.cash ?? cashBalance ?? 0` | `statementTotals.cash` | partly — legacy fallback |
| 6 | Accounts Receivable total | `cfa.receivables ?? 0` | `statementTotals.receivables` | yes |
| 7 | Accounts Payable total | `cfa.payables ?? 0` | `statementTotals.payables` | yes |
| 8 | Insights (AR / AP / Net Income) | props from #4, #6, #7 | same, now unconditionally CFA | partly |

Cards 2 and 3 are the substantive defect: **Total Assets and Total Liabilities
read a legacy scalar and never consulted CFA at all**, so any drift between the
scalar and the aggregation would have shown on the Dashboard and nowhere else.

### 2b. Dashboard charts — already CFA, confirmed unchanged

| # | Displayed amount | Source | Status |
|---|---|---|---|
| 9 | Income vs Expenses trend | CFA `totalIncome` / `totalExpenses` / `netIncome` | already CFA |
| 10 | Top Expenses | CFA `costOfSales`, `operatingExpenses`, `financeCosts`, `taxExpense` | already CFA |
| 11 | Cash Flow Forecast opening | CFA `cash` | already CFA |

### 2c. Amounts that are **not** CFA figures — and why that is correct

CFA is an aggregation of company-level totals. It does not model per-document,
per-counterparty or per-account detail, so these are legitimately sourced
elsewhere. None of them is a KPI and none is summed into one.

| # | Displayed amount | Source | Why not CFA |
|---|---|---|---|
| 12 | AR list per customer | `get_customer_ar_balances` | sub-ledger detail; CFA has no per-customer split |
| 13 | AP list per vendor | `get_vendor_ap_balances` | sub-ledger detail |
| 14 | Overdue invoice totals | `get_overdue_invoices` | document totals, not a ledger balance |
| 15 | Bank Accounts per-account balance | `accounts[]` GL rows, looked up by `chart_of_account_id` | per-account GL balance; a lookup, never a sum |
| 16 | Recent banking activity amounts | `bank_transactions.amount` | operational transactions, not GL positions |

The sub-ledger totals in 12 and 13 are exactly what the reconciliation controls
in `subLedgerReconciliation.ts` compare against the GL — that comparison is
where a divergence surfaces, not on a KPI card.

### 2d. Two surfaces with no CFA source — declared, not silently left

| # | Displayed amount | Source | Assessment |
|---|---|---|---|
| 17 | **Top Customers chart** | hard-coded `[]` in the edge | Renders permanently empty since the CFA convergence. CFA exposes no revenue-by-customer split. Left in place: deleting a visible card is a product decision, not a refactor. |
| 18 | **Budget vs Actuals** | `budgets` edge — `amount`, `actual_amount` | `actual_amount` is a per-account actual computed by the budgets edge. CFA exposes partition totals, not per-account actuals, so this cannot be migrated without extending CFA — which ADR-0003 freezes. |

Neither was touched. Both are reported rather than quietly omitted.

---

## 3. Obsolete DTO fields removed

Each removed scalar was a **copy** of a `statementTotals` property assigned in
the same block. A copy is a second place a figure can drift from the General
Ledger, and the `??` fallback chains made drift invisible.

| Removed field | Was a copy of | Consumers migrated |
|---|---|---|
| `canonicalAggregation` | `statementTotals` (deep-equal duplicate) | Dashboard, Revenue, Purchases, Payroll, Reconciliation panel |
| `periodNetIncome` | `statementTotals.netIncome` | Dashboard |
| `periodRevenue` | `statementTotals.totalIncome` | RevenueWorkspace |
| `periodExpenses` | `statementTotals.totalExpenses` | PurchasesWorkspace |
| `cashBalance` | `statementTotals.cash` | Dashboard, PayrollWorkspace |
| `totalAssets` | `statementTotals.totalAssets` | Dashboard |
| `totalLiabilities` | `statementTotals.totalLiabilities` | Dashboard |
| `totalStoredEquity` | `statementTotals.totalStoredEquity` | none — dead on arrival |
| `totalEquity` | `statementTotals.totalEquity` | none — dead on arrival |

`canonicalAggregation` and `statementTotals` were verified **deep-equal on the
wire**, confirming they were one object emitted under two names.

The Dashboard payload now carries exactly one money field: `statementTotals`.

### Dead code also removed

- `results[22]`–`results[26]` (`futureInvoicesRes`, `futureBillsRes`,
  `futureRecInvRes`, `futureRecBillsRes`, `revenueRes`) — assigned and never
  read. Both the no-op stubs and their locals are gone; nothing indexes past 21.
- Dead assignments `monthlySummaryRes = results[16]` and
  `topExpensesRes = results[18]` — unconditionally overwritten with CFA
  partitions before any read. The stub promises stay to hold positions 17, 19–21.

---

## 4. Fail-safe: absence is now visible

With the legacy fallbacks gone, a missing aggregation would have rendered
R0.00 — the exact silent failure production is in today. The Dashboard now
distinguishes the two:

- CFA present → figures render as before.
- CFA absent → an explicit **“Financial figures unavailable”** alert, and every
  affected card shows `—` instead of a currency amount.

This is the same principle already applied to the sub-ledger reconciliation
controls: a figure that is confidently wrong is worse than one that declares it
cannot be evaluated.

---

## 5. Reconciliation to the Trial Balance and Financial Statements

Verified live via `tools/perf/verifyDashboardSourceOfTruth.ts`, which pulls the
**raw GL RPC payloads** (these *are* the Trial Balance), aggregates them with
the client CFA authority and, independently, with the edge CFA authority, then
compares both against the Dashboard's KPI mapping.

Certification company `be3855e9`, FY2026 (2026-01-01 → 2026-12-31):

**Engine identity — 38/38 `statementTotals` properties identical** between
`src/lib/accounting/canonicalFinancialAggregation.ts` and
`supabase/functions/_shared/accountingEngineTotals.ts` on the same GL rows.
One engine, two deployments — not two implementations that agree.

| KPI | Value | Reconciles to TB |
|---|--:|---|
| Cash | −36 981.52 | yes |
| Total Assets | −15 081.52 | yes |
| Total Liabilities | 12 401.96 | yes |
| Total Equity | −27 483.48 | yes |
| Revenue (total income) | 56 150.00 | yes |
| Expenses | 83 633.48 | yes |
| Net Income | −27 483.48 | yes |
| Accounts Receivable | 21 300.00 | yes |
| Accounts Payable | 1 975.00 | yes |

| Identity | Result |
|---|---|
| Trial Balance: debits = credits (105 833.48 = 105 833.48) | holds |
| Balance Sheet: assets = liabilities + equity (−15 081.52) | holds |
| Income Statement: income − expenses = net income | holds |
| Equity: stored equity + net income = total equity | holds |

**RESULT: PASS**

### A second tenant that does not balance — diagnosed, not dismissed

Company `3cbfd4eb` reconciles on every KPI and on the Trial Balance
(debits = credits), but its **Balance Sheet is out by R80 126.67**.

That is not an aggregation defect. Measured directly:

- pre-FY2027 net profit = **R80 126.68** — equal to the gap;
- the company has **zero Equity accounts in its Chart of Accounts**;
- stored equity = 0.00, retained earnings = 0.00.

Prior-period profit has nowhere to be carried, so the accounting equation cannot
close. This is a chart-of-accounts / year-end-close data condition, and the
identity check is doing precisely its job by surfacing it. Fabricating an equity
figure to make it balance would be inventing accounting, which is out of bounds.

---

## 6. Files changed

**Edge (1)**
- `supabase/functions/dashboard-data/index.ts` — single `statementTotals` field;
  9 obsolete money fields removed; dead promises and locals removed.

**Consumers (5)**
- `src/pages/Dashboard.tsx` — all KPIs from CFA; fail-safe unavailable state.
- `src/pages/RevenueWorkspace.tsx`, `src/pages/PurchasesWorkspace.tsx`,
  `src/pages/PayrollWorkspace.tsx`,
  `src/components/accounting/SubLedgerReconciliationPanel.tsx` — read
  `statementTotals` only.

**Tests / tooling (3)**
- `tests/unit/cfa-architecture-governance.test.ts` — +12 regression tests.
- `tools/perf/verifyDashboardSourceOfTruth.ts` — new; live reconciliation proof.
- `tools/perf/verifyDashboardRender.ts` — new; live fail-safe proof.

---

## 7. Validation

| Gate | Result |
|---|---|
| TypeScript | 0 errors |
| ESLint | 0 errors (398 pre-existing warnings) |
| CFA architecture guard | PASS (0 violations) |
| Build | PASS |
| Unit tests | 619 passed (was 607; +12 new) |
| DOM tests | 13 passed |
| Integration tests | 3 passed |
| Live source-of-truth reconciliation | PASS |
| Live Dashboard render | PASS, 0 console errors |

New regression tests lock in: one canonical money field; each obsolete scalar
absent; no consumer reading `canonicalAggregation` or a legacy scalar; and the
fail-safe state. Their regexes were negative-tested against violating strings.

---

## 8. Required release action

**The two edge functions must be deployed.** Until then the migration cannot
take effect, because the running code does not emit `statementTotals`:

```
supabase functions deploy dashboard-data
supabase functions deploy reports
```

Deploying is what actually fixes the R0.00 production defect in §1 — for the
Dashboard, Reports and Financial Statements together. I have not deployed:
pushing to a live production tenant is a release decision.

Until it happens the Dashboard fails safe — it shows “Financial figures
unavailable” rather than zeros — which is correct behaviour but is not the same
as working. The Financial Statements page still shows zero totals; it was not
modified, as that surface is frozen and the deploy resolves it.
