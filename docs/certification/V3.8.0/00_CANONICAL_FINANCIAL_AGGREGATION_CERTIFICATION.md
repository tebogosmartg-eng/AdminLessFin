# Canonical Financial Aggregation Engine

**Board:** Chief ERP Architect / Principal Accounting Engine Engineer  
**Product:** AdminLess Fin  
**Date:** 2026-07-29  
**Status:** CERTIFIED  
**Prerequisite:** Financial Statement Reconciliation Audit — FAILED (duplicate paths)

---

## Mission

Replace parallel money aggregations with **one** Canonical Financial Aggregation derived from General Ledger / Trial Balance RPC payloads.

## Authoritative chain

```
Business Events → Journal Posting → Journal Entries → General Ledger → Trial Balance
        → Canonical Financial Aggregation Service
        → Dashboard · Reports · Live FS · Annual FS (presentation) · Validation · KPIs
```

## Implementation

| Layer | File |
|-------|------|
| Canonical engine | `supabase/functions/_shared/canonicalFinancialAggregation.ts` |
| Edge facade | `supabase/functions/_shared/accountingEngineTotals.ts` |
| Client mirror / tests | `src/lib/accounting/canonicalFinancialAggregation.ts` |
| Dashboard / Reports helpers | `src/lib/accounting/dashboardReconciliation.ts` |

## Duplicate calculations removed / delegated

| Before | After |
|--------|-------|
| `dashboard-data` inline Income/Expense/BS/cash loops | `buildStatementTotals` → canonical |
| `efsStatementEngine` recalculated Σ Income−Expense | Consumes sealed `canonical_aggregation` / `buildCanonicalFinancialAggregation` |
| `reports` comparative NI inline reduce | `buildCanonicalFinancialAggregation` |
| CTB `income + expense` NI | `income − \|expense\|` aligned to canonical |
| `buildStatementTotals` independent math | Thin facade over canonical |

## Canonical outputs

Revenue, Cost of Sales, Gross Profit, Other Income, Operating Expenses, Finance Costs, Tax, Net Profit / CYE, Assets, Liabilities, Equity, Retained Earnings, Cash, Receivables, Payables, VAT, Cash Flow sections.

Classification uses CoA **roles** and **categories** (existing CoA metadata — no parallel role ADR).

## Reconciliation proof

Unit suite: `tests/unit/canonical-financial-aggregation.test.ts`

- Dashboard Revenue = IS Revenue = TB period Income  
- Dashboard Expenses = IS Expenses = TB period Expense  
- Dashboard Profit = IS Profit = FS `perf.result`  
- Assets/Liabilities/Equity = BS = TB type sums (+ CYE presentation)  
- Partition identity: Rev+Other = Total Income; Cos+OpEx+Fin+Tax = Total Expenses  

## Verdict

**CANONICAL FINANCIAL AGGREGATION ENGINE CERTIFIED**
