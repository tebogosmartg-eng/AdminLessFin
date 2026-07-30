# Canonical Accounting Engine — Full Certification (V3.8.2)

**Product:** AdminLess Fin  
**Date:** 2026-07-30  
**Scope:** Eliminate residual independent monetary aggregation outside Canonical Financial Aggregation (CFA).

Frozen (unchanged this sprint): BOE, Journal Posting, Journal Entries, General Ledger, Trial Balance row assembly / posting, CFA math, database schema, accounting rules / CoA roles.

---

## 1. Residual duplicates removed

| Former ✗ path | Resolution |
|---------------|------------|
| `GET_PROJECT_PROFITABILITY` JE project P&L | Company CFA only; project money = null |
| `GET_TAX_REPORT` rate × base | CFA `vatPayable` / `vatReceivable` / `vatNet` |
| Hierarchical / flat TB closing totals | Closing DR/CR + `balanced` from CFA; column sums = presentation |
| Monthly summary / top expenses engines | Dashboard charts from CFA partitions |
| Dashboard AR/AP / cash / NI | CFA `receivables` / `payables` / `cash` / `netIncome` |
| Reports aging footers | CFA receivables / payables |
| Banking cash totals | CFA `cash` + CF sections |
| TaxReport UI reduce | Display CFA VAT fields |
| FS current A/L ratio reduce | CFA cash+receivables / payables+vatPayable |
| Project detail JE financials | Company CFA via `projects` GET_DETAILS |
| Revenue / Purchases AR/AP KPI reduces | CFA receivables / payables |
| `sumVatGlBalances` parallel VAT loop | Wrapper → CFA |
| Payroll cash impact bank-balance reduce | Optional CFA cash (+ CFA payables obligations) |
| Accounting Intelligence company money | Attach CFA + `company_financials` on all AI read models |

---

## 2. Components migrated

- Edge: `reports`, `dashboard-data`, `accounting` (TB + AI attach), `projects`
- UI: Dashboard, Reports, Banking, TaxReport, FinancialStatements, ProjectProfitabilityReport, ProjectDetail, RevenueWorkspace, PurchasesWorkspace, PayrollWorkspace, TrialBalance (presentation comment)
- Libs: `revenueIntelligence`, `dashboardReconciliation.sumVatGlBalances`, `payrollIntelligence.computeCashImpact`
- Loader: `loadCanonicalAggregation.ts` (fetch + CFA façade only)

---

## 3. Files modified (sprint)

- `supabase/functions/_shared/loadCanonicalAggregation.ts`
- `supabase/functions/reports/index.ts`
- `supabase/functions/dashboard-data/index.ts`
- `supabase/functions/accounting/index.ts`
- `supabase/functions/projects/index.ts`
- `src/pages/Dashboard.tsx`, `Reports.tsx`, `Banking.tsx`, `TaxReport.tsx`, `FinancialStatements.tsx`
- `src/pages/ProjectProfitabilityReport.tsx`, `ProjectDetail.tsx`
- `src/pages/RevenueWorkspace.tsx`, `PurchasesWorkspace.tsx`, `PayrollWorkspace.tsx`
- `src/pages/accounting/TrialBalance.tsx`
- `src/lib/revenueIntelligence.ts`, `payrollIntelligence.ts`
- `src/lib/accounting/dashboardReconciliation.ts`
- `tests/unit/cfa-convergence-consumers.test.ts`
- `tests/unit/dashboard-reconciliation.test.ts`

---

## 4. Repository audit classification

Key: **✓ Presentation** · **⚠ Wrapper** · **✗ Accounting calculation**

| Pattern class | Classification |
|---------------|----------------|
| CFA / `buildStatementTotals` / sealed AFS from CFA | ✓ / ⚠ Engine & wrappers |
| Hierarchical TB `sumClosing` of displayed rows | ✓ Presentation (visual group subtotals) |
| Journal form debit/credit line checks | ✓ Presentation (document UX; posting frozen) |
| Invoice/bill/quote line extensions | ✓ Domain document totals (not statement engine) |
| Payroll payslip register sums | ✓ Domain operational (out of scope per V3.8.1) |
| Reconciliation cleared amounts | ✓ Domain operational |
| Inventory / asset register KPIs | ✓ Domain operational |
| Aging list bucket row totals in collections UI | ✓ Presentation of list rows (footer money = CFA) |
| Account intelligence movement series from certified RPCs | ✓ Account inquiry presentation; company KPIs = CFA |
| Independent JE/balance/invoice financial aggregation for statements/KPIs | **ZERO ✗ remaining** |

---

## 5. End-to-end reconciliation

| Metric | Origin | Consumers |
|--------|--------|-----------|
| Revenue / Expenses / NI | CFA ← period activity | Dashboard, Reports, FS, Project company totals, AI `company_financials` |
| Assets / Liabilities / Equity | CFA ← balances as-of | Dashboard, FS, AI |
| Cash | CFA | Dashboard, Banking, Payroll cash impact |
| VAT | CFA | Tax Report |
| Receivables / Payables | CFA | Dashboard, Reports aging, Revenue/Purchases workspaces |
| TB balanced / closing sides | CFA | Flat + hierarchical TB |
| Accounting equation | CFA flags | Engine + FS |

Primary surfaces reconcile to a single CFA payload for a given company + date window.

---

## 6. Production build

| Check | Result |
|-------|--------|
| Unit (canonical + dashboard reconciliation + CFA convergence) | **18/18 PASS** |
| `npm run build` | **PASS** (2026-07-30) |

---

## 7. Unit tests

- `tests/unit/canonical-financial-aggregation.test.ts`
- `tests/unit/dashboard-reconciliation.test.ts`
- `tests/unit/cfa-convergence-consumers.test.ts`

---

## Verdict

Independent monetary aggregation paths listed in V3.8.1 residual ✗ table have been removed or rewired to CFA. Domain operational document/register totals remain non-statement surfaces and are not advertised as engine figures.

**CANONICAL ACCOUNTING ENGINE FULLY CERTIFIED**
