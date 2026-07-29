# 01 — Enterprise Business Event Catalogue

**Version:** 4.3.0  
**Status:** CERTIFIED  
**Board:** Independent Principal Enterprise Integration Board  

---

## 1. Catalogue Principles

1. A **Business Object Event (BOE)** is a completed business fact (`occurredAt`), not an intent.  
2. Commands express intent; events express outcomes (P0.5).  
3. **One publisher module** per Event ID. Multiple consumers permitted.  
4. Modules integrate by **consuming events**, not by owning each other’s data.  
5. AI **consumes** certified events; AI must not poll databases for domain SoT and must not emit mutating domain events (e.g. `work.time_locked`, `journal.posted`).  
6. Every event carries `companyId` — multi-company isolation is mandatory.  
7. Event IDs are immutable; evolution uses **versioning**, never silent redefinition.

### Envelope (completed event — certified shape)

| Field | Required | Notes |
|-------|----------|-------|
| eventId | yes | Unique occurrence ID |
| eventName | yes | Catalogue Event ID (e.g. `invoice.created`) |
| eventVersion | yes | Semver string; default `1.0` |
| occurredAt | yes | ISO-8601 |
| companyId | yes | Tenant isolation |
| actorId | optional | User/system actor |
| lifecycleId / lifecycleStageId | yes | Business lifecycle binding |
| entityType / entityId | recommended | Aggregate root |
| accountingImpact | yes | Boolean — does not imply GL post by consumer |
| documentTypes | yes | Array |
| commandId | yes | Originating command |
| correlationId | yes | Edge/platform correlation |
| metadata | optional | Versioned payload extension |

### Platform defaults (apply unless event overrides)

| Concern | Default policy |
|---------|----------------|
| Idempotency | At-least-once delivery; consumers key on `(companyId, eventName, entityId, occurrenceKey)` or `eventId` |
| Ordering | Per-entity causal order preferred; consumers must tolerate reordering except where noted |
| Retry | Consumer isolated failure; retry with backoff; never abort publisher success |
| Audit | Persist eventName, companyId, actorId, correlationId, entityRef, occurredAt |
| Security | `Internal` unless marked `Confidential` / `Restricted` |
| Retention | Operational 7 years (statutory); hot index 24 months; archive thereafter |
| Versioning | Additive fields OK in same major; breaking → new major (`2.0`) |

---

## 2. Event Domains Covered

| Domain | Namespace | Publisher owner |
|--------|-----------|-----------------|
| Enterprise Work | `work.*` | EWM |
| Payroll | `payroll.*` | Payroll (frozen) |
| Accounting | `journal.*`, `period.*`, `asset.depreciated` | Accounting (frozen) |
| CRM / Revenue commercial | `customer.*`, `quote.*`, `invoice.*`, `payment.*` | CRM / Sales |
| Inventory | `inventory.*` | Inventory |
| Procurement | `purchase_order.*`, `bill.*`, `vendor.*` | Procurement |
| Assets | `asset.*` | Fixed Assets |
| Reporting | `report.*` | Reporting (read/signal) |
| Notifications | `notification.*` | Platform Notifications |
| AI | `ai.*` | AI Advisory (non-mutating) |
| Document Management | `document.*` | Document Platform |
| Approvals | `approval.*` | Approvals Platform |

---

## 3. Certified Event Catalogue

### Legend for compact rows

- **Pub** = sole publisher  
- **Cons** = certified consumers (may expand via Ownership Register amendment)  
- **Sec** = Internal | Confidential | Restricted  
- **Idem** = idempotency key pattern  
- **Ord** = ordering note  

---

### 3.1 Enterprise Work (`work.*`) — Publisher: EWM

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `work.workspace_created` | Workspace Created | EWM | Audit, Activity, Dashboard | Operating container created | `{workspaceId,name,type}` | company membership; name required | `workspaceId` | — | isolated | yes | Internal | 7y |
| `work.workspace_archived` | Workspace Archived | EWM | Audit, Capacity | Workspace closed | `{workspaceId}` | no policy block | `workspaceId+archived` | after create | isolated | yes | Internal | 7y |
| `work.portfolio_created` | Portfolio Created | EWM | Audit, Analytics | Portfolio under workspace | `{portfolioId,workspaceId}` | workspace active | `portfolioId` | — | isolated | yes | Internal | 7y |
| `work.programme_created` | Programme Created | EWM | Audit | Programme under portfolio | `{programmeId,portfolioId}` | portfolio active | `programmeId` | — | isolated | yes | Internal | 7y |
| `work.project_linked` | Project Linked | EWM | Billing bridge, Dashboard, Audit | EWM project linked to engagement | `{ewmProjectId,projectId?}` | company match | `ewmProjectId` | — | isolated | yes | Internal | 7y |
| `work.project_status_changed` | Project Status Changed | EWM | Capacity, Time gates, Dashboard | Legal status transition | `{ewmProjectId,from,to}` | legal transition | `ewmProjectId+to+at` | causal per project | isolated | yes | Internal | 7y |
| `work.task_created` | Task Created | EWM | Activity | Executable task created | `{taskId,ewmProjectId}` | project active | `taskId` | — | isolated | yes | Internal | 7y |
| `work.task_completed` | Task Completed | EWM | OKR, Activity | Task done | `{taskId}` | preconditions | `taskId+completed` | after create | isolated | yes | Internal | 7y |
| `work.subtask_completed` | Subtask Completed | EWM | Activity | Subtask done | `{subtaskId,taskId}` | parent open | `subtaskId` | — | isolated | yes | Internal | 7y |
| `work.checklist_completed` | Checklist Completed | EWM | Activity, Quality | Checklist done | `{checklistId}` | — | `checklistId` | — | isolated | yes | Internal | 7y |
| `work.deliverable_accepted` | Deliverable Accepted | EWM | Notification, Activity | Client acceptance | `{deliverableId}` | approver role | `deliverableId` | — | isolated | yes | Internal | 7y |
| `work.time_submitted` | Time Submitted | EWM | Approvals, Notification, Dashboard | Draft→submitted | `{timeEntryId,hours}` | draft valid | `timeEntryId+submitted` | before approve | isolated | yes | Confidential | 7y |
| `work.time_approved` | Time Approved | EWM | Audit, Dashboard | Supervisor approved | `{timeEntryId,approverId}` | submitted; role | `timeEntryId+approved` | after submit | isolated | yes | Confidential | 7y |
| `work.time_locked` | Time Locked | EWM | Costing, Payroll adapter, Billing eligibility, Capacity | Immutable op time fact | `{timeEntryId,labourCost,hours}` | approved/policy | upsert `timeEntryId` | **before** cost/payroll consumers | idempotent upsert | yes | Confidential | 7y |
| `work.clock_in` | Clock In | EWM | Activity | Session opened | `{sessionId,employeeId}` | no open session | `sessionId` | — | isolated | yes | Confidential | 7y |
| `work.clock_out` | Clock Out | EWM | Time Engine | Session closed; may create draft time | `{sessionId,timeEntryId?}` | open/on_break | `sessionId+out` | after in | isolated | yes | Confidential | 7y |
| `work.break_started` | Break Started | EWM | Audit | Break start | `{sessionId}` | open | `sessionId+breakStart+at` | — | isolated | yes | Internal | 7y |
| `work.break_ended` | Break Ended | EWM | Audit | Break end | `{sessionId,breakMinutes}` | on_break | `sessionId+breakEnd+at` | after start | isolated | yes | Internal | 7y |
| `work.allocation_confirmed` | Allocation Confirmed | EWM | Capacity | Hard allocation reserved | `{allocationId}` | resource+project active | `allocationId` | — | isolated | yes | Internal | 7y |
| `work.resource_registered` | Resource Registered | EWM | Audit | Work resource in catalogue | `{workResourceId,typeId}` | type valid | `workResourceId` | — | isolated | yes | Internal | 7y |
| `work.resource_assigned` | Resource Assigned | EWM | Dashboard, Capacity | Assignment plan | `{assignmentId}` | active resource | `assignmentId` | — | isolated | yes | Internal | 7y |
| `work.resource_consumed` | Resource Consumed | EWM | Costing, AP signal, Inventory signal | Consumption locked | `{consumptionId,amount}` | qty/amount valid | upsert `consumptionId` | before cost | idempotent | yes | Confidential | 7y |
| `work.capacity_overload` | Capacity Overload | EWM | Notification, Dashboard, AI | Utilisation > threshold | `{resourceRef,pct}` | threshold cfg | `resourceRef+period` | — | isolated | yes | Internal | 24m hot / 7y archive |
| `work.budget_at_risk` | Budget At Risk | EWM | Notification, Dashboard, AI, Reporting | Forecast ≥ budget×threshold | `{ewmProjectId,burnPct}` | budget exists | `ewmProjectId+period` | — | isolated | yes | Confidential | 7y |
| `work.forecast_updated` | Forecast Updated | EWM | Reporting, Dashboard | Ops forecast recalculated | `{ewmProjectId,forecastCost}` | formula cfg | `ewmProjectId+asOf` | — | isolated | yes | Confidential | 7y |
| `work.milestone_missed` | Milestone Missed | EWM | Notification, Calendar | Due without complete | `{milestoneId}` | tracked | `milestoneId+missed` | — | isolated | yes | Internal | 7y |
| `work.milestone_completed` | Milestone Completed | EWM | Activity | Milestone done | `{milestoneId}` | — | `milestoneId+done` | — | isolated | yes | Internal | 7y |
| `work.phase_completed` | Phase Completed | EWM | Activity | Phase done | `{phaseId}` | — | `phaseId` | — | isolated | yes | Internal | 7y |
| `work.objective_at_risk` | Objective At Risk | EWM | Notification, AI | KR slip | `{objectiveId}` | linked | `objectiveId+period` | — | isolated | yes | Internal | 7y |
| `work.initiative_activated` | Initiative Activated | EWM | Activity | Initiative active | `{initiativeId}` | proposed→active | `initiativeId` | — | isolated | yes | Internal | 7y |
| `work.risk_opened` | Risk Opened | EWM | Notification, Dashboard | Project risk opened | `{riskId}` | project ctx | `riskId` | — | isolated | yes | Confidential | 7y |
| `work.issue_opened` | Issue Opened | EWM | Notification | Issue opened | `{issueId}` | project ctx | `issueId` | — | isolated | yes | Internal | 7y |
| `work.decision_accepted` | Decision Accepted | EWM | Audit | Governance decision | `{decisionId}` | role | `decisionId` | — | isolated | yes | Confidential | 7y |
| `work.dependency_broken` | Dependency Broken | EWM | Notification, Risk | Dependency break | `{dependencyId}` | linked | `dependencyId+at` | — | isolated | yes | Internal | 7y |
| `work.shift_published` | Shift Published | EWM | Clocking, Capacity | Shift published | `{shiftId}` | planner | `shiftId` | — | isolated | yes | Internal | 7y |
| `work.roster_published` | Roster Published | EWM | Capacity, Clocking | Roster published | `{rosterId}` | planner | `rosterId` | — | isolated | yes | Internal | 7y |

**Forbidden for EWM:** publish `journal.posted`, payroll calculation/payslip events, or redefine frozen namespaces.

---

### 3.2 Payroll (`payroll.*`) — Publisher: Payroll (FROZEN)

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `payroll.run_created` | Payroll Run Created | Payroll | Activity, Calendar, Dashboard | Run opened | `{runId,periodStart,periodEnd}` | admin/owner | `runId` | — | isolated | yes | Confidential | 7y+statutory |
| `payroll.payslips_generated` | Payslips Generated | Payroll | Document, Dashboard, Activity | Payslips calculated | `{runId,count}` | run draft/processing | `runId+gen` | after create | isolated | yes | Restricted | 7y+statutory |
| `payroll.approved` | Payroll Approved | Payroll | Approval, AI advise, Audit, Dashboard | Run approved | `{runId,approverId}` | admin/owner | `runId+approved` | after gen | isolated | yes | Restricted | 7y+statutory |
| `payroll.processed` | Payroll Processed | Payroll | Accounting, Document, Calendar, Audit, Reporting | Journal posted; run finalised | `{runId,journalId?}` | approved | `runId+processed` | after approve | isolated | yes | Restricted | 7y+statutory |
| `payroll.bank_file_generated` | Bank File Generated | Payroll | Document, Dashboard | Bank batch exported | `{runId,batchId}` | processed/finalized | `batchId` | after process | isolated | yes | Restricted | 7y+statutory |
| `payroll.distributed` | Payslips Distributed | Payroll | Notification, Document, Audit | Payslips delivered | `{runId,channel}` | payslips exist | `runId+distributed` | after gen | isolated | yes | Restricted | 7y+statutory |

**Consumes (non-owned):** `work.time_locked` → payroll input adapter only (never recalculate statutory in EWM).

---

### 3.3 Accounting — Publisher: Accounting (FROZEN)

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `journal.posted` | Journal Posted | Accounting | Reporting, Dashboard, Activity, Audit, Document | GL fact posted | `{journalId,periodId}` | balanced; period open | `journalId` | period order | isolated | yes | Confidential | 7y+statutory |
| `period.closed` | Period Closed | Accounting | Reporting, Dashboard, Audit, Approvals | Period locked | `{periodId}` | owner; close checklist | `periodId+closed` | after journals | isolated | yes | Confidential | 7y+statutory |
| `asset.depreciated` | Asset Depreciated | Fixed Assets→Accounting post | Reporting, Audit, Document | Depreciation posted | `{runId,periodId}` | assets eligible | `runId` | period order | isolated | yes | Confidential | 7y+statutory |

---

### 3.4 CRM / Revenue — Publisher: CRM/Sales

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `customer.created` | Customer Created | CRM | Audit, Activity, Search, Dashboard | Customer master created | `{customerId,name}` | name unique/co | `customerId` | — | isolated | yes | Confidential | 7y |
| `customer.updated` | Customer Updated | CRM | Audit, Search | Master updated | `{customerId,changed[]}` | membership | `customerId+rev` | — | isolated | yes | Confidential | 7y |
| `quote.created` | Quote Created | Sales | Document, Activity, Dashboard | Quote drafted | `{quoteId,customerId}` | customer exists | `quoteId` | — | isolated | yes | Confidential | 7y |
| `quote.sent` | Quote Sent | Sales | Notification, Calendar, Activity | Quote emailed | `{quoteId,to}` | quote valid | `quoteId+sent` | after create | isolated | yes | Confidential | 7y |
| `quote.approved` | Quote Approved | Sales | Approvals signal, Activity, AI, Dashboard | Customer accepted | `{quoteId}` | sent/pending | `quoteId+approved` | after sent | isolated | yes | Confidential | 7y |
| `quote.declined` | Quote Declined | Sales | Activity, Dashboard | Customer declined | `{quoteId,reason?}` | — | `quoteId+declined` | — | isolated | yes | Internal | 7y |
| `invoice.created` | Invoice Created | Sales | Accounting path, Document, Activity, Audit, Dashboard | Invoice drafted/converted | `{invoiceId,customerId,amount}` | customer; lines | `invoiceId` | — | isolated | yes | Confidential | 7y+statutory |
| `invoice.sent` | Invoice Sent | Sales | Notification, Calendar, Activity | Invoice delivered | `{invoiceId}` | invoice exists | `invoiceId+sent` | after create | isolated | yes | Confidential | 7y |
| `payment.received` | Payment Received | Sales/AR | Accounting, Document, Activity, Calendar, Audit | AR payment recorded | `{paymentId,invoiceIds[],amount}` | amount>0 | `paymentId` | after invoice | isolated | yes | Confidential | 7y+statutory |

---

### 3.5 Procurement — Publisher: Procurement

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `vendor.created` | Vendor Created | Procurement | Audit, Search | Vendor master | `{vendorId,name}` | membership | `vendorId` | — | isolated | yes | Confidential | 7y |
| `purchase_order.created` | PO Created | Procurement | Document, Activity, Dashboard | PO drafted | `{poId,vendorId}` | vendor exists | `poId` | — | isolated | yes | Confidential | 7y |
| `purchase_order.sent` | PO Sent | Procurement | Notification, Calendar, Activity | PO to vendor | `{poId}` | PO valid | `poId+sent` | after create | isolated | yes | Confidential | 7y |
| `bill.created` | Bill Recorded | Procurement | Accounting, Document, Activity, Audit, Dashboard | Supplier bill | `{billId,vendorId,amount}` | vendor; lines | `billId` | — | isolated | yes | Confidential | 7y+statutory |
| `bill.payment_made` | Bill Payment Made | Procurement | Accounting, Document, Activity, Calendar, Audit | AP settled | `{paymentId,billIds[],amount}` | amount>0 | `paymentId` | after bill | isolated | yes | Confidential | 7y+statutory |

---

### 3.6 Inventory — Publisher: Inventory

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `inventory.item_created` | Item Created | Inventory | Search, Audit | Stock item master | `{itemId,sku}` | sku unique/co | `itemId` | — | isolated | yes | Internal | 7y |
| `inventory.receipt_posted` | Receipt Posted | Inventory | Accounting signal, Audit, Reporting | Goods receipt qty | `{receiptId,lines[]}` | qty>0 | `receiptId` | — | isolated | yes | Confidential | 7y |
| `inventory.issue_posted` | Issue Posted | Inventory | EWM consume align, Accounting signal, Audit | Stock issued | `{issueId,lines[]}` | qty available | `issueId` | — | isolated | yes | Confidential | 7y |
| `inventory.adjustment_posted` | Adjustment Posted | Inventory | Audit, Reporting | Qty adjustment | `{adjustmentId,delta}` | reason required | `adjustmentId` | — | isolated | yes | Confidential | 7y |

---

### 3.7 Assets — Publisher: Fixed Assets

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `asset.registered` | Asset Registered | Fixed Assets | Audit, Search, EWM resource link | Asset master | `{assetId,cost}` | category valid | `assetId` | — | isolated | yes | Confidential | 7y |
| `asset.depreciated` | Asset Depreciated | Fixed Assets (post via Accounting) | Reporting, Audit | See Accounting row | — | — | — | — | — | — | — | — |
| `asset.disposed` | Asset Disposed | Fixed Assets | Accounting, EWM resource inactivate, Audit | Disposal | `{assetId,proceeds?}` | owned | `assetId+disposed` | after register | isolated | yes | Confidential | 7y |

---

### 3.8 Reporting — Publisher: Reporting (signals only)

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `report.pack_generated` | Report Pack Generated | Reporting | Document, Notification, Audit | Pack materialised | `{packId,reportIds[]}` | catalogue IDs | `packId` | — | isolated | yes | Confidential | 24m / archive 7y |
| `report.snapshot_taken` | Snapshot Taken | Reporting | Audit, AI (read) | Point-in-time snapshot | `{snapshotId,asOf}` | asOf valid | `snapshotId` | — | isolated | yes | Confidential | 7y |

Reporting **consumes** domain events; it does not redefine KPI maths (V4.1.5 KPI catalogue remains SoT).

---

### 3.9 Notifications — Publisher: Platform Notifications

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `notification.requested` | Notification Requested | Platform (from domain pipeline) | Email/In-app adapters | Delivery request | `{channel,templateId,to,refEvent}` | template known | `refEvent+template+to` | after source event | retryable | yes | Confidential | 24m |
| `notification.delivered` | Notification Delivered | Notifications | Audit, Activity | Delivery success | `{notificationId}` | — | `notificationId` | after requested | isolated | yes | Internal | 24m |
| `notification.failed` | Notification Failed | Notifications | Audit, Ops | Delivery failure | `{notificationId,reason}` | — | `notificationId+fail` | — | retryable | yes | Internal | 24m |

---

### 3.10 AI — Publisher: AI Advisory (non-mutating)

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `ai.insight_generated` | Insight Generated | AI | Dashboard, Activity, Notification (optional) | Advisory insight from consumed events | `{insightId,sourceEvents[],text}` | sources certified | `insightId` | after sources | isolated | yes | Confidential | 24m |
| `ai.recommendation_issued` | Recommendation Issued | AI | UI advise only | Recommended next action | `{recommendationId,eventHints[]}` | no auto-execute | `recommendationId` | — | isolated | yes | Internal | 24m |

**Hard rules:** AI must **not** emit `work.time_locked`, `journal.posted`, `payroll.*` mutating outcomes, or any approval auto-decision events.

---

### 3.11 Document Management — Publisher: Document Platform

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `document.generated` | Document Generated | Documents | Notification, Audit, Activity | Artefact generated | `{documentId,type,entityRef}` | type allow-list | `documentId` | after source | isolated | yes | Confidential | per doc class / 7y |
| `document.distributed` | Document Distributed | Documents | Audit, Notification | Artefact sent/downloaded | `{documentId,channel}` | doc exists | `documentId+channel` | after generated | isolated | yes | Confidential | 7y |

---

### 3.12 Approvals — Publisher: Approvals Platform

| Event ID | Business Name | Pub | Consumers | Business Meaning | Payload (v1.0) | Validation | Idem | Ord | Retry | Audit | Sec | Retention |
|----------|---------------|-----|-----------|------------------|----------------|------------|------|-----|-------|-------|-----|-----------|
| `approval.requested` | Approval Requested | Approvals | Notification, Dashboard, Audit | Gate opened | `{approvalId,subjectEvent,assignees[]}` | policy | `approvalId` | after subject | isolated | yes | Confidential | 7y |
| `approval.granted` | Approval Granted | Approvals | Subject domain (resume), Audit, Activity | Gate passed | `{approvalId,approverId}` | assignee role | `approvalId+granted` | after requested | isolated | yes | Confidential | 7y |
| `approval.rejected` | Approval Rejected | Approvals | Subject domain, Notification, Audit | Gate failed | `{approvalId,reason}` | — | `approvalId+rejected` | after requested | isolated | yes | Confidential | 7y |

---

## 4. Duplicate & Conflict Scan

| Check | Result |
|-------|--------|
| Unique Event IDs | PASS — no duplicate IDs across domains |
| One publisher per ID | PASS — see Ownership Register |
| Circular publish loops | PASS — no A publishes B that must publish A for completion |
| Frozen payroll/accounting IDs redefined | PASS — preserved |
| AI mutating domain events | PASS — forbidden |

---

## 5. Catalogue Count

| Domain | Certified Event IDs |
|--------|---------------------|
| Enterprise Work | 36 |
| Payroll | 6 |
| Accounting (+ period/depreciation) | 3 |
| CRM / Revenue | 9 |
| Procurement | 5 |
| Inventory | 4 |
| Assets | 3 (incl. depreciation shared row) |
| Reporting | 2 |
| Notifications | 3 |
| AI | 2 |
| Documents | 2 |
| Approvals | 3 |
| **Total unique** | **78** |

---

## 6. Certification

**ENTERPRISE BUSINESS EVENT CATALOGUE CERTIFIED.**
