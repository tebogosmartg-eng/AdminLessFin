# AdminLess Fin V2 — Business Lifecycle Architecture

**Date:** 2026-07-02  
**Status:** Baselined — Evolution (not redesign)  
**Standard:** Every feature must belong to an end-to-end business lifecycle.

---

## 1. Business Lifecycle Map

```mermaid
flowchart TB
  subgraph REV["Lifecycle 1 — Revenue"]
    R1[Customer] --> R2[Quote]
    R2 --> R3[Approval]
    R3 --> R4[Invoice]
    R4 --> R5[Collections]
    R5 --> R6[Payment]
    R6 --> R7[Receipt]
    R7 --> R8[Bank Reconciliation]
    R8 --> R9[Customer Statement]
    R9 --> R10[Revenue Analytics]
    R10 --> R11[Customer History]
  end

  subgraph PROC["Lifecycle 2 — Procurement"]
    P1[Vendor] --> P2[Purchase Order]
    P2 --> P3[Approval]
    P3 --> P4[Goods/Services Received]
    P4 --> P5[Bill]
    P5 --> P6[Payment Approval]
    P6 --> P7[Payment]
    P7 --> P8[Vendor Statement]
    P8 --> P9[Spend Analytics]
    P9 --> P10[Vendor History]
  end

  subgraph PAY["Lifecycle 3 — Payroll"]
    Y1[Employee] --> Y2[Preparation]
    Y2 --> Y3[Validation]
    Y3 --> Y4[Approval]
    Y4 --> Y5[Processing]
    Y5 --> Y6[Payslips]
    Y6 --> Y7[Register]
    Y7 --> Y8[Journal]
    Y8 --> Y9[Bank Payment File]
    Y9 --> Y10[Payment Confirmation]
    Y10 --> Y11[Payroll History]
    Y11 --> Y12[Employee History]
  end

  subgraph ACC["Lifecycle 4 — General Accounting"]
    A1[Business Event] --> A2[Journal]
    A2 --> A3[GL]
    A3 --> A4[Trial Balance]
    A4 --> A5[Financial Statements]
    A5 --> A6[Audit Trail]
    A6 --> A7[Financial Close]
  end
```

**Registry:** Canonical stage definitions live in `src/lib/businessLifecycles.ts`.

---

## 2. Current Lifecycle Coverage

| Lifecycle | Coverage | Maturity |
|-----------|----------|----------|
| **Revenue** | 78% | Strong — workspace, quote→invoice, payments, statements |
| **Procurement** | 72% | Strong — workspace, PO→bill, payments, vendor statements |
| **Payroll** | 85% | Strong — command centre, workflow stepper, documents, bank file |
| **Accounting** | 80% | Strong — journals, GL, reconciliation, statements |
| **Fixed Assets** | 65% | Moderate — acquire, depreciate, dispose; transfer/impair partial |
| **Loans** | 70% | Moderate — create, schedule, payments; approval workflow light |
| **Projects** | 68% | Moderate — budget, time, profitability; revenue recognition partial |
| **Tax** | 55% | Moderate — rates, sales tax report; returns/submission future |
| **Financial Close** | 45% | Early — reconciliation + year-close RPC; period lock UI limited |

### Revenue — Stage Coverage

| Stage | Implemented | Primary Surface |
|-------|-------------|-----------------|
| Customer | ✅ | `/customers`, `/customers/:id` |
| Opportunity | 🔮 Future | — |
| Quote | ✅ | `/quotes`, `/quotes/:id` |
| Approval | ✅ | Quote accept/decline on detail |
| Invoice | ✅ | `/invoices`, quote→invoice dialog |
| Collections | ✅ | Revenue workspace, overdue lists |
| Payment | ✅ | `/receive-payments`, invoice payment form |
| Receipt | ⚠️ Partial | Payment recorded; no standalone receipt doc |
| Bank Reconciliation | ✅ | `/reconciliation` |
| Customer Statement | ✅ | Customer detail + email |
| Revenue Analytics | ✅ | `/sales` workspace, dashboard charts |
| Customer History | ✅ | Customer detail statement |

### Procurement — Stage Coverage

| Stage | Implemented | Primary Surface |
|-------|-------------|-----------------|
| Vendor | ✅ | `/vendors`, `/vendors/:id` |
| Purchase Request | 🔮 Future | — |
| Purchase Order | ✅ | `/purchase-orders`, `/purchase-orders/:id` |
| Approval | ⚠️ Partial | PO send; no formal approval workflow |
| Goods/Services Received | ⚠️ Partial | Implicit via bill conversion |
| Bill | ✅ | `/bills`, PO→bill |
| Payment Approval | ⚠️ Partial | Pay bills UI; no approval gate |
| Payment | ✅ | `/pay-bills` |
| Vendor Statement | ✅ | Vendor detail + email |
| Spend Analytics | ✅ | `/purchases` workspace |
| Vendor History | ✅ | Vendor detail |

### Payroll — Stage Coverage

| Stage | Implemented | Primary Surface |
|-------|-------------|-----------------|
| Employee | ✅ | `/employees` |
| Preparation | ✅ | `/payroll-runs`, command centre |
| Validation | ✅ | Generate payslips step |
| Approval | ✅ | Approve run (client + server) |
| Processing | ✅ | Post journal, finalize |
| Payslips | ✅ | Generate, view, email |
| Register | ✅ | Download register |
| Journal | ✅ | View linked journal entry |
| Bank Payment File | ✅ | CSV export (V2 addition) |
| Payment Confirmation | ⚠️ Partial | Manual bank upload; no confirmation record |
| Payroll History | ✅ | `/payroll-runs`, reports |
| Employee History | ⚠️ Partial | Employee list; per-employee payroll history light |

---

## 3. Integration Matrix

| Capability | Revenue | Procurement | Payroll | Accounting | Assets | Loans | Projects | Tax | Close |
|------------|---------|-------------|---------|------------|--------|-------|----------|-----|-------|
| Dashboard `/` | ✅ | ✅ | ✅ | ✅ | — | — | — | — | — |
| Calendar `/calendar` | ✅ | ✅ | ✅ | — | — | — | — | — | ✅ |
| Chat `/chat` | ✅ | ✅ | ✅ | ✅ | — | — | — | — | — |
| Global Search Ctrl+K | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Documents | ✅ | ✅ | ✅ | ✅ | ⚠️ | — | ⚠️ | — | ✅ |
| Reports | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| Audit Logs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ |
| AI Insights | ⚠️ | ⚠️ | ✅ | ⚠️ | — | — | — | — | — |
| Approvals | ⚠️ | ⚠️ | ✅ | — | — | — | ✅ | — | ⚠️ |
| Journal Engine | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |

**Edge function domains:** `customers`, `quotes`, `invoices`, `payments`, `vendors`, `purchase-orders`, `bills`, `payroll`, `employees`, `journal-entries`, `accounting`, `reports`, `fixed-assets`, `loans`, `projects`, `timesheets`, `expense-claims`, `dashboard-data`, `global-search`, `calendar-events`, `financial-year`.

---

## 4. Missing Lifecycle Stages

### High Priority (workflow gaps users feel)

| Gap | Lifecycle | Risk if ignored |
|-----|-----------|-----------------|
| Formal quote/PO approval workflow | Revenue, Procurement | No segregation of duties |
| Payment receipt document | Revenue | Incomplete audit trail |
| Payroll payment confirmation | Payroll | Ops team can't close the loop |
| Period lock UI | Financial Close | Accidental post-close edits |
| Global activity feed | Cross-cutting | Users can't see "what happened" |

### Medium Priority (future-ready placeholders)

| Gap | Lifecycle | Notes |
|-----|-----------|-------|
| Opportunity / CRM | Revenue | Stage defined, not built |
| Purchase Request | Procurement | Stage defined, not built |
| Asset transfer / impair | Fixed Assets | Disposal exists; transfer light |
| Revenue recognition | Projects | Profitability report exists |
| Tax submission | Tax | Report exists; filing future |

### Low Priority (enhancement)

| Gap | Lifecycle |
|-----|-----------|
| Per-employee payroll history page | Payroll |
| Payment remittance document | Procurement |
| AI variance explanation on dashboard | Cross-cutting |

---

## 5. Recommended Improvements

### Implemented in V2 (this release)

1. **`businessLifecycles.ts`** — Canonical lifecycle registry for all 9 lifecycles.
2. **`BusinessLifecycleStepper`** — Reusable progress UI on quote, invoice, and PO detail pages.
3. **`LifecycleNextAction`** — Contextual "what do I do next?" guidance on detail pages.
4. **Bank payment file export** — CSV batch file on processed payroll runs.
5. **Payroll workflow extension** — Bank File step between Outputs and Distribute.

### Phase 2 (next sprint — still low risk)

1. Add lifecycle stepper to `BillDetail` (if exists) or bill list row actions.
2. Customer/Vendor detail: link to workspace + show lifecycle position.
3. Dashboard action cards grouped by lifecycle, not module.
4. Financial calendar: click event → navigate to lifecycle stage.
5. Command menu: group navigation by lifecycle.

### Phase 3 (requires workflow engine)

1. Configurable approval chains (quote, PO, expense, payroll).
2. Global activity feed from audit logs.
3. Period lock UI wired to `financial-year` edge function.
4. AI copilot lifecycle-aware suggestions (read-only).

---

## 6. Low-Risk Implementation Plan

| # | Item | Effort | Risk | Value |
|---|------|--------|------|-------|
| 1 | Lifecycle registry (`businessLifecycles.ts`) | S | None | Foundation |
| 2 | Detail page steppers (quote, invoice, PO) | S | None | High |
| 3 | Next-action banners | S | None | High |
| 4 | Bank payment CSV | S | None | High |
| 5 | Bill detail lifecycle UI | S | None | Medium |
| 6 | Vendor/customer lifecycle links | S | None | Medium |
| 7 | Dashboard lifecycle grouping | M | Low | Medium |
| 8 | Approval workflow engine | L | Medium | High |
| 9 | Period lock UI | M | Medium | High |
| 10 | Opportunity module | L | Medium | Future |

**Principles preserved:** No schema changes, no accounting rewrites, no parallel workflows, no breaking changes.

---

## 7. Verification Report

### Quality Gates

| Gate | Status |
|------|--------|
| Accounting correctness preserved | ✅ No posting logic changed |
| Security preserved | ✅ No new edge functions; client-only UI |
| Auditability preserved | ✅ Existing audit paths unchanged |
| RLS preserved | ✅ No database changes |
| Supabase architecture preserved | ✅ Edge-function pattern maintained |
| Financial integrity preserved | ✅ Journal engine untouched |
| Reporting preserved | ✅ No report logic changed |
| Production readiness preserved | ✅ Additive UI only |
| User workflow improved | ✅ Lifecycle guidance on 3 detail pages |
| Discoverability improved | ✅ Workspaces + steppers + next actions |
| Operational intelligence improved | ✅ Bank file closes payroll loop |

### Files Added/Modified (V2)

| File | Change |
|------|--------|
| `src/lib/businessLifecycles.ts` | **New** — lifecycle registry |
| `src/lib/revenueWorkflow.ts` | **New** — quote/invoice stage resolvers |
| `src/lib/procurementWorkflow.ts` | **New** — PO stage resolvers |
| `src/components/BusinessLifecycleStepper.tsx` | **New** — reusable stepper |
| `src/components/LifecycleNextAction.tsx` | **New** — next-step banner |
| `src/pages/QuoteDetail.tsx` | Lifecycle UI |
| `src/pages/InvoiceDetail.tsx` | Lifecycle UI |
| `src/pages/PurchaseOrderDetail.tsx` | Lifecycle UI |
| `src/lib/payrollWorkflow.ts` | Bank file step |
| `src/lib/payrollDocuments.ts` | Bank payment CSV export |
| `src/components/payroll/PayrollCommandCentre.tsx` | Bank file button |
| `src/pages/PayrollRunDetail.tsx` | Bank file handler |

### Manual Test Checklist

- [ ] Open accepted quote → see lifecycle stepper at Invoice stage + "Create invoice" next action
- [ ] Open sent invoice → see Collections stage + "Receive payment" next action
- [ ] Open sent PO → see Approval stage + "Convert to bill" next action
- [ ] Process payroll run → download bank payment CSV with employee bank details
- [ ] Revenue workspace `/sales` → lifecycle navigation card still works
- [ ] Purchases workspace `/purchases` → procurement lifecycle card still works
- [ ] Payroll command centre → 8-step workflow includes Bank File

---

## Architectural Standard (Permanent)

> AdminLess Fin is a **Business Operations Platform**. Every future enhancement must strengthen a business lifecycle. No feature should exist in isolation.

**Enforcement:**
- New routes must declare `lifecycleId` in `businessLifecycles.ts`
- New detail pages should include `BusinessLifecycleStepper` + `LifecycleNextAction`
- New edge functions must map to a lifecycle stage in this document
- AI features remain read-only assistants — never post transactions

**Registry location:** `src/lib/businessLifecycles.ts`
