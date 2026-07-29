# 06 — Event Trigger Matrix

**Board:** Independent Principal Enterprise Business Rules Board  
**Version:** 4.1.2  
**Date:** 2026-07-13  
**Rule:** Additive `work.*` only. Frozen payroll/accounting event definitions are not redefined.  

---

## 1. Ownership

| Namespace | Owner |
|-----------|--------|
| `work.*` | EWM |
| `payroll.*` / payslip | Payroll (frozen) |
| `invoice.*` / `payment.*` / `journal.*` | Sales/Accounting (frozen) |
| Notification delivery | Platform (consumes EWM) |

---

## 2. Producer → Trigger → Consumers Matrix

| Event | Producer object | Business trigger | Preconditions | Primary consumers | Downstream effects allowed | Forbidden effects |
|-------|-----------------|------------------|---------------|-------------------|----------------------------|-------------------|
| `work.workspace_created` | Workspace | Admin create | Company membership | Audit, activity | Dashboard filter availability | Cross-company create |
| `work.workspace_archived` | Workspace | Admin archive | No conflicting policy block | Audit, capacity | Block new portfolios | Hard-delete children with locked facts |
| `work.portfolio_created` | Portfolio | Admin create | Workspace active | Audit, analytics | Portfolio list | — |
| `work.programme_created` | Programme | Admin create | Portfolio active | Audit | Programme list | — |
| `work.project_linked` | Project | Link Engagement / bind snapshot | Company match | Billing bridge, dashboard, audit | Refresh commercial metadata | EWM becomes Contract SoT |
| `work.project_status_changed` | Project | Status transition | Legal transition | Capacity, time gates, dashboard | Enable/disable time & assignments | Reverse archive silently |
| `work.task_created` | Task | Create | Project active | Activity | Task boards | — |
| `work.task_completed` | Task | Complete | Preconditions met | OKR contribution, activity | Progress signals | Auto revenue recognition |
| `work.subtask_completed` | Subtask | Complete | Parent task open | Activity | — | — |
| `work.checklist_completed` | Checklist | Complete | — | Activity, quality | — | — |
| `work.deliverable_accepted` | Deliverable | Accept | Approver role | Notification, activity | Client acceptance signal | Invoice auto-post |
| `work.time_submitted` | Time Entry | Submit | Draft valid | Approval queue, notification | Queue ageing | Auto-approve by AI |
| `work.time_approved` | Time Entry / Approval | Approve | Submitted; approver eligible | Audit, dashboard | May proceed to lock per policy | Payroll calc |
| `work.time_locked` | Time Entry | Lock | Approved (or policy) | **Costing**, **Payroll adapter**, billing eligibility, capacity actuals | Cost fact; payroll input upsert | GL post; payslip generate |
| `work.clock_in` | Clock Session | Punch in | No other open session | Activity | Open session | Direct payroll |
| `work.clock_out` | Clock Session | Punch out | Open/on_break | Time Engine | May create draft Time Entry | Skip Time Entry SoT |
| `work.break_started` | Clock Session | Break start | Open | Audit | on_break | — |
| `work.break_ended` | Clock Session | Break end | on_break | Audit | open | — |
| `work.allocation_confirmed` | Assignment | Confirm allocation | Resource active; Project active | Capacity | Reserve capacity; possible overload | — |
| `work.resource_registered` | Work Resource | Register | Master link rules | Audit | Catalogue | Duplicate parallel booking object |
| `work.resource_assigned` | Assignment | Assign | Active resource | Dashboard, capacity | Plan load | Payroll for subcontractor |
| `work.resource_consumed` | Consumption | Approve/lock consumption | Valid qty/amount | **Costing**, AP signal, inventory signal | Cost fact | Stock SoT takeover |
| `work.capacity_overload` | Capacity Plan | Threshold breach | Threshold configured | Notification, dashboard, AI advise, alerts | Alert open | Auto-unassign without policy |
| `work.budget_at_risk` | Budget/Forecast | Forecast > budget×threshold | Budget exists | Notification, dashboard, AI advise, alerts | Alert open | GL provision auto-post |
| `work.forecast_updated` | Forecast | Recalc | Formula configured | Reporting, dashboard | Economics refresh | Label as Recognised |
| `work.milestone_missed` | Milestone | Pass due incomplete | Milestone tracked | Notification, calendar, health | Alert | — |
| `work.milestone_completed` | Milestone | Complete | — | Activity, health | — | Auto invoice |
| `work.phase_completed` | Phase | Complete | — | Activity, planning | — | — |
| `work.objective_at_risk` | Objective/KPI | KR slip | Initiative linked | Notification, AI advise | — | Accounting benefits realisation |
| `work.initiative_activated` | Initiative | Activate | Proposed→active | Activity | — | — |
| `work.risk_opened` | Risk | Open | Project context | Notification, dashboard | Risk scoring | Credit risk engine |
| `work.issue_opened` | Issue | Open | Project context | Notification, health | — | — |
| `work.decision_accepted` | Decision | Accept | Governance role | Audit | — | — |
| `work.dependency_broken` | Dependency | Break detect | Linked tasks/milestones | Notification, risk | — | — |
| `work.shift_published` | Shift | Publish | Planner role | Clocking expectations, OT class | Roster alignment | Payroll OT pay amount |
| `work.roster_published` | Roster | Publish | Planner role | Capacity, clocking | Expected windows | — |

---

## 3. Consumed External Events (Non-Owned)

| External event (conceptual) | EWM reaction | Must not |
|-----------------------------|--------------|----------|
| Engagement updated | Refresh Project link metadata | Overwrite commercial SoT |
| Contract variation approved | Refresh contract snapshot | Invent variation without commercial approve |
| Leave posted (HR) | Capacity overlay | Delete locked time |
| Invoice posted (Sales) | Unbilled reduction signal (read) | Reverse op cost |
| Revenue recognised (Accounting) | Display-only refresh | Recompute recognition |
| Payroll period finalized | Optional `payroll_cost_ref` attach | Recalculate payslip |
| Inventory issue posted | Enable/align material consumption | Own stock qty |
| Expense/claim approved | Travel/accommodation cost fact path | Recalculate tax |
| Vendor terms updated | Future rate application only | Rewrite locked consumptions |
| Asset disposed | Inactivate Work Resource | Destroy locked cost history |

---

## 4. Notification / Alert / Escalation Wiring

| Signal event | Notification | Alert record | Escalation eligible |
|--------------|--------------|--------------|---------------------|
| `work.time_submitted` | Approver | Optional queue metric | Yes (SLA) |
| `work.capacity_overload` | PM / resource manager | Yes | Yes |
| `work.budget_at_risk` | PM / finance viewer | Yes | Yes |
| `work.milestone_missed` | PM | Yes | Optional |
| `work.risk_opened` | PM | Optional | Optional |
| `work.objective_at_risk` | Sponsor | Optional | Optional |
| `work.dependency_broken` | PM | Yes | Optional |
| Adapter failure on lock | Admin | Yes | Yes |

---

## 5. Idempotency & Ordering Rules

| Rule | Certification |
|------|---------------|
| Duplicate event IDs for same transition | Forbidden |
| Replayed `work.time_locked` | Idempotent cost fact + payroll fact upsert |
| AI | May recommend; **must not** emit `work.time_locked` |
| Ordering | Lock before cost/payroll consumers process; consumers must tolerate at-least-once |

---

## 6. Forbidden Event Behaviours (Reconfirmed)

- EWM emitting `journal.posted`  
- EWM emitting payroll calculation / payslip events  
- AI auto-emitting `work.time_locked`  
- Redefining frozen `payroll.*` / `invoice.*` / `journal.*` contracts  
- Cross-company event fan-out mutations  

---

## 7. Result

**EVENT TRIGGER MATRIX CERTIFIED.**
