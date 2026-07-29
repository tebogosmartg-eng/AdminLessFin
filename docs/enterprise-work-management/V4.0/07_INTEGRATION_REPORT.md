# 07 — Integration Report

**Module:** Enterprise Work Management — Cross-Module Integration  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board verdict:** APPROVED  

---

## 1. Integration Philosophy

EWM **never owns** CRM, Payroll, Accounting, Expenses, Assets, Inventory, Sales, Purchases, HR, or Document Management.

EWM **integrates** via:

1. `company_id` tenancy  
2. Optional foreign keys (`project_id`, `customer_id`, `employee_id`, …)  
3. Read-only consumption of upstream facts  
4. Emission of finalized operational facts for downstream consumers  
5. Additive BOE `work.*` events  

---

## 2. Integration Matrix

| Module | Direction | Contract | Ownership |
|--------|-----------|----------|-----------|
| CRM / Customers | Read | `customer_id` on project/time | CRM owns customers |
| Projects (existing) | Bidirectional link | `project_id`; milestones optional sync | Projects remain engagement SoT |
| Timesheets (legacy) | Outbound bridge | Locked billable EWM entries → timesheet rows for invoice | Sales owns invoicing |
| Sales / Invoices | Outbound | Unbilled time → existing invoice flows | Sales owns invoices |
| Expenses | Read | Expense tagged to project for op. margin | Expenses owns claims |
| Assets | Read (optional) | Asset assigned to project/site | Assets owns register |
| Inventory | Read (optional) | Material issues tagged to project | Inventory owns stock |
| Purchases / Bills | Read | PO/bill lines with `project_id` | Purchases owns POs |
| HR | Read | Leave, skills/certs, employment status | HR owns people master |
| Payroll (**FROZEN**) | Outbound ref / Inbound cost ref | Locked time facts by period; optional payroll cost attach after finalize | Payroll owns payslips |
| Accounting (**FROZEN**) | Outbound facts only | Finalized `ewm_cost_facts` available; **no journal posting from EWM** | Accounting owns GL |
| Documents | Outbound | Evidence attachments on time/tasks | DMS owns storage |
| Calendar | Outbound | Milestone/due/allocation events | Platform calendar |
| Reporting (**locked packs frozen**) | Outbound | New `work` report domain only | Reporting platform registry |
| Audit / Activity | Outbound | `ewm_audit_events` + BOE activity | Platform audit |

---

## 3. BOE Events (Additive)

Proposed registrations (do not alter payroll/accounting events):

| Event | Stage |
|-------|-------|
| `work.workspace_created` | setup |
| `work.project_linked` | planning |
| `work.task_created` | execution |
| `work.time_submitted` | time |
| `work.time_approved` | approval |
| `work.time_locked` | lock |
| `work.allocation_confirmed` | capacity |
| `work.capacity_overload` | alert |
| `work.budget_at_risk` | costing |
| `work.objective_at_risk` | okr |
| `work.milestone_missed` | delivery |

Orchestration: Workflow → Validation → Approval → Notification → Activity → Calendar → Audit → (AI advise) → Reporting.  
**Accounting step:** only if a *separate* frozen accounting process later consumes facts — EWM pipeline itself does not post.

---

## 4. Payroll Bridge (Future, Non-Breaking)

```
EWM Locked Time Facts
  → (optional adapter) payroll period association
  → Payroll reads facts if product decides time-driven inputs
  → Payroll engine UNCHANGED
```

V4.0 architecture allows the bridge; implementation requires explicit change-control if payroll edge contracts are touched. Prefer adapter outside `statutoryPayrollEngine`.

---

## 5. Accounting Bridge

```
EWM Cost Facts (finalized)
  → Accounting / period processes may read for analysis
  → Journal posting remains Accounting-owned (existing paths: billing, expenses, payroll finalize)
```

Project profitability reports that today use `journal_entry_items.project_id` remain valid; EWM adds **operational** profitability alongside, not as a replacement GL view.

---

## 6. Billing Bridge

Reuse existing pattern: timesheets ↔ invoices (`CREATE_WITH_TIMESHEETS`).

Recommended path:

1. Lock billable EWM time  
2. Sync/create timesheet projection rows  
3. Invoice as today  

Alternatively, extend invoice intake to accept `ewm_time_entry_id` **without** changing payroll.

---

## 7. Anti-Corruption Rules

1. No imports of payroll calculation modules into EWM costing  
2. No writes to `journal_entries` from `work` edge function  
3. No mutation of legislation packages  
4. No rewrite of locked report builders  
5. Employee identity fields are read-only  

---

## 8. Board Decision

**APPROVED.** Integration is contract-based, freeze-respecting, and BOE-additive.
