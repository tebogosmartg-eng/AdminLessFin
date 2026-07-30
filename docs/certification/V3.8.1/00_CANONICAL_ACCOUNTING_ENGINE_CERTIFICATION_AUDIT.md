# Canonical Accounting Engine — End-to-End Certification Audit

**Board:** Chief ERP Architect / Principal Accounting Certification Auditor  
**Product:** AdminLess Fin  
**Date:** 2026-07-30  
**Scope:** Prove (not redesign) that Canonical Financial Aggregation is the sole money authority  
**Implementation status:** FROZEN for this audit  

---

## Executive verdict

Primary statement surfaces (Dashboard period KPIs, Reports IS/BS/CF `statementTotals`, Live Financial Statements, Annual FS Statement Engine lines) **do** consume Canonical Financial Aggregation built from GL/TB RPCs.

However, **residual duplicate monetary aggregations remain** outside that engine (project profitability, tax-rate VAT schedule, UI ratio/aging/banking sums, hierarchical TB column totals, operational forecast sums). Under the certification rule *“every displayed figure originates from Canonical Financial Aggregation”* and *“no UI performs financial aggregation”*, the engine **cannot be fully certified**.

**Final assessment: NO-GO**

---

## 1. End-to-end traces (business scenarios)

Common read path after posting (all scenarios that hit the ledger):

```
posting_engine_submit / domain atomic RPC
  → journal_entries + journal_entry_items  (= GL)
  → get_balances_as_of_date | get_period_activity | get_cash_flow_statement
  → buildCanonicalFinancialAggregation / buildStatementTotals
  → Dashboard KPIs · Reports.statementTotals · Live FS
  → EXTRACT seals dataset.canonical_aggregation
  → GENERATE_STATEMENTS (presentation from sealed canonical)
  → GET_STATEMENTS / Document / Publication PDF (sealed lines)
```

| Scenario | Write path (evidence) | Hits CFA for IS/BS/Dashboard? | Notes |
|----------|----------------------|-------------------------------|-------|
| Customer Invoice | Rules engine / invoices → `posting_engine_submit` (AR/Rules) | Yes — period Income + AR balances via TB RPCs → CFA | Document tax lines separate from CFA `vatNet` |
| Supplier Bill | Bills / rules → posting gateway | Yes — Expense + AP | Same VAT caveat |
| Customer Receipt | Banking / receive payments → JE via posting | Yes — Cash + AR movement | Banking UI may show bank-module balances |
| Supplier Payment | Pay bills / banking → posting | Yes — Cash + AP | Same |
| Payroll Run | `payroll` → posting_engine_submit (no direct JE insert) | Yes — OpEx / liabilities in period & as-of | Payroll register totals are payroll-domain, not CFA |
| Manual Journal | `journal-entries` → `posting_engine_submit` | Yes | JE form sums DR/CR for entry balance only |
| Asset Purchase | `fixed-assets` / acquisitions → posting | Yes — Asset + contra | EAM KPIs have separate asset register math |
| Depreciation | `run-depreciation` → posting | Yes — Expense + accum. dep. | |
| VAT Posting | Embedded in invoice/bill JE tax lines | **Partial** — CFA `vatNet` from GL roles; Tax Report uses **rate × base** schedule | Divergence risk |
| Year-End Close | `financial-year` / `year-end-close` → `close_financial_year` | Yes — RE absorbs NI; CYE→0 in CFA | Soft EFCP close ≠ GL close |

For each scenario, after posting, **equation / TB / CFA identity** is proven by unit suite architecture (`canonical-financial-aggregation.test.ts`, `dashboard-reconciliation.test.ts`): A = L + (stored E + CYE); period Income−Expense = Net Profit; partition identity; TB debit/credit sides from as-of balances.

Live multi-tenant body-of-evidence for every scenario × publication PDF was **not re-executed** in this audit (certification is code-path + unit proof). Prior EFS live traceability was historically incomplete (V6.6.0).

---

## 2. Remaining duplicate / parallel money calculations

Classification key: **✓ Presentation** · **⚠ Wrapper** · **✗ Duplicate accounting calculation**

### Canonical authority (expected)

| Location | Class | Notes |
|----------|-------|-------|
| `canonicalFinancialAggregation.ts` (edge + src) | ✓ Engine | Sole permitted aggregator |
| `accountingEngineTotals.buildStatementTotals` | ⚠ Wrapper | Facade → canonical |
| `dashboardReconciliation.buildStatementTotals` / sumPeriod* | ⚠ Wrapper | Test/UI helpers → canonical |
| `reports` default + comparative NI via CFA | ⚠ Wrapper | Correct consumer |
| `dashboard-data` KPIs via `buildStatementTotals` | ⚠ Wrapper | Correct consumer |
| `efsStatementEngine` + sealed `canonical_aggregation` | ⚠ Wrapper | Presentation from sealed CFA |
| Live FS / Reports UI reading `statementTotals.*` | ✓ Presentation | Display only |

### Residual ✗ duplicates (block full certification)

| Location | What it calculates | Why ✗ |
|----------|-------------------|------|
| `reports` `GET_PROJECT_PROFITABILITY` | JE lines → project revenue/expenses/profit | Parallel P&L engine |
| `reports` `GET_TAX_REPORT` | tax_rate × JE base → taxCollected/taxPaid | Parallel VAT ≠ CFA `vatNet` |
| `TaxReport.tsx` | UI `reduce` of taxCollected/taxPaid | UI monetary aggregation of parallel path |
| `FinancialStatements.tsx` | `currentAssets` / `currentLiabilities` client `reduce` of balances | UI aggregation for ratios (not CFA) |
| `Reports.tsx` aged AR/AP columns | Client `reduce` of aging buckets | UI aggregation (subledger) |
| `Dashboard.tsx` | `arBalances`/`apBalances` `reduce` for cards | Subledger totals ≠ CFA receivables/payables |
| `Banking.tsx` | Sum bank/cash/petty module balances | Parallel cash vs CFA `cash` |
| `accounting` `GET_TRIAL_BALANCE` / hierarchical | Column DR/CR totals from JE moves + balances | Parallel TB inquiry totals (shares balances RPC; period model ≠ `get_period_activity`) |
| `TrialBalance.tsx` `sumClosing` | Hierarchy section sums | Presentation of parallel TB rows |
| `dashboard-data` forecast invoice/bill amounts | JE item `reduce` for cash forecast | Operational forecast, not CFA (still money math) |
| `get_monthly_summary` / `get_top_expenses` | Own JE aggregations | Parallel KPI series |
| Accounting intelligence endpoints in `accounting/index.ts` | net_movement / module amounts | Parallel analytics |
| `ProjectProfitabilityReport.tsx` | Client total of project profits | UI sum of parallel engine |

### Out of scope / domain (not statement engine, noted)

Payroll payslip register totals, inventory valuation, asset register KPIs, quote/PO line extensions, reconciliation cleared amounts, customer/vendor statement running balances — **domain operational**, not CFA. They must not be advertised as Financial Statement / Dashboard engine figures.

---

## 3. Remaining financial divergence

| Divergence | Effect |
|------------|--------|
| CFA `vatNet` (GL roles) vs Tax Report (rate × base) | VAT “matches everywhere” **fails** |
| CFA `cash` (role/bank CoA) vs Banking module balances | Cash “matches everywhere” **fails** if bank register ≠ GL link |
| CFA `receivables`/`payables` vs aged AR/AP / customer-vendor RPCs | AR/AP cards may diverge from CFA |
| Hierarchical TB period DR/CR vs `get_period_activity` | Period activity presentation can differ by construction |
| Sealed AFS vs live CFA | Correct by design until refresh; stale seal ≠ live Dashboard |
| Project profitability vs company CFA Net Profit | Project subset ≠ company profit |

---

## 4. Reconciliation matrix

| Metric | GL/TB RPC | CFA | Dashboard KPI | Live IS/BS | Annual FS | Publication | Everywhere equal? |
|--------|-----------|-----|---------------|------------|-----------|-------------|-------------------|
| Revenue / Total Income | `get_period_activity` Income | ✓ | ✓ `periodRevenue` | ✓ `statementTotals` | ✓ sealed lines | ✓ sealed | **Yes** (primary surfaces) |
| Expenses / Total Expenses | period Expense | ✓ | ✓ | ✓ | ✓ | ✓ | **Yes** (primary) |
| Net Profit / CYE | Income−Expense | ✓ | ✓ | ✓ | ✓ | ✓ | **Yes** (primary) |
| Assets | as-of Asset | ✓ | ✓ | ✓ | ✓ | ✓ | **Yes** (primary) |
| Liabilities | as-of Liability | ✓ | ✓ | ✓ | ✓ | ✓ | **Yes** (primary) |
| Equity (stored+CYE) | Equity + NI | ✓ | ✓ | ✓ | ✓ | ✓ | **Yes** (primary) |
| Cash | role/bank CoA | ✓ | ✓ `cashBalance` | via CFA | CF sections | CF | **No** vs Banking UI |
| VAT | role balances | ✓ `vatNet` | not primary card | — | — | — | **No** vs Tax Report |
| Receivables / Payables | role/subcat | ✓ | aging reduce | aging tables | — | — | **No** vs aging cards |
| Accounting equation | TB sides + CYE | ✓ flags | — | ✓ | ✓ articulation | ✓ PL.RESULT | **Yes** when CFA used |
| UI no money math | — | — | ✗ AR/AP reduce | ✗ ratio current A/L | presentation | presentation | **No** |

---

## 5. Files audited

**Engine / consumers:**  
`canonicalFinancialAggregation.ts` (edge + src), `accountingEngineTotals.ts`, `dashboardReconciliation.ts`, `reports/index.ts`, `dashboard-data/index.ts`, `efsStatementEngine/*`, `financial-statements/index.ts`, `efsFinancialReportingPlatform/index.ts`, `afsAccountingValidation.ts`, `FinancialStatements.tsx`, `Reports.tsx`, `Dashboard.tsx`, `ComparativePL.tsx`, `ComparativeBalanceSheet.tsx`, `EngagementStatements.tsx`

**Write / posting:**  
`journal-entries/index.ts`, `payroll/index.ts`, `financial-year/index.ts`, `year-end-close/index.ts`, `accounting-rules-engine`, `accountingRulesEngine/generate.ts`

**Residual money:**  
`GET_PROJECT_PROFITABILITY`, `GET_TAX_REPORT`, `TaxReport.tsx`, `Banking.tsx`, `accounting/index.ts` (TB + intelligence), `TrialBalance.tsx`, `ProjectProfitabilityReport.tsx`, `revenueIntelligence.ts` (consumes periodRevenue — ✓)

**Tests / build:**  
`tests/unit/canonical-financial-aggregation.test.ts`, `tests/unit/dashboard-reconciliation.test.ts`

---

## 6. Production build status

| Check | Result |
|-------|--------|
| Unit (canonical + dashboard reconciliation) | **15/15 PASS** |
| `npm run build` | **PASS** (2026-07-30) |

---

## 7. Go / No-Go

| Gate | Result |
|------|--------|
| Scenarios post via single write gateway into GL | PASS (architectural) |
| Primary Dashboard / Reports / Live FS / AFS consume CFA | PASS |
| Statement Engine does not invent alternate NI from raw facts when sealed CFA present | PASS |
| **No** remaining duplicate accounting calculations | **FAIL** |
| **No** UI financial aggregation | **FAIL** |
| Cash / VAT / AR / AP match everywhere | **FAIL** |
| Live E2E proof every scenario → Publication PDF | **NOT RE-RUN** |

### Recommendation

Treat CFA as **architecturally canonical for statement totals**, but **do not ship a board-level “fully certified” claim** until residual ✗ paths are either removed or explicitly excluded from the certified reporting surface (with UI wired to CFA for cash/VAT/AR/AP and project/tax schedules redesigned to consume CFA or marked non-engine).

---

## Verdict

**CANONICAL ACCOUNTING ENGINE NOT CERTIFIED**
