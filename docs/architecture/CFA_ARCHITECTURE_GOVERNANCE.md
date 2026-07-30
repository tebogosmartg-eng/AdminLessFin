# Canonical Financial Aggregation — Architecture Governance

**Product:** AdminLess Fin  
**ADR:** [ADR-0003](../adr/ADR-0003-canonical-financial-aggregation-architecture-freeze.md)  
**Status:** Binding for all contributors and agents

---

## 1. Canonical Financial Aggregation (CFA)

CFA is the **only** permitted monetary aggregation layer for:

- Income Statement / Profit & Loss
- Balance Sheet / Financial Position
- Cash & cash-flow section totals
- Equity (stored + current year earnings)
- VAT payable / receivable / net
- Receivables / payables (GL role-based)
- Trial Balance closing DR/CR authority and balanced flag
- Dashboard / Reports / Tax / Banking / AI **company** KPIs

**Authority files (do not fork):**

| Path | Role |
|------|------|
| `src/lib/accounting/canonicalFinancialAggregation.ts` | Client CFA |
| `supabase/functions/_shared/canonicalFinancialAggregation.ts` | Edge CFA |
| `supabase/functions/_shared/accountingEngineTotals.ts` | Façade → CFA |
| `src/lib/accounting/dashboardReconciliation.ts` | Test/UI wrappers → CFA |
| `supabase/functions/_shared/loadCanonicalAggregation.ts` | RPC fetch + CFA |

Inputs are certified GL/TB RPCs only:

- `get_balances_as_of_date`
- `get_period_activity`
- `get_cash_flow_statement`

---

## 2. Approved data flow

```text
Journals / Posting Engine (write — frozen)
        ↓
General Ledger / Trial Balance RPCs (read — frozen)
        ↓
Canonical Financial Aggregation (sole money math)
        ↓
Edge consumers (reports, dashboard-data, accounting AI attach, projects, EFS seal)
        ↓
UI (display CFA fields only — no re-aggregation)
```

**Correct consumption examples:**

```ts
const cfa = data.canonicalAggregation ?? data.statementTotals;
const netIncome = Number(cfa.netIncome ?? 0);
const cash = Number(cfa.cash ?? 0);
const vatNet = Number(cfa.vatNet ?? 0);
```

Edge:

```ts
import { loadCanonicalAggregation } from '../_shared/loadCanonicalAggregation.ts';
const cfa = await loadCanonicalAggregation({ admin, rpc, company_id, start_date, end_date });
```

---

## 3. Forbidden patterns

| Pattern | Why forbidden |
|---------|----------------|
| `arBalances.reduce` / `apBalances.reduce` for KPIs | Parallel AR/AP vs CFA |
| Summing `journal_entry_items` for revenue/expenses/profit | Parallel P&L |
| Tax rate × JE base schedules for VAT totals | Parallel VAT vs CFA `vatNet` |
| `get_monthly_summary` / `get_top_expenses` as money authority | Parallel KPI engines |
| New `*Aggregation.ts` / `*trialBalanceEngine.ts` services | Duplicate authority |
| Client `reduce` of TB/GL rows for statement totals | Bypasses CFA |
| Reconstructing TB closing totals differently from CFA | Divergence |
| AI company KPIs without `canonicalAggregation` / `company_financials` | Bypass |

**Allowed (not CFA):**

- Document form line totals (invoice/bill/JE draft balance check)
- Payroll payslip / statutory engine totals
- Inventory / fixed-asset register operational KPIs
- Hierarchical TB **visual** group subtotals of displayed rows
- Account-level inquiry series from certified `get_account_movement_*` RPCs (with company money from CFA)

---

## 4. How to add a new report

1. **Do not** invent aggregation. Call `reports` (or `loadCanonicalAggregation`) for the period.
2. Read fields from `canonicalAggregation` / `statementTotals`.
3. If a CFA field is missing, raise an ADR — do not compute it in the report.
4. Add an architectural test asserting the new page/edge path contains CFA markers.
5. Run `npm run guard:cfa` and `npm run test -- tests/unit/cfa-architecture-governance.test.ts`.

---

## 5. How to consume CFA correctly

| Need | CFA field(s) |
|------|----------------|
| Revenue / Total Income | `totalIncome` / `revenue` |
| Expenses | `totalExpenses`, partitions (`costOfSales`, `operatingExpenses`, …) |
| Net profit / CYE | `netIncome` |
| Assets / Liabilities / Equity | `totalAssets`, `totalLiabilities`, `totalEquity` |
| Cash | `cash`, CF sections `cashOperating` / `cashInvesting` / `cashFinancing` / `netCashFlow` |
| VAT | `vatPayable`, `vatReceivable`, `vatNet` |
| AR / AP | `receivables`, `payables` |
| TB sides | `totalDebits`, `totalCredits`, `trialBalanceBalanced` |

Never re-sum the underlying RPC rows in UI or a second edge helper.

---

## 6. Local & CI commands

```bash
npm run guard:cfa          # static forbidden-pattern scan
npm run test               # includes architectural governance tests
npm run lint               # ESLint restricted accounting patterns
npm run build              # production build
npm run certify:cfa-gov    # guard + architectural tests
```

CI: `.github/workflows/cfa-architecture-governance.yml`

---

## 7. Escalation

Changes to CFA semantics, new money fields, or intentional exceptions require a **new ADR** approved before merge. Prefer integrity over convenience.
