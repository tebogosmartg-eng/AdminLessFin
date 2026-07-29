# 07 — BOE Event Ownership Report

**Version:** 4.1.1  
**Rule:** Additive `work.*` only. Do not alter frozen payroll/accounting event definitions.  

---

## 1. Event Ownership Principle

| Namespace | Owner |
|-----------|-------|
| `work.*` | EWM |
| `payroll.*` / payslip events | Payroll (frozen) |
| `invoice.*` / `payment.*` / `journal.*` | Sales/Accounting (frozen contracts) |
| Platform notification/activity | Platform orchestration consuming EWM events |

EWM may **emit** facts for consumers; EWM must not **redefine** frozen events.

---

## 2. Certified EWM Event Catalogue

| Event | Publisher object | Stage | Downstream effects allowed |
|-------|------------------|-------|----------------------------|
| `work.workspace_created` | Workspace | setup | activity, audit, dashboard |
| `work.workspace_archived` | Workspace | close | activity, audit |
| `work.portfolio_created` | Portfolio | planning | activity, audit |
| `work.programme_created` | Programme | planning | activity, audit |
| `work.project_linked` | Project | planning | activity, dashboard, audit |
| `work.project_status_changed` | Project | execution | activity, dashboard |
| `work.task_created` | Task | execution | activity |
| `work.task_completed` | Task | execution | activity, OKR contribution |
| `work.subtask_completed` | Subtask | execution | activity |
| `work.checklist_completed` | Checklist | quality | activity |
| `work.deliverable_accepted` | Deliverable | quality | activity, notification |
| `work.time_submitted` | Time Entry | time | notification, approval queue |
| `work.time_approved` | Time Entry / Approval | approval | audit, dashboard |
| `work.time_locked` | Time Entry | lock | costing fact, payroll input adapter, billing eligibility |
| `work.clock_in` | Clock Session | capture | activity |
| `work.clock_out` | Clock Session | capture | may create draft Time Entry |
| `work.break_started` | Clock Session | capture | audit |
| `work.break_ended` | Clock Session | capture | audit |
| `work.allocation_confirmed` | Assignment | capacity | capacity snapshots |
| `work.resource_registered` | Work Resource | setup | audit |
| `work.resource_assigned` | Assignment | capacity | dashboard |
| `work.resource_consumed` | Consumption | costing | cost fact |
| `work.capacity_overload` | Capacity Plan | alert | notification, dashboard, AI advise |
| `work.budget_at_risk` | Budget/Forecast | costing | notification, dashboard, AI advise |
| `work.forecast_updated` | Forecast | costing | reporting |
| `work.milestone_missed` | Milestone | delivery | notification, calendar |
| `work.milestone_completed` | Milestone | delivery | activity |
| `work.phase_completed` | Phase | delivery | activity |
| `work.objective_at_risk` | Objective/KPI | okr | notification, AI advise |
| `work.initiative_activated` | Initiative | okr | activity |
| `work.risk_opened` | Risk | governance | notification |
| `work.issue_opened` | Issue | governance | notification |
| `work.decision_accepted` | Decision | governance | audit |
| `work.dependency_broken` | Dependency | governance | notification |
| `work.shift_published` | Shift | planning | roster |
| `work.roster_published` | Roster | planning | capacity |

---

## 3. Consumed (Read) Events — Non-Owned

| External event (conceptual) | EWM reaction |
|-----------------------------|--------------|
| Engagement updated | Refresh Project link metadata |
| Contract variation approved | Refresh contract snapshot |
| Leave posted (HR) | Capacity overlay |
| Invoice posted (Sales) | Unbilled reduction signal (read) |
| Payroll period finalized | Optional attach `payroll_cost_ref` read-only |

---

## 4. Forbidden Event Behaviours

- EWM emitting `journal.posted`  
- EWM emitting payroll calculation events  
- AI auto-emitting `work.time_locked`  
- Duplicate event IDs for the same transition  

---

## 5. Result

**BOE EVENT OWNERSHIP CERTIFIED.**
