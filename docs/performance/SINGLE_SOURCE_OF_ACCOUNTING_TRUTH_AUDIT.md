# Single Source of Accounting Truth — Architecture Certification Audit

**Type:** read-only forensic audit. No business logic, accounting rule, posting
path or journal was modified.
**Date:** 2026-07-31
**Verdict:** **FAIL** — with an important qualification (see §13).

---

## 0. Executive summary

A canonical accounting spine **exists, is real, and is governed.** It was
verified end-to-end down to the SQL:

```
journal_entry_items ⨝ journal_entries          (the GL — actual posted rows)
        ↓  get_balances_as_of_date | get_period_activity | get_cash_flow_statement
        ↓  buildCanonicalFinancialAggregation  (CFA — sole money authority)
        ↓  Trial Balance · Financial Statements · Dashboard KPIs · Reports · Projects
```

This is not aspirational. It is enforced by ADR-0003 (architecture freeze), a
static guard (`npm run guard:cfa`, **currently PASSING, 0 violations**), a
client/edge parity test, ESLint restricted patterns, and a CI workflow.

**However, the audit FAILS the stated PASS criteria**, because those criteria
require that *every* financial amount trace to the General Ledger, and three
sub-ledger domains — **Fixed Assets, Inventory, and Payroll** — are sourced from
operational tables with **no reconciliation to the GL control accounts**.

Critically, this is not an accident that slipped past governance. ADR-0003 says
so explicitly:

> "Domain operational totals (payroll register, inventory valuation, document
> line extensions) remain out of CFA scope and must not be advertised as
> statement engine figures."

So the application does **not currently claim** the property being certified.
The real defect is not that sub-ledgers exist — every ERP has them — it is that
**no sub-ledger-to-GL reconciliation exists anywhere in the codebase.**

### Audit coverage — stated honestly

I traced the canonical spine to its SQL root and exhaustively examined the
highest-risk surfaces (Dashboard, Financial Statements, Trial Balance, General
Ledger, Banking, Fixed Assets, Inventory, Comparative P&L, Projects). I did
**not** individually trace all ~67 currency-rendering pages to source. Findings
below are evidence-backed; absence of a finding in an unexamined module is not
evidence of correctness.

---

## 1. Financial Source of Truth Matrix

| Layer | Implementation | Verified source | Class |
|---|---|---|---|
| GL | `journal_entry_items ⨝ journal_entries` | migration `20260729170000` lines 50–51 | **GREEN** |
| Balances | `get_balances_as_of_date(p_end_date, p_company_id)` | reads GL directly | **GREEN** |
| Activity | `get_period_activity(p_start,p_end,p_company_id)` | reads GL directly | **GREEN** |
| Cash flow | `get_cash_flow_statement(...)` | reads GL directly | **GREEN** |
| Aggregation | `canonicalFinancialAggregation.ts` (737 lines) | client + edge copies, **byte-identical** apart from `@ts-nocheck`; parity test-enforced | **GREEN** |
| Facade | `accountingEngineTotals.ts` | re-export only, no math | **GREEN** |

**Duplicate engine check:** the client and edge CFA copies were diffed. The only
difference is one `// @ts-nocheck` line. `tests/unit/cfa-architecture-governance.test.ts`
reads both files and asserts parity, so this is controlled duplication for
runtime-boundary reasons, **not a second engine.**

---

## 2. Dashboard Source Matrix

The Dashboard is **GREEN**, and cleaner than a surface reading suggests.

`src/pages/Dashboard.tsx` contains fallback chains such as
`Number(cfa.cash ?? engineCashBalance ?? 0)`, which look like a second source.
They are not. In `supabase/functions/dashboard-data/index.ts` every one of those
values is assigned from the **same** `buildStatementTotals(...)` result:

```ts
const totals = buildStatementTotals({ balancesAsOf, periodActivity, cashFlowData, ... });
canonicalAggregation = totals;
periodNetIncome = totals.netIncome;   totalAssets  = totals.totalAssets;
cashBalance     = totals.cash;        totalEquity  = totals.totalEquity;
...
canonicalAggregation,
statementTotals: canonicalAggregation,   // same object, not a second engine
```

The fallback resolves to the identical number. **I flagged this as a suspected
dual path before tracing it; that suspicion was wrong.**

The edge function also actively *suppresses* competing engines — charts are
overwritten with CFA partitions, and non-canonical aggregates are blanked:

```ts
monthlySummaryRes = { data: [{ income: totals.totalIncome, expenses: totals.totalExpenses, net: totals.netIncome }] };
topExpensesRes    = { data: [ Cost of Sales, Operating Expenses, Finance Costs, Tax ] };  // CFA partitions
topCustomers = [];  expectedPayments = [];
forecast = [{ date: today, balance: cashBalance, type: 'actual' }];  // CFA cash only
```

| Dashboard element | Source | Class |
|---|---|---|
| Cash Balance / Total Assets / Total Liabilities / Net Income | CFA | GREEN |
| AR / AP totals | `cfa.receivables` / `cfa.payables` | GREEN |
| Income vs Expense chart | CFA partitions | GREEN |
| Top Expenses chart | CFA partitions | GREEN |
| Cash-flow forecast | CFA cash | GREEN |
| AR/AP **ageing lists** | `get_customer_ar_balances` / `get_vendor_ap_balances` RPC | YELLOW |
| Overdue invoice list | `get_overdue_invoices` RPC | YELLOW |
| Payroll KPI tiles | `payroll_runs.output_metadata` | RED |
| Low-stock list | `products.quantity_on_hand` (quantity, not money) | n/a |

**Efficiency note (not a truth defect):** `get_monthly_summary`, `get_top_expenses`,
future invoice/bill/recurring projections and a `journal_entries` customer query
are all fetched and then **discarded** by the CFA overwrite. That is wasted
round-trips on the app's slowest route, and it ties back to the performance
finding that Dashboard issues 16 edge calls.

---

## 3–5. Trial Balance / General Ledger / Financial Statement Trace Matrices

| Surface | Canonical input | Class |
|---|---|---|
| Trial Balance | `accounting` edge → `get_balances_as_of_date` (opening + closing), line 514–515 | **GREEN** |
| General Ledger | GL rows via `journal-entries` (posting gateway, ADR-frozen) | **GREEN** |
| Financial Statements | `financial-statements` edge → all three canonical RPCs + `buildCanonicalFinancialAggregation` (line 35, 1728–1731) | **GREEN** |
| Banking balances | GL account balances keyed by `chart_of_account_id` (`BankAccountsWorkspace.tsx:44,60`) | **GREEN** |
| Reports | `reports` edge consumes CFA | GREEN/YELLOW |
| Projects | `projects` edge consumes CFA | GREEN/YELLOW |

Because Dashboard, Trial Balance and Financial Statements all consume the **same
three RPCs through the same aggregation function**, they reconcile *by
construction* rather than by coincidence. This is the strongest positive finding
in the audit.

Banking deserves specific credit: it displays GL balances mapped through
`chart_of_account_id`, **not** a sum of `bank_transactions`. That is the correct
sub-ledger pattern, and it is what Fixed Assets and Inventory do not do.

---

## 6. Duplicate Calculation Report

58 money-shaped `.reduce()` call sites exist in `src/pages` + `src/components`.
Most are legitimate document-line composition (invoice/bill/quote line
extensions), which ADR-0003 explicitly places outside CFA scope.

The material findings:

| # | Location | Finding | Class |
|---|---|---|---|
| D1 | `AssetDetail.tsx:367`, `AssetHealthDashboard.tsx:87`, `AssetFinancialCockpit.tsx:227`, `AssetDisposalForm.tsx:97`, `AssetComponentsPanel.tsx:152` | **Net Book Value computed client-side** as `purchase_cost − accumulated_depreciation` from the `fixed_assets` operational table | **RED** |
| D2 | `InventoryValuation.tsx:41` | Inventory value totalled by client-side `reduce` over the `reports` payload | **RED** |
| D3 | `AssetDisposalForm.tsx:98` | Disposal gain/loss `proceeds − NBV` computed client-side for display | **RED** (display only; posting is server-side) |
| D4 | `TrialBalance.tsx:112` | `sumClosing` group subtotal — sums **already-canonical** TB rows; explicitly documented as presentation-only | **YELLOW** (acceptable) |

D1 is the most serious. `accumulated_depreciation` is *stored and incremented on
the asset record* (`fixed-assets/index.ts:744–748`), independently of the GL
accumulated-depreciation account. Two independent representations of the same
economic quantity exist, and **nothing compares them.** A failed or partial
depreciation posting would leave the Asset register and the Balance Sheet
disagreeing, silently and indefinitely.

---

## 7. Reporting Period Consistency Report — **FAIL**

**41 of 67** currency-rendering pages do not consume `ReportingPeriodContext`.

Many are legitimately period-free operational registers (Invoices, Bills, Quotes,
Products). These are not:

| Module | Evidence | Issue |
|---|---|---|
| `ComparativePL.tsx:21` | `end_date: format(new Date(), 'yyyy-MM-dd')` | A **comparative P&L** that independently decides its own end date — it is not bound to the configured Financial Year |
| `accounting/index.ts:816–818` | `p_end_date: today` | Edge function independently determines "today" rather than deriving from the FY authority |
| `InventoryValuation.tsx` | no as-of date passed | Valuation is implicitly "now", not period-scoped |
| `AssetFinancialCockpit`, `FinancialHealth`, `AccountingTimeline`, `Budgets` | no reporting-period binding | Period-sensitive financial surfaces outside the authority |

This directly violates the stated rule *"No module may independently determine
reporting dates."*

---

## 8. Ledger Consistency

| Requirement | Result |
|---|---|
| Every posted journal appears in the GL | **PASS** — single posting gateway (`journal-entries`, ADR-frozen) |
| Every GL balance appears in the Trial Balance | **PASS** — TB reads `get_balances_as_of_date` |
| Every Trial Balance reconciles to Financial Statements | **PASS** — same RPCs, same CFA |
| Every Financial Statement feeds Dashboards | **PASS** — shared CFA payload |
| No dashboard queries transactional tables for accounting balances | **PASS** for balances; **FAIL** for payroll KPI tiles (`payroll_runs.output_metadata`) |
| Sub-ledgers reconcile to GL control accounts | **FAIL — no such reconciliation exists** |

---

## 9. Architecture Violations

| ID | Violation | Severity | Evidence |
|---|---|---|---|
| **V1** | Fixed Asset sub-ledger maintains its own `accumulated_depreciation`; NBV displayed as a financial KPI with no GL reconciliation | **CRITICAL** | `fixed-assets/index.ts:744–748`; 5 client NBV sites |
| **V2** | Inventory valuation is an independent aggregation, never reconciled to the inventory GL control account | **HIGH** | `InventoryValuation.tsx:41` |
| **V3** | `ComparativePL` and `accounting` edge independently determine reporting dates | **HIGH** | `ComparativePL.tsx:21`; `accounting/index.ts:816` |
| **V4** | 41/67 money pages outside `ReportingPeriodContext` | **HIGH** | §7 |
| **V5** | Payroll KPI tiles read `payroll_runs.output_metadata`, bypassing the GL | **MEDIUM** | `dashboard-data/index.ts` payrollKpis block |
| **V6** | **CFA guard coverage gap** — `RESTRICTED_PREFIXES` covers only `src/pages/`, `src/components/`, `revenueIntelligence.ts` and 4 edge functions. `src/lib/**` (except one file), `src/reporting/**`, and the payroll/governance trees are excluded via `IGNORE_PREFIXES`. New parallel aggregation in `src/reporting/` would **not** be caught | **MEDIUM** | `scripts/cfaArchitectureGuard.ts:17–60` |
| **V7** | Dashboard fetches ~6 aggregate RPCs/queries that CFA then discards | **LOW** (waste, not truth) | `dashboard-data/index.ts:97–114` vs 187–208 |

**V6 is the meta-risk.** The guard passes, but it is scoped narrowly enough that
a green result is weaker evidence than it appears. This mirrors the performance
audit's `vendor-pdf` finding: a governance artifact asserting a property it does
not fully verify.

---

## 10. Company Isolation Verification — **PASS (with caveat)**

Every edge function under `supabase/functions/*/index.ts` references
`company_id` (`grep -L` returned no files lacking it). Canonical RPCs take an
explicit `p_company_id` overload, and `get_balances_as_of_date` resolves
`active_company_id` from `profiles` when omitted.

**Caveat:** this verifies the *presence* of company scoping, not its
correctness under RLS. A true isolation proof requires cross-tenant runtime
testing, which was out of scope for a read-only audit.

---

## 11–12. Scores

### Financial Consistency Score: **74 / 100**

| Dimension | Score | Basis |
|---|--:|---|
| GL → TB → FS chain integrity | 20/20 | Same RPCs, same engine, verified to SQL |
| Dashboard ↔ FS reconciliation | 18/20 | Reconciles by construction; payroll tiles bypass |
| Sub-ledger ↔ GL reconciliation | 4/20 | Banking correct; Assets/Inventory/Payroll unreconciled |
| Reporting period consistency | 10/20 | 41/67 pages outside the authority; two modules self-date |
| Duplicate calculation control | 14/20 | Guard passes but scope-limited (V6); 3 RED reducers |
| Company isolation | 8/10 | Present everywhere; not runtime-proven |

### Single Source of Accounting Truth Score: **68 / 100**

The canonical engine is genuinely singular and well-governed for **statement and
KPI surfaces** (that half scores ~95). It does not extend to sub-ledger domains,
and no reconciliation bridges the gap — which is precisely what "single source of
truth" requires.

---

## 13. PASS / FAIL — **FAIL**

Against the stated criteria:

| Criterion | Result |
|---|---|
| Every financial amount traces to the GL | ❌ Assets, Inventory, Payroll do not |
| Every dashboard reconciles to the Trial Balance | ✅ (accounting KPIs) |
| Trial Balance reconciles to Financial Statements | ✅ |
| Financial Statements reconcile to the GL | ✅ |
| No duplicate accounting calculations exist | ❌ D1, D2, D3 |
| No dashboard performs independent accounting calculations | ⚠️ payroll tiles only |
| Reporting Period identical across the application | ❌ 41/67 pages; V3 |
| Financial Year is the single reporting authority | ❌ V3 |
| Multi-company isolation preserved | ✅ (static evidence) |

**The qualification that matters:** this is a FAIL against the *certification
standard requested*, not evidence of a broken accounting system. The GL → TB →
FS → Dashboard spine is sound, singular, and better governed than most systems of
this size. The failure is confined to (a) sub-ledger domains the architecture
deliberately excluded, and (b) reporting-period discipline.

Three of the nine criteria would pass with reconciliation controls that add
**no new accounting math** — only comparisons between figures that already exist.

---

## 14. Remediation Plan (NOT IMPLEMENTED)

Ordered by risk eliminated per unit of change. Every item preserves existing
posting behaviour, journal integrity and accounting rules — none adds or alters
a calculation.

| # | Change | Eliminates | Risk |
|---|---|---|---|
| **R1** | Add a **Fixed Asset ↔ GL reconciliation view**: compare `SUM(fixed_assets.purchase_cost)` and `SUM(accumulated_depreciation)` against the corresponding GL control-account balances from `get_balances_as_of_date`. Surface the variance; do not change either figure | V1 | Very low — read-only comparison |
| **R2** | Same pattern for **Inventory**: valuation total vs inventory GL control account | V2 | Very low |
| **R3** | Bind `ComparativePL` and `accounting/index.ts:816–818` to `ReportingPeriodContext` / the configured Financial Year instead of `new Date()` | V3 | Low — changes *which* period is shown, so needs sign-off |
| **R4** | Extend `cfaArchitectureGuard` `RESTRICTED_PREFIXES` to `src/lib/**` and `src/reporting/**` | V6 | Low — may surface pre-existing violations, which is the point |
| **R5** | Label sub-ledger figures explicitly in the UI ("Asset register — not a statement figure") per ADR-0003's own wording | mis-reading | None |
| **R6** | Route Dashboard payroll KPI tiles through the GL, or label them operational | V5 | Low |
| **R7** | Delete the ~6 Dashboard RPCs whose results CFA overwrites | V7 (latency) | Very low |

**R1 and R2 are the high-value items.** They convert a silent, unbounded
divergence risk into a visible number — which is exactly what a control is for —
without touching a single accounting calculation.

### Explicitly NOT recommended

Folding Fixed Assets, Inventory or Payroll *into* CFA. Sub-ledgers are correct
ERP design; Dynamics 365, S/4HANA and NetSuite all maintain them. What those
systems have and this one lacks is the **reconciliation control between
sub-ledger and GL**, not the absence of sub-ledgers. Merging them would violate
ADR-0003 and destroy working domain logic to solve a problem R1/R2 solve for far
less.
