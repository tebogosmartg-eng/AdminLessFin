# 03 — Consumer Matrix

**Version:** 4.3.0  
**Status:** CERTIFIED  

Rule: **Multiple consumers permitted.** Consumers must not become alternate publishers of the same Event ID.

| Consumer | Consumes (certified) | Purpose | Must not |
|----------|----------------------|---------|----------|
| Activity | Lifecycle events with `activity` pipeline | Feed / timeline | Mutate source entity |
| Dashboard | Domain + work risk/capacity events | Invalidation / widgets | Invent KPI maths |
| Notification | Events with notification targets; `notification.*` | Delivery | Invent domain facts |
| Document | Events with `documentsProduced` / `document.*` | Artefacts | Post GL |
| Audit | Events with audit requirement | Immutable trail | Alter business amounts |
| Calendar | Due/sent/milestone/payroll calendar signals | Scheduling | Approve on behalf |
| AI Advisory | Risk/capacity/budget/approval-eligible events | Insights/recommendations | Emit `work.time_locked`, `journal.posted`, auto-approve |
| Reporting | Posted journals, payroll processed, forecast, snapshots | Packs / BI | Recalculate statutory |
| Payroll adapter | `work.time_locked` | Input facts only | Run PAYE/UIF engines from EWM |
| Costing (EWM) | `work.time_locked`, `work.resource_consumed` | Op cost facts | Recognise revenue |
| Billing bridge | `work.time_locked` (eligible) | Timesheet projection signal | Own AR SoT |
| Accounting | `payroll.processed`, payment/bill outcomes (via domain flow) | Journals | Own EWM operational burn |
| Inventory | `work.resource_consumed` (signal) | Align issues | Own EWM catalogue |
| Approvals | `work.time_submitted`, quote/payroll approval subjects | Gates | Bypass publisher rules |
| Search | Master-data create/update events | Index | Store financial SoT |

### Platform subscriber map (runtime contract reference)

| Subscriber ID | File (reference) |
|---------------|------------------|
| activity | `src/lib/boe/subscribers/activitySubscriber.ts` |
| dashboard | `dashboardSubscriber.ts` |
| notification | `notificationSubscriber.ts` |
| document | `documentSubscriber.ts` |
| audit | `auditSubscriber.ts` |
| calendar | `calendarSubscriber.ts` |
| ai | `aiSubscriber.ts` |

Subscriber failures are isolated (P0.5 dispatcher) — never abort successful business operations.

### Consumer integrity gates

| Gate | Result |
|------|--------|
| Multi-consumer allowed | **PASS** |
| AI consumes events (not DB polling as SoT) | **PASS** (certified rule) |
| No consumer republishes same Event ID | **PASS** |
| Async-ready (isolated retry) | **PASS** |
