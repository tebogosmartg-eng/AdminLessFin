# AdminLess Fin V2.2 — BOE Architectural Enforcement Sprint

**Date:** 2026-07-02  
**Board:** Principal Engineering Board  
**Status:** AUDIT COMPLETE — EXECUTION ENFORCEMENT NOT YET IMPLEMENTED  
**Verdict:** BOE exists as contract + presentation layer. **0% of business mutations execute through BOE orchestration.**

---

## Executive Summary

The Business Operations Engine (BOE) foundation from V2.1 is **real and well-structured** as a metadata contract:

| BOE Component | Location | Role Today |
|---|---|---|
| Business Event Registry | `src/lib/boe/businessEvents.ts` | 19 event definitions with orchestration pipelines |
| Orchestration Model | `src/lib/boe/orchestration.ts` | Pipeline stages + `describeOrchestration()` (read-only) |
| Platform Services | `src/lib/boe/platformServices.ts` | Service contracts + consumer matrix |
| Next Action Engine | `src/lib/boe/nextActionEngine.ts` | Unified next-action resolver (**defined, not consumed by pages**) |
| Activity Engine | `src/lib/boe/activityEngine.ts` | Post-hoc journal/audit → lifecycle activity enrichment |
| Route Lifecycle Map | `src/lib/boe/routeLifecycleMap.ts` | Screen → lifecycle/stage metadata |
| Calendar Navigation | `src/lib/boe/calendarNavigation.ts` | Calendar event deep links |
| Contextual Chat | `src/lib/boe/contextualChat.ts` | Entity-scoped chat URLs |

**Critical gap:** There is no `publishBusinessEvent`, `executeThroughBOE`, or equivalent execution entry point. Every business mutation follows:

```
UI Component → useMutation → supabase.functions.invoke(edgeFn) → DB/RPC → queryClient.invalidateQueries
```

Edge functions contain **zero** BOE references (grep across `supabase/functions/**/*.ts`).

---

## 1. BOE Coverage Report

### Coverage Formula

| Metric | Count | % |
|---|---|---|
| **Distinct business mutation workflows audited** | 78 | 100% |
| **Workflows executing through BOE orchestration** | 0 | **0%** |
| **Workflows with BOE metadata only (presentation/read-side)** | 14 | 18% |
| **Workflows fully bypassing BOE** | 78 | **100%** (execution) |

### BOE-Aware Presentation (Not Execution)

These screens consume BOE *read-side* modules but still invoke edge functions directly for mutations:

| Screen | BOE Integration | Mutation Path |
|---|---|---|
| `Dashboard.tsx` | `OperationsActionPanel`, `ActivityFeed` | `dashboard-data` direct |
| `InvoiceDetail.tsx` | `LifecycleContextBadge`, `buildChatUrl`, lifecycle stepper | `invoices`, `journal-entries` direct |
| `QuoteDetail.tsx` | Same pattern | `quotes` direct |
| `PurchaseOrderDetail.tsx` | Same pattern | `purchase-orders` direct |
| `PayrollRunDetail.tsx` | `LifecycleContextBadge`, `buildChatUrl` | `payroll`, `send-payslip-email` direct |
| `FinancialCalendar.tsx` | `calendarNavigation`, `LifecycleContextBadge` | `calendar-events` direct |
| `Chat.tsx` | `contextualChat`, `LifecycleContextBadge` | `messages` direct |

### Module Coverage Summary

| Module | Mutation Workflows | BOE Execution | BOE Presentation |
|---|---|---|---|
| Revenue | 18 | 0% | ~40% (detail pages + dashboard) |
| Procurement | 14 | 0% | ~35% |
| Payroll | 9 | 0% | ~50% (command centre UI) |
| Accounting | 12 | 0% | ~15% (activity feed inference) |
| Fixed Assets | 4 | 0% | 0% |
| Loans | 3 | 0% | 0% |
| Projects / Time | 10 | 0% | 0% |
| Inventory | 3 | 0% | 0% |
| Reports / Dashboard | 8 (read-only) | N/A | ~25% |
| Settings / Auth | 7 | 0% | 0% |

**Sprint gate:** Version 2.2 success criteria are **not met**. Execution enforcement must precede feature development.

---

## 2. Workflow Traceability Matrix

Every business action mapped to its intended Business Event, current flow, and BOE status.

### Revenue

| Business Action | Intended Event | Current Flow | BOE Status |
|---|---|---|---|
| Create customer | `customer.created` *(missing)* | `CustomerForm` → `customers` POST | **BYPASS** |
| Update customer | `customer.updated` *(missing)* | `CustomerForm` → `customers` PUT | **BYPASS** |
| Delete customer | `customer.deleted` *(missing)* | `Customers.tsx` → `customers` DELETE | **BYPASS** |
| Create quote | `quote.created` | `QuoteForm` → `quotes` POST | **BYPASS** |
| Update quote | `quote.updated` *(missing)* | `QuoteForm` → `quotes` PUT | **BYPASS** |
| Send quote | `quote.sent` | `SendQuoteDialog` → `send-quote-email` | **BYPASS** |
| Approve/decline quote | `quote.approved` | `QuoteDetail` → `quotes` PUT status | **BYPASS** |
| Convert quote → invoice | `invoice.created` | `CreateInvoiceFromQuoteDialog` → `invoices` CREATE_FROM_QUOTE | **BYPASS** |
| Create invoice | `invoice.created` | `InvoiceForm` → `invoices` CREATE_WITH_TIMESHEETS | **BYPASS** |
| Update invoice | `invoice.updated` *(missing)* | `InvoiceForm` / `Invoices.tsx` → `invoices` PUT | **BYPASS** |
| Void invoice | `invoice.voided` *(missing)* | `InvoiceDetail` → `invoices` VOID | **BYPASS** |
| Send invoice | `invoice.sent` | `SendInvoiceDialog` → `send-invoice-email` | **BYPASS** |
| Record invoice payment | `payment.received` | `InvoicePaymentForm` → `payments` RECORD_INVOICE_PAYMENT | **BYPASS** |
| Record customer payment | `payment.received` | `ReceivePaymentForm` → `payments` RECORD_CUSTOMER_PAYMENT | **BYPASS** |
| Create credit note | `credit_note.created` *(missing)* | `CreditNoteForm` → `credit-notes` CREATE | **BYPASS** |
| Allocate credit note | `credit_note.allocated` *(missing)* | `AllocateCreditDialog` → `credit-notes` ALLOCATE | **BYPASS** |
| Send statement | `statement.sent` *(missing)* | `SendStatementDialog` → `send-statement-email` | **BYPASS** |
| Recurring invoice CRUD/process | `recurring.*` *(missing)* | `RecurringInvoiceForm` / `RecurringInvoices.tsx` | **BYPASS** |

### Procurement

| Business Action | Intended Event | Current Flow | BOE Status |
|---|---|---|---|
| Create/update vendor | `vendor.*` *(missing)* | `VendorForm` → `vendors` | **BYPASS** |
| Delete vendor | `vendor.deleted` *(missing)* | `Vendors.tsx` → `vendors` DELETE | **BYPASS** |
| Create PO | `purchase_order.created` | `PurchaseOrderForm` → `purchase-orders` POST | **BYPASS** |
| Send PO | `purchase_order.sent` | `SendPODialog` → `send-po-email` | **BYPASS** |
| Update PO status | `purchase_order.updated` *(missing)* | `PurchaseOrderDetail` → `purchase-orders` PUT | **BYPASS** |
| Delete PO | `purchase_order.deleted` *(missing)* | `PurchaseOrders.tsx` → DELETE | **BYPASS** |
| Create bill | `bill.created` | `BillForm` → `bills` POST | **BYPASS** |
| Void/delete bill | `bill.voided` *(missing)* | `Bills.tsx` → VOID/DELETE | **BYPASS** |
| Pay bill | `bill.payment_made` | `BillPaymentForm` → `payments` RECORD_VENDOR_PAYMENT | **BYPASS** |
| Create vendor credit | `vendor_credit.created` *(missing)* | `VendorCreditForm` → CREATE | **BYPASS** |
| Allocate vendor credit | `vendor_credit.allocated` *(missing)* | `AllocateVendorCreditDialog` | **BYPASS** |
| Recurring bill CRUD/process | `recurring.*` *(missing)* | `RecurringBillForm` / `RecurringBills.tsx` | **BYPASS** |

### Payroll

| Business Action | Intended Event | Current Flow | BOE Status |
|---|---|---|---|
| Create employee | `employee.created` *(missing)* | `EmployeeForm` → `employees` | **BYPASS** |
| Delete employee | `employee.deleted` *(missing)* | `Employees.tsx` → DELETE | **BYPASS** |
| Create payroll run | `payroll.run_created` | `NewPayrollRunDialog` → `payroll` CREATE_RUN | **BYPASS** |
| Generate payslips | `payroll.payslips_generated` | `PayrollRunDetail` → GENERATE_PAYSLIPS | **BYPASS** |
| Approve payroll run | `payroll.approved` | `PayrollRunDetail` → APPROVE_RUN | **BYPASS** |
| Process/finalize payroll | `payroll.processed` | `PayrollRunDetail` → FINALIZE_RUN | **BYPASS** |
| Generate bank file | `payroll.bank_file_generated` | `PayrollRunDetail` → download via payrollDocuments | **BYPASS** |
| Distribute payslips | `payroll.distributed` *(missing)* | `PayrollRunDetail` → RECORD_DISTRIBUTION + `send-payslip-email` | **BYPASS** |

### Accounting

| Business Action | Intended Event | Current Flow | BOE Status |
|---|---|---|---|
| Post journal entry | `journal.posted` | `JournalEntryForm` → `journal-entries` JOURNAL_ENTRY | **BYPASS** |
| Delete journal | `journal.deleted` *(missing)* | `JournalEntries.tsx` → DELETE | **BYPASS** |
| Finish reconciliation | `bank.reconciled` *(missing)* | `Reconciliation.tsx` → FINISH_RECONCILIATION | **BYPASS** |
| Close financial year | `period.closed` | `FinancialYearSettings` → CLOSE | **BYPASS** |
| Reopen financial year | `period.reopened` *(missing)* | `FinancialYearSettings` → REOPEN | **BYPASS** |
| Recurring entry CRUD/process | `recurring_journal.*` *(missing)* | `RecurringEntryForm` / `RecurringEntries.tsx` | **BYPASS** |
| Import journal entries | `journal.imported` *(missing)* | `Import.tsx` → IMPORT_ENTRIES | **BYPASS** |

### Other Modules

| Business Action | Intended Event | Current Flow | BOE Status |
|---|---|---|---|
| Create fixed asset | `asset.created` *(missing)* | `AssetForm` → `fixed-assets` POST | **BYPASS** |
| Dispose asset | `asset.disposed` *(missing)* | `AssetDisposalForm` → DISPOSE | **BYPASS** |
| Depreciation run | `asset.depreciated` | *(no UI mutation found — RPC/manual)* | **BYPASS** |
| Create loan / record payment | `loan.*` *(missing)* | `LoanForm` / `LoanPaymentForm` | **BYPASS** |
| Project/milestone/timesheet CRUD | `project.*` *(missing)* | `ProjectForm`, `MilestoneForm`, `TimesheetForm` | **BYPASS** |
| Expense claim approve/reimburse | `expense.*` *(missing)* | `ExpenseClaims.tsx`, `ReimburseClaimDialog` | **BYPASS** |
| Product/inventory adjust | `inventory.*` *(missing)* | `ProductForm`, `InventoryAdjustmentDialog` | **BYPASS** |
| Budget CRUD | `budget.*` *(missing)* | `BudgetForm`, `Budgets.tsx` | **BYPASS** |
| Tax rate CRUD | `tax.*` *(missing)* | `TaxRateForm`, `TaxRates.tsx` | **BYPASS** |
| Team/company settings | `settings.*` *(missing)* | `TeamMembersSettings`, `CompanySettings` | **BYPASS** |
| Auth / company switch | `session.*` *(missing)* | `AuthContext` → `user-session`, `settings` | **BYPASS** |

### Evidence: Canonical Bypass Pattern

```260:288:src/components/InvoiceForm.tsx
  const mutation = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      // ...
      const { error } = await supabase.functions.invoke('invoices', {
        body: payload,
      });
      if (error) throw error;
    },
```

No `getBusinessEvent`, no `describeOrchestration`, no event publication.

---

## 3. Event Registry Validation

### Registered Events (19 total)

| Event ID | Lifecycle | Duplicates |
|---|---|---|
| `quote.created` | revenue | None |
| `quote.sent` | revenue | None |
| `quote.approved` | revenue | None |
| `invoice.created` | revenue | None |
| `invoice.sent` | revenue | None |
| `payment.received` | revenue | None |
| `purchase_order.created` | procurement | None |
| `purchase_order.sent` | procurement | None |
| `bill.created` | procurement | None |
| `bill.payment_made` | procurement | None |
| `payroll.run_created` | payroll | None |
| `payroll.payslips_generated` | payroll | None |
| `payroll.approved` | payroll | None |
| `payroll.processed` | payroll | None |
| `payroll.bank_file_generated` | payroll | None |
| `journal.posted` | accounting | None |
| `asset.depreciated` | fixed_assets | None |
| `period.closed` | financial_close | None |

**Duplicate check:** PASS — no duplicate event IDs.

### Registry Gaps (59+ actions without events)

High-priority missing events required by sprint spec:

- `customer.created`, `customer.updated`
- `invoice.approved`, `invoice.voided`
- `bill.approved`
- `payroll.validated`, `payroll.distributed`
- `asset.created`, `asset.disposed`
- `bank.reconciled`
- Full CRUD events for vendors, employees, products, projects, loans, credit notes, vendor credits, expense claims

### Registry Integrity Issues

1. **`inferEventFromJournalDescription`** uses fragile string matching — not event publication.
2. **`normalizeAuditActivity`** constructs synthetic event IDs (`${table}.${action}`) that mostly **do not exist** in `BUSINESS_EVENTS`.
3. **`nextActionEngine.resolveNextAction`** is never imported by page components — pages call `revenueWorkflow` / `procurementWorkflow` / `payrollWorkflow` directly, fragmenting the unified engine.

---

## 4. Platform Service Matrix

Which services respond to which events **by contract** vs **by actual runtime behaviour**.

| Platform Service | Contract Status | Triggered By Events Today | Actual Implementation |
|---|---|---|---|
| Workflow | active | No — UI calls lifecycle modules directly | `revenueWorkflow.ts`, `procurementWorkflow.ts`, `payrollWorkflow.ts` |
| Business Event | active | No — registry is passive metadata | `businessEvents.ts` |
| Approval | partial | No — inline in edge functions/pages | `PayrollRunDetail`, `expense-claims` |
| Document | active | No — forms/dialogs invoke send-* directly | `payrollDocuments.ts`, send dialogs |
| Notification | partial | No — direct `send-*` edge calls | `send-invoice-email`, etc. |
| Activity | active | Post-hoc only via dashboard read | `activityEngine.ts` enriches journal/audit on fetch |
| Calendar | active | Read-only navigation | `calendarNavigation.ts`, `calendar-events` edge |
| Timeline | partial | Payroll audit only | `PayrollTimeline`, `payroll_audit_events` |
| Search | active | N/A (read) | `global-search`, `CommandMenu` |
| Audit | active | Edge functions write `audit_logs` independently | `settings` GET_AUDIT_LOGS |
| Reporting | active | N/A (read) | `reports` edge function |
| Dashboard | active | Read refresh only | `dashboard-data`, `OperationsActionPanel` |
| AI | partial | N/A | `PayrollAiInsights`, `DashboardInsights` |
| Permission | active | Edge function membership checks | `AuthContext`, edge auth |
| History | active | N/A (read) | Detail pages |

### Event → Service Matrix (Contract Only — Not Enforced)

| Event | Contract Pipeline |
|---|---|
| `invoice.sent` | workflow → notification → activity → calendar → dashboard |
| `payroll.processed` | workflow → validation → accounting → document → activity → calendar → dashboard → audit |
| `bill.payment_made` | workflow → validation → accounting → document → activity → calendar → dashboard → audit |
| `journal.posted` | workflow → validation → accounting → document → activity → reporting → dashboard → audit |

**None of these pipelines execute at runtime.** `describeOrchestration()` returns metadata only:

```90:105:src/lib/boe/orchestration.ts
export function describeOrchestration(eventId: string, companyId: string): OrchestrationResult | null {
  const event = getBusinessEvent(eventId);
  if (!event) return null;
  return {
    context: { eventId, lifecycleId: event.lifecycleId, stageId: event.stageId, companyId },
    completedStages: event.orchestrationPipeline,
    // ...
  };
}
```

---

## 5. Lifecycle Compliance Report

| Lifecycle | Registry Defined | UI Stepper on Detail | Next Action via BOE Engine | Mutations via BOE | Compliance |
|---|---|---|---|---|---|
| Revenue | Yes | Invoice, Quote detail | **No** — `revenueWorkflow` direct | **No** | **Non-compliant** |
| Procurement | Yes | PO detail | **No** — `procurementWorkflow` direct | **No** | **Non-compliant** |
| Payroll | Yes | PayrollRunDetail stepper | **No** — `payrollWorkflow` direct | **No** | **Non-compliant** |
| Accounting | Yes | None on journal pages | N/A | **No** | **Non-compliant** |
| Fixed Assets | Yes | None | N/A | **No** | **Non-compliant** |
| Loans | Yes | None | N/A | **No** | **Non-compliant** |
| Projects | Yes | None | N/A | **No** | **Non-compliant** |
| Tax | Yes | None | N/A | **No** | **Non-compliant** |
| Financial Close | Yes | Reconciliation only | N/A | **No** | **Non-compliant** |

**Lifecycle presentation compliance:** ~33% (3 of 9 lifecycles have detail-page steppers)  
**Lifecycle execution compliance:** **0%**

---

## 6. Architectural Consistency Report

### Target Architecture (Approved V2.1)

```
UI → Business Event → BOE → Workflow → Rules → Permissions → Validation
  → Accounting → Documents → Notifications → Activity → Calendar → Chat → AI → Dashboard → Supabase
```

### Actual Architecture (V2.2 Audit)

```
UI → useMutation → supabase.functions.invoke(edgeFn) → RPC/DB
                                              ↓
                              queryClient.invalidateQueries (manual per form)
                                              ↓
BOE (read-side only, disconnected):
  - ActivityFeed infers events from journal descriptions post-fetch
  - Lifecycle badges on 5 screens
  - Dashboard groups pending actions by lifecycle label
```

### Remaining Direct UI → Business Logic Paths

**All 78 mutation workflows** are direct paths. Representative categories:

| Category | Files (sample) | Edge Functions |
|---|---|---|
| Revenue forms | `InvoiceForm`, `QuoteForm`, `ReceivePaymentForm`, `CreditNoteForm` | `invoices`, `quotes`, `payments`, `credit-notes`, `send-*` |
| Procurement forms | `BillForm`, `PurchaseOrderForm`, `BillPaymentForm`, `VendorCreditForm` | `bills`, `purchase-orders`, `payments`, `vendors` |
| Payroll | `NewPayrollRunDialog`, `PayrollRunDetail`, `EmployeeForm` | `payroll`, `employees`, `send-payslip-email` |
| Accounting | `JournalEntryForm`, `FinancialYearSettings`, `Reconciliation` | `journal-entries`, `settings`, `accounting` |
| Master data | `CustomerForm`, `VendorForm`, `ProductForm`, `AccountForm` | `customers`, `vendors`, `products`, `chart-of-accounts` |

**BOE import footprint:** Only 12 source files import from `@/lib/boe` or `../lib/boe`. Zero mutation files.

---

## Bypass Remediation Plan (Per Module)

Minimum integration approach — **extend existing BOE, do not redesign**.

### Root Cause (Global)

BOE was implemented as a **contract and presentation layer** with explicit comment: *"Execution remains in edge functions; the registry is the contract layer."* No execution bridge was built between UI mutations and the event registry.

### Minimum Target Flow

```
UI Component
  → executeBusinessOperation({ eventId, payload, executor })
      → getBusinessEvent(eventId)           // validate contract
      → build BusinessEventContext          // metadata envelope
      → executor()                          // existing edge function call (unchanged body)
      → onSuccess: resolveOrchestrationHints // invalidate queries per event pipeline
  → UI refresh (existing invalidation + optional activity metadata)
```

### Implementation Phases

| Phase | Scope | Files | Risk |
|---|---|---|---|
| **P0** | Add `executionContract.ts` with `executeBusinessOperation` | `src/lib/boe/executionContract.ts`, `index.ts` | Low — additive only |
| **P1** | Wire revenue mutations (highest volume) | `InvoiceForm`, `QuoteForm`, `Send*Dialog`, payment forms | Low — pass-through to existing edge calls |
| **P2** | Wire procurement + payroll | `BillForm`, `PurchaseOrderForm`, `PayrollRunDetail`, etc. | Low |
| **P3** | Wire accounting + assets + projects | `JournalEntryForm`, `AssetForm`, etc. | Low |
| **P4** | Expand event registry (59 missing events) | `businessEvents.ts` | Medium — naming discipline required |
| **P5** | Migrate pages to `resolveNextAction` from BOE | Detail pages currently using `*Workflow.ts` | Low — refactor imports only |
| **P6** | Optional: edge functions accept `business_event_id` for audit enrichment | Edge functions (minimal header/body field) | Low — backward compatible |

### Per-Workflow Example: Create Invoice

| Field | Value |
|---|---|
| **Root cause** | `InvoiceForm` calls `invoices` edge function directly |
| **Current flow** | `InvoiceForm` → `useMutation` → `invoke('invoices', CREATE_WITH_TIMESHEETS)` → journal RPC inside edge → `invalidateQueries` |
| **Target flow** | `InvoiceForm` → `executeBusinessOperation('invoice.created', { executor: () => invoke(...) })` → same edge call → BOE-driven invalidation hints |
| **Files affected** | `InvoiceForm.tsx`, `src/lib/boe/executionContract.ts` |
| **Risk** | Low — edge function and accounting RPC unchanged |
| **Dependencies** | P0 execution contract |
| **Rollback** | Revert form to direct `invoke` — no schema/edge changes |
| **Expected outcome** | Every invoice creation publishes `invoice.created` context; dashboard/activity can consume event metadata |

### Quality Gate Checklist (Per Implementation)

- [ ] Existing accounting behaviour unchanged
- [ ] Existing CRUD behaviour unchanged
- [ ] Edge function bodies unchanged (optional metadata only)
- [ ] Database unchanged
- [ ] Reports unchanged
- [ ] Permissions preserved (event `permissions` array checked client-side before executor)
- [ ] Audit trail preserved
- [ ] Dashboard preserved (enhanced, not replaced)
- [ ] Lifecycle behaviour preserved

---

## Recommended Execution Contract Shape

```typescript
// Proposed: src/lib/boe/executionContract.ts (NOT YET IMPLEMENTED)

export type BusinessOperationRequest<T> = {
  eventId: string;
  companyId: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  executor: () => Promise<T>;
};

export type BusinessOperationResult<T> = {
  data: T;
  context: BusinessEventContext;
  orchestration: OrchestrationResult;
  invalidationKeys: string[];  // derived from event pipeline
};
```

---

## Sprint Gate Decision

| Criterion | Status |
|---|---|
| UI is presentation layer only | **FAIL** — UI owns orchestration via direct edge calls |
| Every business action begins with Business Event | **FAIL** — 0% |
| BOE is mandatory orchestration engine | **FAIL** — metadata only |
| Every lifecycle follows execution contract | **FAIL** |
| Platform services operate consistently | **FAIL** — services exist as contracts, not runtime dispatch |
| No accounting behaviour changes | **PASS** — audit is read-only |
| No production regressions | **PASS** — no changes made in this audit |

### Board Ruling

**STOP feature development.** Proceed with P0–P3 enforcement implementation before any new business features.

Estimated coverage after P1–P3: **~65%** of mutation workflows through BOE.  
Estimated coverage after P4–P6: **~95%+**.

---

## Appendix: Evidence Index

| Artifact | Path |
|---|---|
| Business Event Registry | `src/lib/boe/businessEvents.ts` |
| Orchestration (read-only) | `src/lib/boe/orchestration.ts` |
| Platform Services | `src/lib/boe/platformServices.ts` |
| Activity enrichment | `src/lib/boe/activityEngine.ts` |
| Next Action (unused by pages) | `src/lib/boe/nextActionEngine.ts` |
| Lifecycle registry | `src/lib/businessLifecycles.ts` |
| Query/mutation hub | `src/lib/queries.ts` |
| Frontend-backend traceability | `docs/FRONTEND_BACKEND_TRACEABILITY_MATRIX.md` |
| Lifecycle architecture | `docs/BUSINESS_LIFECYCLE_V2.md` |
| Edge functions (no BOE) | `supabase/functions/*/index.ts` |
