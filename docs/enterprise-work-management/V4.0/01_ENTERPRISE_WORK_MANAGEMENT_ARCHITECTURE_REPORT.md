# 01 — Enterprise Work Management Architecture Report

**Module:** Enterprise Work Management (EWM)  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board verdict:** APPROVED  

---

## 1. Purpose

Enterprise Work Management is the **operational execution engine** of AdminLess Fin.

It answers executive questions that timesheets alone cannot:

- What are people working on?
- What projects are profitable?
- Who is overloaded or idle?
- Which clients consume the most resources?
- Which departments miss deadlines?
- Which projects are losing money?
- Which strategic objectives are behind schedule?

**Not in scope:** stopwatch UI, attendance clocks, bare time sheets without context.

---

## 2. Core Principle

> **Time is never tracked by itself. Time always belongs to something.**

```
Company
  → Workspace
    → Portfolio
      → Project
        → Phase
          → Milestone
            → Task
              → Subtask
                → Time Entry
```

Every time entry inherits: company, workspace, portfolio, project, client, department, cost centre, objective linkage (when present), financial period keys, and payroll period keys (reference only).

Forbidden:

```
Employee → Time Entry   ✗
```

Required:

```
Employee → Workspace → … → Task → Time Entry   ✓
```

---

## 3. Domain Architecture

```
Enterprise Work Management
├── Workspaces              # Operating containers (by dept, practice, site, program)
├── Portfolios              # Strategic groupings of projects
├── Projects                # Delivery units (extends/links existing projects)
├── Phases                  # Optional delivery stages
├── Milestones              # Checkpoint outcomes with dates
├── Tasks / Subtasks        # Executable work units
├── Objectives (OKRs)       # Company → Dept → Project → Task contribution
├── Teams                   # Stable org units + ad-hoc delivery teams
├── Time                    # Contextual time entries + workflow
├── Capacity                # Availability vs demand
├── Planning                # Period plans & forecasts
├── Resource Allocation     # Skills, roles, bookings
├── Utilisation             # Derived operational metrics
├── Productivity            # Throughput / velocity (operational)
├── Costing                 # Operational labour/project cost (NOT GL)
├── Billing bridge          # Emit billable facts → Sales/Invoices
├── Analytics               # EWM facts & dashboards
├── Risks                   # Delivery / capacity / budget risks
├── Approvals               # Time & allocation approval engine
├── Audit                   # Immutable history
└── Reports                 # EWM report pack (separate from frozen reporting)
```

---

## 4. Bounded Contexts (Isolation)

| Engine | Owns | Must not own |
|--------|------|--------------|
| Work Hierarchy | Workspace → Task structure | Payroll runs, journals |
| Time Engine | Entries, duration math, status | PAYE/UIF/SDL |
| Capacity Engine | Capacity, leave overlays, forecasts | Leave policy as HR SoT (reads HR) |
| Resource Engine | Skills, roles, allocations | Employee identity numbers |
| Operational Costing | Labour cost rates × hours, burn | Chart of accounts, journal posting |
| OKR Engine | Objectives, key results, progress | Financial statements |
| Analytics | EWM facts & projections | Recalculation of payroll/accounting |
| Workflow / Audit | Draft→Historical immutability | Mutation of locked payroll periods |

---

## 5. Work Hierarchy Data Model (Logical)

### 5.1 Tenancy

Every primary entity: `company_id NOT NULL` (AdminLess Fin multi-company rule).

### 5.2 Entities

| Entity | Key attributes | Inheritance |
|--------|----------------|-------------|
| `ewm_workspaces` | name, type, department_id?, status | Company |
| `ewm_portfolios` | name, owner, strategic_theme | Workspace |
| `ewm_projects` | links `project_id` (existing) OR native EWM project | Portfolio, Client |
| `ewm_phases` | sequence, dates, status | Project |
| `ewm_milestones` | due_date, status; may link existing `project_milestones` | Phase/Project |
| `ewm_tasks` | assignee, estimate, remaining, priority, status | Milestone/Phase |
| `ewm_subtasks` | parent_task_id | Task |
| `ewm_time_entries` | full contextual payload (see §6) | Task (mandatory) |
| `ewm_objectives` | level, parent_id, period | Company/Dept/Project |
| `ewm_key_results` | metric, target, actual | Objective |
| `ewm_teams` | members, lead | Workspace |
| `ewm_allocations` | person, project/task, % or hours, window | Planning |
| `ewm_capacity_snapshots` | period facts | Capacity engine |
| `ewm_cost_facts` | operational cost rollups | Costing engine |
| `ewm_audit_events` | entity, before/after, actor | All mutations |

### 5.3 Context inheritance

On create/update of a time entry against a task, the engine **resolves and denormalizes** (snapshot) context:

`workspace_id`, `portfolio_id`, `project_id`, `phase_id`, `milestone_id`, `client_id`, `department_id`, `cost_centre_id`, `objective_ids[]`, `currency`, `country_code`, `financial_period_id`, `payroll_period_id` (nullable reference).

Snapshots protect historical integrity when hierarchy later changes.

---

## 6. Time Entry Contract

Each `ewm_time_entry` supports:

| Field group | Fields |
|-------------|--------|
| Actor | employee_id, created_by, approved_by |
| Temporal | date, start_at, finish_at, break_minutes, hours (derived) |
| Classification | billable, internal, overtime, tags |
| Hierarchy | project, task, milestone (+ inherited portfolio/workspace) |
| Org | client, department, cost_centre |
| Periods | payroll_period_id (ref), financial_period_id (ref) |
| Control | status, approval, comment, evidence_refs, location? |
| Audit | created_at, updated_at, locked_at, audit trail |

### Smart calculations (Time Engine only)

- Duration from start/finish − breaks  
- Overtime vs daily/weekly capacity rules  
- Daily / weekly / monthly totals  
- Billable vs internal totals  
- Utilisation inputs  
- Labour cost contribution (operational rate × hours)  
- Project remaining budget / remaining capacity (operational)

**No GL math. No PAYE. No statutory constants.**

---

## 7. Workflow (Immutable After Lock)

```
Draft
  → Submitted
    → Manager Approval
      → Locked
        → Payroll (consume fact)     [FROZEN module reads only]
        → Accounting (consume fact)  [FROZEN module reads only]
          → Historical
```

| Status | Mutable? | Rules |
|--------|----------|-------|
| Draft | Yes | Owner edits |
| Submitted | Limited | Recall by owner or reject by manager |
| Approved | No content edits | Metadata only (approver stamp) |
| Locked | No | Period close / payroll handoff gate |
| Historical | No | Archive; corrections via compensating entry only |

**Correction policy:** Never rewrite locked rows. Create `ewm_time_entry_corrections` linked to original, with full audit.

---

## 8. Industry Scalability (Single Model)

Same hierarchy serves all sectors via **Workspace type + Portfolio taxonomy + optional Phase templates**:

| Sector | Workspace pattern | Project pattern |
|--------|-------------------|-----------------|
| Small business | Single workspace | Flat projects + tasks |
| Accounting firm | Practice / client workspace | Engagements, deadlines, billable tasks |
| Engineering | Program portfolios | Phases + milestones + certifications |
| Consulting | Client portfolios | SOW projects, utilisation-heavy |
| NGO | Programme portfolios | Grant-funded projects + objectives |
| Government | Directorate workspaces | Programmes, compliance milestones |
| Construction | Site workspaces | Phases (site), WBS tasks |
| Software | Product portfolios | Epics→tasks (mapped to EWM tasks) |
| Manufacturing | Plant workspaces | Work orders as projects/tasks |

No redesign: configuration and templates, not new schemas per industry.

---

## 9. Placement in AdminLess Fin

```
Presentation:  src/pages/work/, src/components/work/
Domain libs:   src/lib/work/{time,capacity,costing,okr,resource,analytics}/
Edge API:      supabase/functions/work/
BOE:           register work.* events (additive)
Reporting:     src/reporting/reports/work/ (additive)
```

Existing thin **Projects + Timesheets** remain:

1. **Projects** — customer/billable engagement SoT continues; EWM projects link via `project_id`.  
2. **Timesheets** — optional **billing bridge** for invoice creation; EWM does not replace Sales invoicing logic.

---

## 10. AI Readiness (Integration Points Only)

Design hooks; **do not implement AI** in V4.0:

| Hook | Input facts | Future question |
|------|-------------|-----------------|
| `ai.work.daily_focus` | capacity, allocations, deadlines, OKRs | What should Tebogo work on today? |
| `ai.work.overload` | booked vs available capacity | Who is overloaded? |
| `ai.work.deadline_risk` | burn, remaining effort, milestones | Which project will miss deadline? |
| `ai.work.margin_risk` | operational cost vs budget/rate | Where are we losing money? |
| `ai.work.automation` | repetitive task patterns | What can be automated? |

AI is advisory only; never locks time, never posts accounting, never bypasses approvals (same BOE AI principle).

---

## 11. Quality Gates

| Gate | Status |
|------|--------|
| Frozen modules untouched | Designed PASS |
| Hierarchy-enforced time | Designed PASS |
| Isolated engines | Designed PASS |
| Multi-company | Designed PASS |
| Audit + immutable lock | Designed PASS |

---

## 12. Board Decision

**APPROVED** as the enterprise operational control centre architecture for AdminLess Fin V4.0, contingent on implementation respecting freeze boundaries in Report 08.
