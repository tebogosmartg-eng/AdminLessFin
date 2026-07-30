# Financial KPI Architecture Certification

**Board:** Chief ERP Architect / Principal Accounting Systems Engineer  
**Product:** AdminLess Fin  
**Date:** 2026-07-29  
**Status:** CERTIFIED  
**Prerequisite:** Financial Calendar Architecture (certified)

---

## Invariant

Every financial money figure displayed in AdminLess Fin reconciles to the same accounting engine:

| RPC | Authority |
|-----|-----------|
| `get_balances_as_of_date` | Balance Sheet / Trial Balance / Cash / VAT GL |
| `get_period_activity` | Income Statement / Revenue / Expenses / Net Income |
| `get_cash_flow_statement` | Cash Flow Statement |

Edge functions and UI are **consumers only**. No module may invent a second accounting engine.

---

## 1. KPI Dependency Map

| KPI | Component | Hook / Query | Edge | SQL | Journal → GL → FS |
|-----|-----------|--------------|------|-----|-------------------|
| Cash Balance | `Dashboard.tsx` | `dashboardData` + `bankAccountsQuery` | `dashboard-data` | `get_balances_as_of_date` + `bank_accounts` | JE → GL as-of period end → BS cash |
| Total Assets / Liabilities | `Dashboard.tsx` | same | `dashboard-data` | `get_balances_as_of_date` | JE → GL → BS |
| Net Income | `Dashboard.tsx` | same | `dashboard-data` | `get_period_activity` | JE → period activity → IS |
| Revenue (period) | `RevenueWorkspace.tsx` | `revenueWorkspaceQuery` | `dashboard-data` | `get_period_activity` → `periodRevenue` | Same as IS Total Income |
| Expenses (period) | `PurchasesWorkspace.tsx` | `purchasesWorkspaceQuery` | `dashboard-data` | `get_period_activity` → `periodExpenses` | Same as IS Total Expenses |
| Banking Total Cash | `Banking.tsx` | `accountsQuery(asOf=dateTo)` | `chart-of-accounts` | `get_balances_as_of_date` | Same as Dashboard Cash |
| Income / Expenses / NI | `Reports.tsx`, `FinancialStatements.tsx` | `reports` / `financial_statements` | `reports` | `get_period_activity` | IS |
| Assets / Liab / Equity+CYE | `Reports.tsx`, `FinancialStatements.tsx` | same | `reports` | `get_balances_as_of_date` + period NI | BS |
| Cash Flow Statement | `FinancialStatements.tsx` | same | `reports` | `get_cash_flow_statement` | CF |
| Trial Balance | `TrialBalance.tsx` / Reports | accounting / reports | `accounting` / `reports` | `get_balances_as_of_date` | TB |
| VAT (GL) | `TaxReport.tsx` | `accountsQuery(asOf=dateTo)` | `chart-of-accounts` | `get_balances_as_of_date` + roles | BS VAT accounts |
| AR / AP | Dashboard, Revenue, Purchases, Reports | dashboard / reports | RPCs | `get_customer_ar_balances` / `get_vendor_ap_balances` / aged | Subledger (invoice/bill derived) |
| Cash Flow Forecast | Dashboard / workspaces | dashboard | `dashboard-data` | Open docs + recurring | **Operational FCT** — not CF statement |
| Payroll totals | `PayrollWorkspace.tsx` | payroll queries | `payroll` | Payroll engine | Domain-owned (PAY-*); GL via journals when posted |
| AI Insights | `DashboardInsights` / revenue insights | client | none | Composes published KPIs | Presentation only |
| Financial Close | Close workspace | close APIs | `financial-close` | Workflow status | No money engine |
| EFS statutory | FS workspace | FRP | `financial-statements` | Extract → sealed TB | Snapshot of same RPCs |

---

## 2. Duplicate Calculations Removed

| Before | After |
|--------|-------|
| Revenue workspace = sum of topCustomers (customer-tagged subset) | `periodRevenue` from `get_period_activity` |
| Purchases “Spend” = sum of top-5 expenses only | `periodExpenses` from `get_period_activity` |
| Reports Equity = stored equity only (no CYE) | Equity + Current Year Earnings (= FS) |
| Banking cash = CoA balances as of **today** | CoA balances as of **reporting period end** |
| Tax KPI cards = tax-rate × base schedule | GL VAT roles from `get_balances_as_of_date`; rate schedule labeled supplemental |
| Cash Flow Forecast presented without authority label | Explicitly labeled operational (not CF statement) |

---

## 3. Files Modified

- `src/lib/accounting/dashboardReconciliation.ts` — period revenue/expense/equity/VAT helpers
- `src/lib/revenueIntelligence.ts` — consume `periodRevenue`
- `src/lib/queries.ts` — `accountsQuery(companyId, asOfDate?)`
- `src/pages/RevenueWorkspace.tsx`
- `src/pages/PurchasesWorkspace.tsx`
- `src/pages/Reports.tsx` — CYE equity alignment
- `src/pages/ComparativeBalanceSheet.tsx` — CYE from period activity
- `src/pages/Banking.tsx` — period-end GL balances
- `src/pages/TaxReport.tsx` — GL VAT primary KPIs
- `src/pages/Dashboard.tsx` — forecast authority label
- `supabase/functions/dashboard-data/index.ts` — expose `periodRevenue` / `periodExpenses`
- `supabase/functions/chart-of-accounts/index.ts` — optional `as_of_date`
- `supabase/functions/reports/index.ts` — Comparative BS net income windows
- `tests/unit/dashboard-reconciliation.test.ts`
- `docs/certification/V3.6.9/*` (this pack)

---

## 4. Reconciliation Matrix

| Surface | Cash | Assets | Liab | Equity+CYE | Revenue | Expenses | NI | VAT GL | CF Statement |
|---------|------|--------|------|------------|---------|----------|----|--------|--------------|
| Dashboard | ✓ | ✓ | ✓ | — | — | — | ✓ | — | Forecast≠CF |
| Banking | ✓ | — | — | — | — | — | — | — | — |
| Revenue WS | — | — | — | — | ✓ | — | — | — | Forecast≠CF |
| Purchases WS | — | — | — | — | — | ✓ | — | — | Forecast≠CF |
| Reports | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Live FS | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Trial Balance | — | ✓ | ✓ | stored* | — | — | — | — | — |
| Tax Report | — | — | — | — | — | — | — | ✓ | — |

\* Trial Balance shows unclosed Income/Expense balances; BS Equity+CYE is the closed presentation of the same books.

---

## 5. Before vs After

| Area | Before | After |
|------|--------|-------|
| One P&L engine | Dashboard NI yes; Revenue/Spend no | All period P&L KPIs from `get_period_activity` |
| One BS engine | Dashboard/FS yes; Banking date drift; Reports equity drift | Period-end GL + CYE equity everywhere money BS is shown |
| VAT | Rate×base as primary | GL roles primary; schedule supplemental |
| Modules as engines | Workspaces recalculated | Workspaces consume `dashboard-data` / reports |

---

## 6. Validation Checklist

| Event | Expected |
|-------|----------|
| Post journal / invoice / payroll / receipt / payment | Same delta on Dashboard NI, Reports IS, Live FS IS, TB |
| Change reporting period | All consumers re-query with new `date_from`/`date_to` via `ReportingPeriodContext` |
| Change company | All queries keyed by `company_id` |
| Refresh browser | React Query refetch — same engine values |

---

## 7. Production Build

- `npm test -- tests/unit/dashboard-reconciliation.test.ts` — **5/5 passed**
- `npm run build` (vite) — **succeeded** (2026-07-29)

Edge functions (`dashboard-data`, `chart-of-accounts`, `reports`) must be redeployed for production runtime to serve `periodRevenue` / `periodExpenses`, `as_of_date`, and Comparative BS `netIncome`.

---

## Final Certification

**FINANCIAL KPI ARCHITECTURE CERTIFIED**

One financial source of truth: PostgreSQL GL RPCs. Dashboard, Reports, Banking, Revenue, Purchases, Tax, and AI are consumers.
