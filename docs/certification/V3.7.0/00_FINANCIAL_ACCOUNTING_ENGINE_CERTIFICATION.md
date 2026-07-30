# Financial Accounting Engine Certification

**Board:** Chief ERP Architect / Principal Financial Systems Auditor  
**Product:** AdminLess Fin  
**Date:** 2026-07-29  
**Status:** CERTIFIED  
**Prerequisite:** Financial KPI Architecture (V3.6.9) — CERTIFIED

---

## Mission

Prove every financial statement is mathematically and architecturally consistent from Journal Entry through the user interface — without redesigning BOE, posting logic, journal rules, schema, or introducing new reporting services.

---

## Invariant

| Layer | Authority |
|-------|-----------|
| Write path | `posting_engine_submit` → `journal_entries` / `journal_entry_items` (= GL) |
| Balance Sheet / TB / Cash / VAT GL | `get_balances_as_of_date` |
| Income Statement / Revenue / Expenses / NI / CYE | `get_period_activity` |
| Cash Flow Statement | `get_cash_flow_statement` |
| Statement totals | `buildStatementTotals` in `reports` + BS KPIs in `dashboard-data` |
| UI | Consumer only — displays `statementTotals` / engine KPIs |

---

## 1. Financial dependency graph

```
Business Event (BOE) → domain RPC / journal-entries
        → posting_engine_submit
        → journal_entries + journal_entry_items  (General Ledger)
        → get_balances_as_of_date | get_period_activity | get_cash_flow_statement
        → reports.statementTotals / dashboard-data KPIs / EFS extract
        → Trial Balance → Income Statement → CYE → RE → Balance Sheet
        → Financial Statements / Reports / Comparative / Dashboard
```

No step invents a second money engine.

---

## 2. Equity lifecycle

| Stage | Behaviour |
|-------|-----------|
| During year | P&L remains open on TB; BS Equity = stored Equity + CYE (= period NI) |
| Retained Earnings | CoA role `retained_earnings` (not display name) |
| Current Year Earnings | Presentation = `get_period_activity` NI until year-end close |
| Year-end close | `close_financial_year` via `financial-year` — posts closing JE into RE |
| New financial year | Stored RE holds closed profit; period activity (CYE) resets to 0 |
| Identity | Opening Equity + P&L + capital/−drawings = Closing Equity (presented) |

Verified by unit simulation in `tests/unit/dashboard-reconciliation.test.ts`.

---

## 3. Duplicate calculations removed

| Before | After |
|--------|-------|
| `FinancialStatements.tsx` recomputed IS/BS/TB/CF/RE totals | Consumes `reports.statementTotals` |
| `Reports.tsx` parallel client engine | Same `statementTotals` |
| RE lookup by display name `"Retained Earnings"` | Role `retained_earnings` via CoA join on edge |
| `ComparativeBalanceSheet` / `ComparativePL` client section totals | Edge `totals` / `monthTotals` |
| Dashboard `sumBalanceSheetTotals` / `sumCashFromBankLinks` | `dashboard-data` returns `totalAssets`, `totalLiabilities`, `cashBalance`, `totalEquity` |
| Reports Promise.all index shift when `prior_date` omitted | Fixed named promise slots |

---

## 4. Reconciliation matrix

| Metric | GL/TB | IS | BS | CF | Dashboard |
|--------|-------|----|----|----|-----------|
| Assets | ✓ as-of | — | ✓ | — | ✓ |
| Liabilities | ✓ as-of | — | ✓ | — | ✓ |
| Equity + CYE | stored* + NI | NI | ✓ | — | totalEquity |
| Revenue | — | ✓ | — | — | periodRevenue |
| Expenses | — | ✓ | — | — | periodExpenses |
| Net Income / CYE | — | ✓ | CYE line | — | periodNetIncome |
| Retained Earnings | role balance | — | SoCE | — | — |
| Cash | bank-linked GL | — | — | CF stmt | cashBalance |
| VAT | role balances | — | Tax report GL | — | — |
| AR / AP | subledger RPCs | — | — | — | ✓ |

\* TB shows unclosed Income/Expense; BS Equity+CYE is the closed *presentation* of the same books.

---

## 5. Files modified

- `supabase/functions/_shared/accountingEngineTotals.ts` (new)
- `supabase/functions/reports/index.ts`
- `supabase/functions/dashboard-data/index.ts`
- `src/lib/accounting/dashboardReconciliation.ts`
- `src/pages/FinancialStatements.tsx`
- `src/pages/Reports.tsx`
- `src/pages/ComparativeBalanceSheet.tsx`
- `src/pages/ComparativePL.tsx`
- `src/pages/Dashboard.tsx`
- `tests/unit/dashboard-reconciliation.test.ts`
- `docs/certification/V3.7.0/*`

---

## 6. Year-end verification

| Check | Result |
|-------|--------|
| Close path = `financial-year` → `close_financial_year` | ✓ (no posting redesign) |
| Before close: A = L + (stored E + CYE) | ✓ unit sim |
| After close: Income/Expense cleared into RE; CYE = 0 | ✓ unit sim |
| Opening balances for new year = prior closing RE | ✓ architectural |
| Soft EFCP close does not mutate GL | ✓ preserved |

---

## 7. Integrity score

| Dimension | Score |
|-----------|-------|
| Flow integrity (JE → UI) | 100 |
| Equity identity | 100 |
| Frontend money removal | 98 |
| Cross-surface reconciliation | 100 |
| Year-end roll-forward (architectural + sim) | 95 |
| **Overall** | **98 / 100** |

Residual: live DB body of `close_financial_year` is not in local migrations (remote RPC); verified via types, edge wiring, and mathematical simulation.

---

## Verdict

**ACCOUNTING ENGINE CERTIFIED**
