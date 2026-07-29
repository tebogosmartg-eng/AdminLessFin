# 01 — Enterprise Domain Model Report

**Board:** Independent Principal Enterprise Domain Architecture Board  
**Version:** 4.1.1  
**Date:** 2026-07-13  
**Verdict contribution:** DOMAIN MODEL CERTIFIED  

---

## 0. Certification Legend

| Field | Meaning |
|-------|---------|
| Business Owner | Module/role accountable for the concept’s truth |
| Lifecycle | Allowed business states |
| State Transitions | Legal moves between states |
| Published BOE Events | Events this object may emit (additive `work.*` or owning-module events) |
| Consumed Events | Events this object may react to (read/orchestration only) |
| AI Readiness | Advisory hooks only — AI never locks, posts GL, or bypasses approval |
| Deletion | Hard delete rules |
| Archiving | Soft-close / historical retention |

**Universal defaults (apply unless overridden):**

- **Multi-company:** Every operational instance is `company_id`-scoped; no cross-company joins for mutation.  
- **Multi-country:** Country/calendar adapters affect capacity & holiday overlays; no statutory calc in EWM.  
- **Future scalability:** Single model via Workspace type + Portfolio taxonomy + Phase templates (SMB → industrial → government).  
- **Audit:** Immutable append-only audit for create/update/approve/lock/archive; locked facts never rewritten.  
- **Permissions (baseline):** `member` draft/submit own time; `admin`/`owner` approve/lock/configure; company membership required.

---

## 1. Board Resolutions on Ambiguous Terms

| Term | Resolution |
|------|------------|
| **Work** | Abstract domain name for EWM execution. **Not** a persisted business entity. |
| **Project** | Primary delivery unit in EWM hierarchy. |
| **Engagement** | Commercial billable engagement SoT in existing Projects/Sales layer; EWM Project **links** to it. |
| **Contract** | Commercial instrument facts (value, award, variations). Master may live in Sales/CRM; EWM holds **operational contract snapshot** on Project. |
| **Programme** | Optional multi-project delivery grouping under Portfolio (peer grouping of Projects). |
| **Initiative** | Strategic container linking Objectives/KPIs to Portfolios/Programmes/Projects. |
| **Job** | **Stereotype of Project** (e.g. work order / site job). Not a separate entity class. |
| **KPI** | Measurable form of Key Result under Objective. |
| **Revenue Recognition** | **Not an EWM-owned entity.** Accounting owns recognition; EWM may display read-only facts. |
| **Work Resource** | **Universal operational resource object** for anything that consumes budget (see Report 03). |

---

## 2. Hierarchy & Delivery Objects

### 2.1 Workspace

| # | Field | Certification |
|---|-------|---------------|
| 1 | Business Definition | Operating container for work within a company (dept, practice, site, plant, programme office). |
| 2 | Business Purpose | Isolate capacity, teams, and portfolios by operating boundary. |
| 3 | Business Owner | EWM Work Hierarchy |
| 4 | Lifecycle | `active` → `archived` |
| 5 | State Transitions | active→archived (admin); archived→active (admin restore) |
| 6 | Ownership Rules | EWM owns structure; HR owns department master if referenced |
| 7 | Relationships | Has many Portfolios, Teams; scoped to Company |
| 8 | Parent Objects | Company |
| 9 | Child Objects | Portfolio, Team (optional), Capacity Plan (scoped) |
| 10 | Permissions | admin/owner create/archive; members read |
| 11 | Invariants | Always company-scoped; cannot contain Projects of another company |
| 12 | Validation Rules | Name required; status in lifecycle set |
| 13 | Published BOE Events | `work.workspace_created`, `work.workspace_archived` |
| 14 | Consumed Events | Company setup complete (platform) |
| 15 | Audit Requirements | Create/update/archive with actor |
| 16 | Reporting Requirements | Workspace rollups of capacity & burn |
| 17 | AI Readiness | `ai.work.daily_focus` may filter by workspace |
| 18 | Integration Consumers | Analytics, Capacity, Reporting |
| 19 | Deletion Rules | Soft-archive only if children exist; hard delete only empty |
| 20 | Archiving Rules | Archive freezes new Portfolios; historical read remains |
| 21–23 | Multi-co / Multi-country / Scale | Universal defaults |

### 2.2 Portfolio

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Strategic grouping of Projects (and optional Programmes) within a Workspace. |
| 2 | Purpose | Executive portfolio health and strategic theme tracking. |
| 3 | Owner | EWM Work Hierarchy |
| 4 | Lifecycle | `active` → `archived` |
| 5 | Transitions | active↔archived (admin) |
| 6 | Ownership | EWM owns grouping; Themes are descriptive |
| 7 | Relationships | Belongs to Workspace; contains Projects/Programmes |
| 8 | Parent | Workspace |
| 9 | Children | Programme (optional), Project, Initiative link |
| 10 | Permissions | admin mutate; members read |
| 11 | Invariants | Portfolio Workspace company = Project company |
| 12 | Validation | Name required; workspace_id required |
| 13 | Events published | `work.portfolio_created`, `work.portfolio_archived` |
| 14 | Consumed | Workspace archived (block new children) |
| 15 | Audit | Full |
| 16 | Reporting | Portfolio health, concentration risk |
| 17 | AI | `ai.work.margin_risk` portfolio filter |
| 18 | Consumers | Analytics, OKR links |
| 19 | Deletion | Archive-first; hard delete if empty |
| 20 | Archiving | Read-only historical |
| 21–23 | Defaults | Yes |

### 2.3 Work

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | The abstract domain of operational execution in AdminLess Fin (EWM). |
| 2 | Purpose | Naming boundary for engines, reports, and BOE `work.*` events. |
| 3 | Owner | EWM (conceptual) |
| 4–5 | Lifecycle / Transitions | **N/A — not an instance entity** |
| 6 | Ownership | Must not be implemented as a table competing with Project |
| 7–9 | Relationships | Encompasses hierarchy Workspace→…→Time Entry |
| 10–12 | Permissions / Invariants / Validation | Forbidden to persist “Work” rows as delivery units |
| 13–14 | Events | Namespace only (`work.*`) |
| 15–20 | Audit / Reporting / Delete / Archive | N/A as entity |
| 21–23 | Scale | Domain scales via configuration, not new “Work” entity |

**Board ruling:** CERTIFIED AS ABSTRACT — implementation must not invent a `Work` table.

### 2.4 Project

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Primary delivery unit against which tasks, time, resources, cost, risk, and operational profitability are managed. |
| 2 | Purpose | Answer: what are we delivering, for whom, at what operational cost and progress. |
| 3 | Owner | EWM Work Hierarchy (operational). Commercial engagement remains Engagement SoT. |
| 4 | Lifecycle | `pipeline` → `active` → `on_hold` → `completed` → `archived` |
| 5 | Transitions | pipeline→active; active↔on_hold; active/on_hold→completed; completed→archived; no reverse from archived without admin restore |
| 6 | Ownership | EWM owns operational project; may **link** to Engagement (`engagement_project_id` conceptually); Contract snapshot attributes allowed |
| 7 | Relationships | Under Portfolio/Programme; has Phases, Milestones, Tasks, Assignments, Budgets, Risks, Costs, Documents |
| 8 | Parent | Portfolio and/or Programme; Company |
| 9 | Children | Phase, Milestone, Task, Assignment, Budget, Forecast, Risk, Issue, Decision, Dependency, Deliverable, Document, Photo Evidence |
| 10 | Permissions | members read/contribute time; admin configure; owner archive |
| 11 | Invariants | Time Entries must resolve to a Project; company isolation; Job is stereotype of Project not child entity |
| 12 | Validation | Name required; status in set; dates coherent (start ≤ expected completion) |
| 13 | Published | `work.project_linked`, `work.project_status_changed`, `work.budget_at_risk`, `work.milestone_missed` |
| 14 | Consumed | Engagement updated (refresh link); Objective linked |
| 15 | Audit | Status, contract snapshot, budget, PM changes |
| 16 | Reporting | Command centre, economics strip, portfolio health |
| 17 | AI | deadline/margin risk hooks |
| 18 | Consumers | Billing bridge, Analytics, Payroll adapter (via time), Accounting (read cost facts) |
| 19 | Deletion | Forbidden if locked cost/time facts exist; archive instead |
| 20 | Archiving | Historical; corrections via compensating facts only |
| 21–23 | Defaults + industry stereotypes (Job/Work Order) via type/template |

### 2.5 Contract

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Commercial agreement facts: awarded value, award date, variations, commercial status. |
| 2 | Purpose | Anchor Contract Value and Approved Variations for operational economics. |
| 3 | Owner | **Sales/CRM commercial SoT** when a Contract master exists; otherwise **Engagement** holds commercial value. EWM stores **operational snapshot** on Project for intelligence only. |
| 4 | Lifecycle | `draft` → `awarded` → `active` → `varied` → `completed` → `closed` |
| 5 | Transitions | Per commercial workflow (Sales-owned); EWM snapshot refresh on award/variation approve |
| 6 | Ownership | EWM must not become Contract SoT; no GL recognition from Contract in EWM |
| 7 | Relationships | 1 Contract ↔ 1..n Projects/Engagements (commercial model dependent) |
| 8 | Parent | Customer / Company (Sales) |
| 9 | Children | Approved Variations (commercial); operational snapshot on Project |
| 10 | Permissions | Sales commercial roles mutate master; EWM admin refresh snapshot |
| 11 | Invariants | Contract Value for ops ≥ sum of approved baselines; variations approved before snapshot increase |
| 12 | Validation | Currency ≥ 0; dates valid |
| 13 | Published | Sales `contract.*` (if exists); EWM `work.project_linked` on snapshot bind |
| 14 | Consumed | Variation approved (Sales) |
| 15 | Audit | Commercial module audits master; EWM audits snapshot changes |
| 16 | Reporting | Economics: Contract Value, Approved Variations |
| 17 | AI | margin risk uses snapshot value |
| 18 | Consumers | EWM profitability composition (read) |
| 19–20 | Delete/Archive | Commercial rules; EWM never hard-deletes snapshot history without archive |
| 21–23 | Defaults | Multi-currency via company currency adapters |

### 2.6 Engagement

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Customer-facing billable engagement in the existing Projects/Sales layer (legacy `projects`). |
| 2 | Purpose | Billing, customer link, billable rates, invoice bridge SoT. |
| 3 | Owner | **Projects / Sales engagement layer** (not EWM hierarchy) |
| 4 | Lifecycle | `active` → `completed` → `archived` (as today commercially) |
| 5 | Transitions | Engagement module owns |
| 6 | Ownership | Engagement owns billable customer relationship; EWM Project **links**, does not replace |
| 7 | Relationships | Customer; Timesheets; Invoices; optional EWM Project link |
| 8 | Parent | Company, Customer |
| 9 | Children | Milestones (legacy), Timesheets |
| 10 | Permissions | Existing Projects permissions |
| 11 | Invariants | Billing bridge targets Engagement, not EWM-only projects without link |
| 12 | Validation | Existing engagement rules |
| 13 | Published | Existing sales/project events; EWM does not redefine |
| 14 | Consumed | Locked billable EWM time → timesheet projection |
| 15–16 | Audit/Reporting | Engagement + Project profitability (GL) remain valid |
| 17 | AI | N/A in EWM |
| 18 | Consumers | Invoices, GL project tagging, EWM link |
| 19–20 | Delete/Archive | Engagement rules; break EWM link carefully |
| 21–23 | Defaults | Yes |

### 2.7 Programme

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Optional multi-project delivery grouping under a Portfolio. |
| 2 | Purpose | Coordinate related Projects without replacing Portfolio strategy grouping. |
| 3 | Owner | EWM Work Hierarchy |
| 4 | Lifecycle | `active` → `completed` → `archived` |
| 5 | Transitions | active→completed→archived |
| 6 | Ownership | EWM; cannot own Accounting programme codes |
| 7 | Relationships | Portfolio parent; Projects children |
| 8 | Parent | Portfolio |
| 9 | Children | Project |
| 10 | Permissions | admin mutate |
| 11 | Invariants | Optional; Projects may attach directly to Portfolio when Programme unused |
| 12 | Validation | Name required |
| 13 | Published | `work.programme_created` |
| 14 | Consumed | Portfolio archived |
| 15–20 | Audit/Reporting/Delete/Archive | Same pattern as Portfolio |
| 21–23 | Defaults | Yes — government/industrial scale |

### 2.8 Initiative

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Strategic intent container linking Objectives/KPIs to Portfolios, Programmes, or Projects. |
| 2 | Purpose | Connect “why” (OKR) to “what” (delivery). |
| 3 | Owner | EWM OKR Engine |
| 4 | Lifecycle | `proposed` → `active` → `completed` → `abandoned` |
| 5 | Transitions | proposed→active; active→completed|abandoned |
| 6 | Ownership | Does not own financial benefits realisation (Accounting) |
| 7 | Relationships | Objectives, Portfolios/Projects |
| 8 | Parent | Company / Workspace |
| 9 | Children | Objective links |
| 10 | Permissions | admin/owner |
| 11 | Invariants | Progress derived from linked Objectives — not recalculated in Analytics |
| 12 | Validation | Period required |
| 13 | Published | `work.initiative_activated`, `work.objective_at_risk` (via OKR) |
| 14 | Consumed | Objective progress updates |
| 15–20 | Standard |
| 21–23 | Defaults | Yes |

### 2.9 Job

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Industry stereotype of **Project** (work order, site job, service job). |
| 2 | Purpose | Same as Project with template defaults (phases, cost categories). |
| 3 | Owner | EWM — as Project configuration, **not** a separate class |
| 4–23 | Ruling | **CERTIFIED AS PROJECT STEREOTYPE.** Implementation must not create a parallel Job entity with duplicate lifecycle/time/cost. |

### 2.10 Phase

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Ordered delivery stage within a Project. |
| 2 | Purpose | Structure schedule and WBS without forcing industry-specific schemas. |
| 3 | Owner | EWM Work Hierarchy |
| 4 | Lifecycle | `pending` → `in_progress` → `completed` → `cancelled` |
| 5 | Transitions | pending→in_progress→completed; any→cancelled (admin) |
| 6 | Ownership | EWM |
| 7 | Relationships | Project parent; Milestones/Tasks children |
| 8 | Parent | Project |
| 9 | Children | Milestone, Task |
| 10 | Permissions | admin/member update status |
| 11 | Invariants | Sequence unique per Project; optional (flat Project allowed) |
| 12 | Validation | sequence_no ≥ 1 |
| 13 | Published | `work.phase_completed` |
| 14 | Consumed | Project status on_hold (pause) |
| 15–20 | Standard archive with Project |
| 21–23 | Defaults | Template-driven by industry |

### 2.11 Milestone

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Date-bound delivery checkpoint / outcome. |
| 2 | Purpose | Schedule risk and completion signalling. |
| 3 | Owner | EWM; may link legacy engagement milestone |
| 4 | Lifecycle | `pending` → `in_progress` → `completed` / `missed` |
| 5 | Transitions | pending→in_progress→completed; due passed without complete → missed |
| 6 | Ownership | EWM operational dates; commercial milestone amounts remain Engagement if billed that way |
| 7 | Relationships | Project/Phase; Tasks |
| 8 | Parent | Phase or Project |
| 9 | Children | Task (optional), Deliverable |
| 10 | Permissions | admin update; members read |
| 11 | Invariants | Missed does not auto-post revenue |
| 12 | Validation | due_date required for risk scoring |
| 13 | Published | `work.milestone_missed`, `work.milestone_completed` |
| 14 | Consumed | Task completion (optional auto-progress) |
| 15–20 | Standard |
| 21–23 | Defaults | Yes |

### 2.12 Task

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Executable work unit; preferred binding target for Time Entries. |
| 2 | Purpose | Make time contextual: who does what, estimate vs remaining. |
| 3 | Owner | EWM Work Hierarchy / Time Engine consumers |
| 4 | Lifecycle | `todo` → `in_progress` → `blocked` → `done` / `cancelled` |
| 5 | Transitions | todo→in_progress↔blocked→done; any→cancelled |
| 6 | Ownership | EWM; assignee references HR Employee (read-only identity) |
| 7 | Relationships | Project/Phase/Milestone; Subtasks; Assignments; Time Entries |
| 8 | Parent | Milestone/Phase/Project |
| 9 | Children | Subtask, Checklist, Time Entry |
| 10 | Permissions | assignee + admin |
| 11 | Invariants | **Time Entry should bind to Task when Task exists**; estimate/remaining ≥ 0 |
| 12 | Validation | Name required; priority in set |
| 13 | Published | `work.task_created`, `work.task_completed` |
| 14 | Consumed | Assignment confirmed |
| 15–20 | Standard; delete blocked if locked time exists |
| 21–23 | Defaults | Yes |

### 2.13 Subtask

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Child executable unit of a Task. |
| 2 | Purpose | Decompose work without new entity class proliferation. |
| 3 | Owner | EWM |
| 4 | Lifecycle | Same as Task |
| 5 | Transitions | Same as Task |
| 6 | Ownership | Parent Task owns hierarchy |
| 7 | Relationships | Parent Task; optional Time Entry |
| 8 | Parent | Task |
| 9 | Children | Checklist item (optional) |
| 10–12 | Permissions/Invariants/Validation | Depth limited (board: max practical nesting = Task→Subtask; no infinite tree required) |
| 13–14 | Events | Covered by task events or `work.subtask_completed` |
| 15–23 | Standard |

### 2.14 Checklist

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Ordered verification items on Task/Deliverable (pass/fail/na). |
| 2 | Purpose | Quality/completion evidence without separate QA product. |
| 3 | Owner | EWM |
| 4 | Lifecycle | `open` → `in_progress` → `complete` |
| 5 | Transitions | Item `pending`→`done`/`na` |
| 6 | Ownership | Does not own statutory compliance checklists |
| 7–9 | Rel/Parent/Child | Task or Deliverable |
| 10–12 | Standard |
| 13 | Published | `work.checklist_completed` |
| 14 | Consumed | Task done gate (optional policy) |
| 15–23 | Standard |

### 2.15 Deliverable

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Tangible or intangible output expected from Project/Milestone/Task. |
| 2 | Purpose | Track acceptance of outputs separate from effort. |
| 3 | Owner | EWM |
| 4 | Lifecycle | `planned` → `in_production` → `submitted` → `accepted` / `rejected` |
| 5 | Transitions | submitted→accepted|rejected; rejected→in_production |
| 6 | Ownership | Acceptance is operational; customer contract acceptance may mirror Sales |
| 7–9 | Milestone/Project parent; Documents/Photos children |
| 10–12 | Standard |
| 13 | Published | `work.deliverable_accepted` |
| 14 | Consumed | Document uploaded |
| 15–23 | Standard |

---

## 3. Objectives & Measurement

### 3.1 Objective

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Qualitative goal at Company/Dept/Project level (OKR Objective). |
| 2 | Purpose | Strategic alignment of work. |
| 3 | Owner | EWM OKR Engine |
| 4 | Lifecycle | `draft` → `active` → `closed` |
| 5 | Transitions | draft→active→closed |
| 6 | Ownership | Progress from Key Results/KPIs only — Analytics must not redefine scores |
| 7–9 | Parent Initiative/Company; children KPI/Key Result; links to Projects/Tasks |
| 10–12 | Standard |
| 13 | Published | `work.objective_at_risk` |
| 14 | Consumed | KPI actual updates; Task contributions |
| 15–23 | Standard; multi-country periods via calendars |

### 3.2 KPI

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Quantified Key Result metric (target, actual, unit). |
| 2 | Purpose | Measure Objective progress. |
| 3 | Owner | EWM OKR Engine |
| 4 | Lifecycle | `active` → `achieved` / `missed` / `retired` |
| 5 | Transitions | Based on actual vs target at period end |
| 6 | Ownership | EWM owns operational KPI; financial KPIs remain Reporting/Accounting |
| 7–9 | Parent Objective |
| 10–12 | actual/target numeric; unit required |
| 13 | Published | Covered by objective events |
| 14 | Consumed | Contribution posts from Tasks (optional) |
| 15–23 | Standard |

---

## 4. Resource Domain (summary — full matrix in Report 03)

### 4.1 Resource (Work Resource)

**CERTIFIED as the universal operational resource instance.**  
Represents any budget-consuming actor/asset/service assigned or consumed on work.  
Master identity remains in HR/Assets/Vendors/Inventory; Work Resource is the **operational projection**.

### 4.2 Resource Type

**CERTIFIED as the catalogue of resource classes** defining cost behaviour, approval, integration target, billing behaviour, payroll eligibility.

### 4.3–4.15 People & Non-People Classes

Permanent Employee, Temporary Employee, Casual Labour, Contract Employee, Subcontractor, Consultant, Equipment, Vehicle, Material, Plant, Tool, Accommodation, Travel, Fuel — **CERTIFIED as Resource Types / Work Resource specialisations** (not parallel unrelated entities). Full consumer matrix in Report 03.

---

## 5. Time, Clocking & Capacity

### 5.1 Time Entry

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Contextual record of effort against Task/Project with duration and classification. |
| 2 | Purpose | Single operational effort fact feeding cost, utilisation, billing bridge, payroll input. |
| 3 | Owner | EWM Time Engine |
| 4 | Lifecycle | `draft` → `submitted` → `approved` → `locked` → `historical` |
| 5 | Transitions | draft→submitted→approved→locked→historical; submitted→draft (recall/reject); **no content edit after approved**; corrections = compensating entries |
| 6 | Ownership | Duration math owned by Time Engine only; Payroll/Accounting consume locked facts |
| 7 | Relationships | Task/Project; Employee/Work Resource; Clock Session (optional source); Cost Fact; Payroll Input Fact; Timesheet projection |
| 8 | Parent | Task (preferred) / Project (allowed when flat) |
| 9 | Children | Corrections, evidence refs |
| 10 | Permissions | Owner edits draft; manager approves; admin locks |
| 11 | Invariants | Hours ≥ 0; locked immutable; subcontractor resources never create payroll-ready facts |
| 12 | Validation | Date required; hours or start/finish; break ≤ duration |
| 13 | Published | `work.time_submitted`, `work.time_approved`, `work.time_locked` |
| 14 | Consumed | Clock Session closed; Shift rules (classification only) |
| 15 | Audit | Every transition |
| 16 | Reporting | Utilisation, burn, unbilled, payroll due |
| 17 | AI | Advisory overload/focus only |
| 18 | Consumers | Costing, Billing bridge, Payroll adapter, Analytics |
| 19 | Deletion | Only draft; else compensating correction |
| 20 | Archiving | historical after period close |
| 21–23 | Defaults | Yes |

### 5.2 Clock Session

See Report 04 (full certification). **Summary:** capture channel producing candidate duration for Time Entry; not the approved fact.

### 5.3 Shift

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Planned working window pattern (start/end, break allowances, OT thresholds). |
| 2 | Purpose | Classify overtime/expected hours; **not** payroll calculation. |
| 3 | Owner | EWM Capacity / Time Capture configuration |
| 4 | Lifecycle | `draft` → `published` → `retired` |
| 5 | Transitions | draft→published→retired |
| 6 | Ownership | EWM owns operational shift templates; labour law payroll OT calc remains Payroll |
| 7–9 | Used by Roster, Clock Session (optional), Time Entry OT flag |
| 10–12 | Standard |
| 13 | Published | `work.shift_published` |
| 14 | Consumed | Holiday Calendar |
| 15–23 | Standard |

### 5.4 Roster

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Assignment of people/resources to Shifts over dates. |
| 2 | Purpose | Planned supply for Capacity Plan. |
| 3 | Owner | EWM Capacity Engine |
| 4 | Lifecycle | `draft` → `published` → `closed` |
| 5 | Transitions | draft→published→closed |
| 6 | Ownership | Planning only; actuals from Time Entry |
| 7–9 | Shift, Work Resource/Employee, Workspace |
| 10–23 | Standard; published `work.roster_published` |

### 5.5 Capacity Plan

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Period plan of available vs demanded capacity. |
| 2 | Purpose | Utilisation, overload, idle intelligence. |
| 3 | Owner | EWM Capacity Engine |
| 4 | Lifecycle | `draft` → `confirmed` → `closed` |
| 5 | Transitions | draft→confirmed→closed |
| 6 | Ownership | Reads HR leave; does not own leave policy |
| 7–9 | Snapshots, Assignments, Roster |
| 10–23 | Standard; `work.capacity_overload` |

### 5.6 Assignment

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Booking of a Work Resource/Employee to Project/Task for a window (hard/soft/role-based). |
| 2 | Purpose | Demand–supply matching. |
| 3 | Owner | EWM Resource Engine |
| 4 | Lifecycle | `proposed` → `confirmed` → `active` → `completed` / `cancelled` |
| 5 | Transitions | proposed→confirmed→active→completed; any→cancelled |
| 6 | Ownership | Does not mutate HR employment |
| 7–9 | Project/Task; Work Resource |
| 10–23 | `work.allocation_confirmed`; hard counts as booked capacity |

### 5.7 Approval

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Decision record that advances a controlled object (Time Entry, Assignment, Consumption, Deliverable). |
| 2 | Purpose | Single approval pattern — **no duplicate approval engines**. |
| 3 | Owner | EWM Workflow (pattern); specific object remains SoT for content |
| 4 | Lifecycle | `pending` → `approved` / `rejected` |
| 5 | Transitions | pending→approved|rejected |
| 6 | Ownership | One approval chain per object type policy; Payroll approvals remain Payroll’s |
| 7–9 | Subject object + approver |
| 10–23 | Audit mandatory; events piggyback subject (`work.time_approved`, etc.) |

---

## 6. Governance Objects (Risk, Issue, Decision, Dependency)

| Object | Definition | Owner | Lifecycle | Key invariant |
|--------|------------|-------|-----------|---------------|
| **Risk** | Uncertain event affecting schedule/cost/quality | EWM | `open`→`mitigating`→`closed`/`realised` | Risk scores operational — not accounting impairment |
| **Issue** | Realised problem requiring action | EWM | `open`→`in_progress`→`resolved`→`closed` | Distinct from Risk |
| **Decision** | Recorded choice with owner & date | EWM | `proposed`→`accepted`→`superseded` | Immutable text after accepted (amend via supersede) |
| **Dependency** | Finish-to-start (etc.) link between Tasks/Milestones/Projects | EWM | `active`→`satisfied`/`broken` | Must not create circular critical path without flag |

Each publishes `work.risk_*`, `work.issue_*`, `work.decision_*`, `work.dependency_*` as needed; audit full; company-scoped; archive with Project.

---

## 7. Costing & Commercial Intelligence Objects

### 7.1 Budget

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Operational budget envelope by Project and Cost Category. |
| 2 | Purpose | Burn and at-risk signals. |
| 3 | Owner | EWM Operational Costing |
| 4 | Lifecycle | `draft` → `baseline` → `revised` → `closed` |
| 5 | Transitions | draft→baseline→revised→closed |
| 6 | Ownership | Operational only — not GL budget module replacement (platform Budgets may exist separately) |
| 7–9 | Project; Cost Categories |
| 10–23 | `work.budget_at_risk`; never posts GL |

### 7.2 Forecast

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Projection of cost/revenue/margin at completion from operational inputs. |
| 2 | Purpose | Executive early warning. |
| 3 | Owner | EWM Operational Costing / Analytics composition |
| 4 | Lifecycle | `current` (versioned snapshots) |
| 5 | Transitions | New snapshot supersedes prior for reporting |
| 6 | Ownership | Forecast Margin is operational intelligence; **Accounting owns recognised profit** |
| 7–23 | Derived from burn + remaining effort × rates; no duplicate calc in UI |

### 7.3 Cost Category

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Classification of operational cost (labour, temp labour, subcontractor, material, equipment, vehicle, travel, accommodation, fuel, plant, tools, other). |
| 2 | Purpose | Uniform rollups and Command Centre breakdown. |
| 3 | Owner | EWM Operational Costing |
| 4–5 | Catalogue (versioned); not free-text chaos |
| 6 | Ownership | Maps from Resource Type; does not redefine COA |
| 7–23 | Used by Budget, Operational Cost, Reporting |

### 7.4 Operational Cost

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Immutable operational cost fact from locked time or approved resource consumption. |
| 2 | Purpose | Operational burn SoT inside EWM. |
| 3 | Owner | EWM Operational Costing |
| 4 | Lifecycle | `created` (locked) → `historical`; corrections via compensating facts |
| 5 | Transitions | No in-place amount edit |
| 6 | Ownership | **Accounting consumes facts; EWM never posts journals** |
| 7–23 | One fact per locked source; Analytics reads rollups only |

### 7.5 Revenue Recognition

| # | Field | Certification |
|---|-------|---------------|
| 1 | Definition | Accounting process of recognising revenue into GL. |
| 2 | Purpose | Financial statements truth. |
| 3 | Owner | **Accounting (FROZEN)** |
| 4–23 | **CERTIFIED AS NON-EWM ENTITY.** EWM may **display** Accounting-recognised revenue by engagement/project tag. EWM must not compute or post recognition. |

---

## 8. Calendars, Evidence & Collaboration

| Object | Owner | Definition gist | EWM role |
|--------|-------|-----------------|----------|
| **Work Calendar** | EWM Capacity | Working days/hours pattern for company/workspace | Capacity overlays |
| **Holiday Calendar** | EWM Capacity (or HR read) | Non-working days by country/region | Capacity reduction; not payroll holiday pay |
| **Document** | **DMS / platform storage** | File evidence linked to Project/Task/Deliverable | EWM stores references only |
| **Photo Evidence** | DMS + Time Capture | Image proof for clock/deliverable | Optional evidence on Clock/Time/Deliverable |
| **Activity** | Platform Activity / BOE | Human-readable feed of work events | EWM publishes; platform stores feed |
| **Notification** | Platform Notification | User alerts | EWM requests via orchestration; does not own delivery engine |

---

## 9. Quality Gate Summary

| Gate | Result |
|------|--------|
| Business definition exists for all listed objects | PASS |
| Ownership defined (incl. non-EWM owners) | PASS |
| Lifecycle defined | PASS |
| Relationships defined | PASS |
| Invariants defined | PASS |
| Events defined | PASS |
| Audit requirements defined | PASS |
| Consumers defined | PASS |
| Future scalability proven (single hierarchy + stereotypes) | PASS |

**Domain objects are CERTIFIED for implementation design.** Physical schema remains unapproved until Implementation Approval.
