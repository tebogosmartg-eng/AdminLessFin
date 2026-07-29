# 01 — Enterprise Business Rules Report

**Board:** Independent Principal Enterprise Business Rules Board  
**Version:** 4.1.2  
**Date:** 2026-07-13  
**Verdict contribution:** BUSINESS RULES CERTIFIED  

---

## 0. Rule Schema (Mandatory Fields)

Every certified rule family below is defined using:

| Field | Meaning |
|-------|---------|
| Business Purpose | Why the rule exists |
| Owner | Sole accountable module/role |
| Trigger | What starts processing |
| Preconditions | What must be true before processing |
| Processing Rules | Deterministic behaviour |
| Validation Rules | Reject / warn conditions |
| Approval Requirements | Who must approve, when |
| Exceptions | Allowed deviations |
| Failure Behaviour | What happens on error |
| Published Events | `work.*` (or owned-module) events emitted |
| Consumed Events | Events read/reacted to |
| Audit Requirements | What must be logged |
| Reporting Impact | Dashboards / reports affected |
| AI Readiness | Advisory hooks only — AI never locks, posts GL, or bypasses approval |
| Integration Consumers | Downstream modules |

**Universal defaults (all rules):**

- **Multi-company:** Mutations are `company_id`-scoped; no cross-company mutation joins.  
- **Multi-country:** Calendars/timezones/holiday overlays may adapt capacity and time classification; EWM never calculates statutory tax.  
- **Industry agnostic:** Behaviour is catalogue- and stereotype-driven (Job = Project stereotype); no per-industry rule forks.  
- **Locked facts immutable:** Corrections are compensating entries only.  
- **AI:** Advise only; never auto-approve, auto-lock, or auto-post.

---

## 1. Work Lifecycle Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Govern abstract EWM execution as a domain namespace — not a persisted delivery unit. |
| **Owner** | EWM (conceptual); Project owns concrete delivery state |
| **Trigger** | Any operational action under `work.*` namespace |
| **Preconditions** | Company membership; Workspace exists for hierarchy-scoped actions |
| **Processing Rules** | “Work” is never instantiated as a row competing with Project. All execution facts attach to Project → Task → Time Entry (or typed Consumption). |
| **Validation Rules** | Reject any design that persists a `Work` entity as SoT for time/cost |
| **Approval Requirements** | N/A as entity; subordinate objects own approvals |
| **Exceptions** | None — abstract naming only |
| **Failure Behaviour** | Implementation proposing a Work table is non-conforming |
| **Published Events** | Namespace only (`work.*`) |
| **Consumed Events** | N/A |
| **Audit Requirements** | N/A as entity |
| **Reporting Impact** | Report packs labelled under Enterprise Work |
| **AI Readiness** | AI scopes by Workspace/Project filters, not a Work id |
| **Integration Consumers** | All EWM engines |

**Ruling:** CERTIFIED — Work remains abstract (V4.1.1 §2.3).

---

## 2. Project Lifecycle Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Control when a Project may accept assignments, time, consumptions, and budget burn. |
| **Owner** | EWM Work Hierarchy |
| **Trigger** | Status change command; child create/submit/lock attempts |
| **Preconditions** | Company-scoped; Portfolio/Programme company match; name present |
| **Processing Rules** | Lifecycle: `pipeline` → `active` → `on_hold` → `completed` → `archived`. Time submit/lock and new Assignments allowed only when status ∈ {`active`} (and company policy may allow `on_hold` read-only). Job stereotype uses identical lifecycle. |
| **Validation Rules** | start ≤ expected completion; cannot complete with open Clock Sessions on Project; archive forbidden if open approvals pending (company policy) |
| **Approval Requirements** | Admin/owner for status transitions past `active`; member cannot archive |
| **Exceptions** | Admin restore: archived → active (audited); Job template defaults do not alter lifecycle set |
| **Failure Behaviour** | Illegal transition → reject; no partial status write |
| **Published Events** | `work.project_linked`, `work.project_status_changed`, `work.budget_at_risk`, `work.milestone_missed` |
| **Consumed Events** | Engagement updated (refresh link); commercial variation approved (snapshot) |
| **Audit Requirements** | Actor, from/to status, timestamp, reason |
| **Reporting Impact** | Command Centre filters; portfolio health; capacity load |
| **AI Readiness** | `ai.work.deadline_risk`, `ai.work.margin_risk` — advisory |
| **Integration Consumers** | Time Engine, Costing, Capacity, Billing bridge (via Engagement link) |

---

## 3. Engagement Lifecycle Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Keep commercial billable engagement as SoT for customer billing without EWM replacing it. |
| **Owner** | Projects / Sales engagement layer |
| **Trigger** | Engagement create/update/complete; EWM Project link bind/unbind |
| **Preconditions** | Customer exists; company membership |
| **Processing Rules** | Engagement owns customer/billable relationship. EWM Project **links** optionally. Billing bridge targets Engagement. Locked billable EWM time may project to timesheet facts for Engagement — EWM does not own invoice posting. |
| **Validation Rules** | Billing against EWM-only Project without Engagement link rejected for invoice generation |
| **Approval Requirements** | Engagement module approvals; EWM does not approve commercial engagement |
| **Exceptions** | Internal/non-billable Projects may operate without Engagement link |
| **Failure Behaviour** | Link refresh failure → retain last known link metadata; flag stale |
| **Published Events** | Existing sales/project events (not redefined by EWM) |
| **Consumed Events** | `work.time_locked` (billable projection eligibility) |
| **Audit Requirements** | Link bind/unbind audited in EWM; commercial changes in Engagement |
| **Reporting Impact** | Unbilled vs operational burn side-by-side; never merge Recognised Revenue |
| **AI Readiness** | Advisory unbilled concentration only |
| **Integration Consumers** | Invoices, GL project tagging, EWM Project |

---

## 4. Contract Snapshot Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Provide operational economics with Contract Value and Approved Variations without EWM becoming Contract SoT. |
| **Owner** | Commercial master: Sales/CRM or Engagement; Snapshot: EWM on Project |
| **Trigger** | Contract award; variation approved commercially; admin snapshot refresh |
| **Preconditions** | Commercial approval completed for value increase; Project exists |
| **Processing Rules** | Snapshot stores awarded value, variation total, commercial status, as-of timestamp. Snapshot increases **only** after commercial approve. EWM never posts recognition journals from snapshot. |
| **Validation Rules** | Values ≥ 0; snapshot variation ≤ commercially approved sum |
| **Approval Requirements** | Commercial module owns value approval; EWM admin may refresh but not invent values |
| **Exceptions** | Manual snapshot for companies without Contract master — still requires admin attestation audit |
| **Failure Behaviour** | Stale snapshot flagged; forecasts use last certified snapshot + warning |
| **Published Events** | `work.project_linked` on bind; Sales `contract.*` unchanged |
| **Consumed Events** | Contract variation approved (Sales) |
| **Audit Requirements** | Before/after snapshot values, actor, commercial reference id |
| **Reporting Impact** | Economics strip: Contract Value, Variations, Forecast Margin |
| **AI Readiness** | Margin risk uses snapshot; must label “operational/forecast” |
| **Integration Consumers** | Profitability composition, Forecast, Executive Dashboard |

---

## 5. Clock Session Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Capture presence/effort intervals that feed the Time Engine — not approved facts. |
| **Owner** | EWM Time Capture (channel); Time Engine owns resulting Time Entry |
| **Trigger** | clock_in / break_start / break_end / clock_out / cancel |
| **Preconditions** | Person-type Work Resource active; ≤1 open/on_break session per employee per company; Project/Task binding per company policy before close |
| **Processing Rules** | Lifecycle `open` ↔ `on_break` → `closed`/`cancelled`. Breaks deduct minutes. Midnight span allowed. Closed session yields ≤1 primary draft Time Entry. Offline punches sync as draft; conflicts → compensating Time Entry — never overwrite locked facts. |
| **Validation Rules** | No clock_out without open/on_break; inactive resource cannot clock_in; GPS/QR/photo optional evidence only |
| **Approval Requirements** | None on session itself; Time Entry follows Approval Rules |
| **Exceptions** | Supervisor may cancel open session; cannot delete closed sessions |
| **Failure Behaviour** | Reject illegal punch; offline queue retries; sync conflict creates exception queue |
| **Published Events** | `work.clock_in`, `work.clock_out`, `work.break_started`, `work.break_ended` |
| **Consumed Events** | `work.shift_published`, `work.roster_published` (expected window) |
| **Audit Requirements** | Every punch: timestamp, actor, offline flag, evidence refs, timezone |
| **Reporting Impact** | Attendance exceptions, missing clock-outs, OT classification flags (operational) |
| **AI Readiness** | Anomaly hints only (duplicate punches, geofence outliers) |
| **Integration Consumers** | Time Entry workflow only — never Payroll/GL direct |

---

## 6. Time Entry Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Establish the single operational time fact for duration, billable flags, OT classification, and lock. |
| **Owner** | EWM Time Engine |
| **Trigger** | Manual create; Clock Session close; import; correction command |
| **Preconditions** | Project resolvable; company match; resource eligible; Project status allows time |
| **Processing Rules** | Lifecycle: `draft` → `submitted` → `approved` → `locked` (or `rejected` → `draft`). Duration SoT on Time Entry after approval path. OT is **classification flag** using Shift rules — not pay amount. One open approval chain per entry. |
| **Validation Rules** | Duration > 0; no orphan employee-only enterprise time as SoT; overlapping locked entries per policy; billable requires Engagement link when invoicing |
| **Approval Requirements** | Submitter cannot self-approve unless company policy explicitly allows (audited); admin/owner or designated approver |
| **Exceptions** | Compensating entry for corrections after lock; never mutate locked row |
| **Failure Behaviour** | Validation fail → remain draft; approval fail → rejected with reason |
| **Published Events** | `work.time_submitted`, `work.time_approved`, `work.time_locked` |
| **Consumed Events** | `work.clock_out` (create draft); leave posted (capacity overlay — not auto-reject time) |
| **Audit Requirements** | Create/submit/approve/reject/lock/compensate with actor and reason |
| **Reporting Impact** | Utilisation, burn, payroll input readiness, billing eligibility |
| **AI Readiness** | Suggest coding/project; never auto-lock |
| **Integration Consumers** | Costing, Payroll adapter, Billing bridge, Analytics |

---

## 7. Approval Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Single shared approval pattern for EWM operational facts — no parallel approval products. |
| **Owner** | EWM Approval pattern (operational); Payroll keeps payroll-period approvals |
| **Trigger** | Submit of Time Entry, Consumption, or other approvable EWM fact |
| **Preconditions** | Object in `submitted`; approver has role; company scope |
| **Processing Rules** | Approve → `approved`; Reject → `rejected` + reason. Lock may be automatic on approve or separate admin action per company policy — policy must be single and explicit. No duplicate approval workflows for the same object type. |
| **Validation Rules** | Approver ≠ submitter unless policy exception; cannot approve locked/cancelled |
| **Approval Requirements** | Designated approver role; multi-step only if company configures single chain (not parallel products) |
| **Exceptions** | Policy self-approve for owner-operators (audited) |
| **Failure Behaviour** | Concurrent approve race → first wins; second idempotent no-op or conflict error |
| **Published Events** | `work.time_approved` (and consumption-equivalent if configured) |
| **Consumed Events** | None mandatory |
| **Audit Requirements** | Approver, decision, reason, timestamp |
| **Reporting Impact** | Approval queue ageing; bottleneck alerts |
| **AI Readiness** | Prioritise queue; never auto-approve |
| **Integration Consumers** | Lock pipeline, notifications |

---

## 8. Payroll Input Rules

*(Detail pack: Report 03. Summary certified here.)*

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Emit payroll-ready **input facts only** from locked time — never calculate pay. |
| **Owner** | EWM Payroll Adapter (inputs); Payroll owns calculations |
| **Trigger** | `work.time_locked` for payroll-eligible resource types |
| **Preconditions** | Time Entry locked; resource `payroll_eligible=true`; company/period keys present |
| **Processing Rules** | Upsert `ewm_payroll_input_facts`: hours, dates, OT classification flags, wage_input for temp/casual. Status `ready` only if eligible. Subcontractor/Consultant → `excluded` forever. |
| **Validation Rules** | Reject ready status for non-eligible types; no PAYE/UIF/SDL/net fields authored by EWM |
| **Approval Requirements** | Time approval/lock upstream; Payroll run approval remains in Payroll |
| **Exceptions** | Retro compensating Time Entry → compensating input fact |
| **Failure Behaviour** | Adapter failure → Time Entry remains locked; retry/outbox; never unlock silently |
| **Published Events** | Fact upsert (internal); consumers read via adapter contract — no payroll calc events |
| **Consumed Events** | `work.time_locked`; Payroll period finalized (optional `payroll_cost_ref` attach) |
| **Audit Requirements** | Fact version, eligibility decision, exclusion reason |
| **Reporting Impact** | Payroll input readiness dashboard (operational) |
| **AI Readiness** | Flag missing classifications; never invent wage rates for payslip |
| **Integration Consumers** | Payroll (future wiring under Payroll Change Control only) |

---

## 9. Temporary Labour Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Capture wage-input hours for temporary/casual labour without EWM calculating wages. |
| **Owner** | EWM Work Resource + Time Engine; Payroll calculates wage |
| **Trigger** | Time lock for Temporary Employee / Casual Labour types |
| **Preconditions** | Work Resource type ∈ {Temporary Employee, Casual Labour, Temporary Labour}; active |
| **Processing Rules** | Hours → wage input facts (`wage_input=true`). Operational cost may use operational rate for burn. Payroll remains sole wage authority. |
| **Validation Rules** | Cannot mark payroll_eligible=false while treating as temporary wage labour |
| **Approval Requirements** | Same as Time Entry |
| **Exceptions** | Agency-billed labour may be typed Subcontractor if paid via AP — then NEVER payroll-ready |
| **Failure Behaviour** | Mis-typed resource → exclude from payroll until type corrected (no silent reclass of locked facts) |
| **Published Events** | `work.time_locked` → payroll adapter |
| **Consumed Events** | HR employment type changes (refresh eligibility projection) |
| **Audit Requirements** | Type at lock time snapshotted on fact |
| **Reporting Impact** | Temp labour hours vs cost burn |
| **AI Readiness** | Advisory overtime concentration |
| **Integration Consumers** | Payroll inputs; Costing |

---

## 10. Permanent Employee Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Attribute permanent staff effort to Projects for operational cost and payroll hours input. |
| **Owner** | HR (identity); EWM (operational projection & time); Payroll (pay calc) |
| **Trigger** | Assignment; Clock/Time; lock |
| **Preconditions** | HR employee linked to Work Resource; payroll_eligible=true |
| **Processing Rules** | Hours × operational cost rate for op cost. Payroll consumes hours/allocation input facts — EWM does not compute salary apportionment for payslips. |
| **Validation Rules** | One open clock session per employee per company |
| **Approval Requirements** | Time Entry rules |
| **Exceptions** | Directors/special statutory classes remain Payroll/Legislation concern — EWM only supplies time facts |
| **Failure Behaviour** | Missing HR link → cannot activate payroll-ready facts |
| **Published Events** | `work.resource_assigned`, `work.time_*` |
| **Consumed Events** | Leave posted (capacity overlay) |
| **Audit Requirements** | Assignment and time standard |
| **Reporting Impact** | Utilisation, capacity, labour burn |
| **AI Readiness** | Capacity overload advise |
| **Integration Consumers** | Payroll, Costing, Capacity |

---

## 11. Subcontractor Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Track subcontractor effort/claims as operational cost and AP-facing consumption — never payroll. |
| **Owner** | Vendors/Purchases (commercial); EWM (operational consumption); AP (payment) |
| **Trigger** | Assignment; certified claim/consumption approve/lock |
| **Preconditions** | Vendor-linked Work Resource; type Subcontractor |
| **Processing Rules** | Cost = certified qty × rate or claim amount. `payroll_eligible=false` immutable for type. NEVER emit payroll-ready facts. |
| **Validation Rules** | Attempt to set payroll ready → hard reject |
| **Approval Requirements** | Consumption/claim approval in EWM; commercial PO/invoice in Purchases |
| **Exceptions** | None for payroll path |
| **Failure Behaviour** | Reject payroll adapter ready status |
| **Published Events** | `work.resource_consumed`, `work.resource_assigned` |
| **Consumed Events** | Vendor terms updated (rate refresh for future only) |
| **Audit Requirements** | Claim amounts, approver, vendor ref |
| **Reporting Impact** | Subbie burn vs budget |
| **AI Readiness** | Over-claim vs progress advise |
| **Integration Consumers** | AP, Costing, Billing pass-through/markup |

---

## 12. Consultant Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Same economic pattern as Subcontractor for professional services suppliers. |
| **Owner** | Same split as Subcontractor |
| **Trigger** | Assignment; consumption/claim |
| **Preconditions** | Consultant resource type |
| **Processing Rules** | Identical anti-payroll invariant; cost via certified value; optional utilisation tracking |
| **Validation Rules** | NEVER payroll-ready |
| **Approval Requirements** | Claim/consumption approval |
| **Exceptions** | Internal employees acting as “consultants” must use Permanent/Contract Employee type — naming alone does not reclassify |
| **Failure Behaviour** | Same as Subcontractor |
| **Published Events** | `work.resource_consumed` |
| **Consumed Events** | Vendor updates |
| **Audit Requirements** | Full claim audit |
| **Reporting Impact** | Consultant burn |
| **AI Readiness** | Margin impact advise |
| **Integration Consumers** | AP, Costing, Billing |

---

## 13. Equipment Usage Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Attribute equipment hire/ownership burn to Projects for operational cost and utilisation. |
| **Owner** | Assets (register); EWM (assignment & consumption); AP if rented |
| **Trigger** | Assignment confirm; usage close; periodic burn |
| **Preconditions** | Equipment Work Resource active; Project active |
| **Processing Rules** | Cost = hire burn or ownership burn × time/qty. Utilisation = time on assignment / available. No payroll path. |
| **Validation Rules** | Cannot double-assign beyond capacity policy without overload event |
| **Approval Requirements** | Assignment confirm; consumption lock per policy |
| **Exceptions** | Tools may use Material/stock path if inventory-issued |
| **Failure Behaviour** | Overload → `work.capacity_overload`; assignment may still confirm if policy allows with alert |
| **Published Events** | `work.resource_assigned`, `work.resource_consumed`, `work.capacity_overload` |
| **Consumed Events** | Asset disposed (inactivate resource) |
| **Audit Requirements** | Assignment window, rates used |
| **Reporting Impact** | Plant utilisation, equipment burn |
| **AI Readiness** | Idle equipment advise |
| **Integration Consumers** | Costing, Capacity, optional Billing recharge |

---

## 14. Material Consumption Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Record material issues against Projects without EWM owning stock on hand. |
| **Owner** | Inventory (qty SoT); EWM (operational consumption fact); Accounting (GL) |
| **Trigger** | Issue/consume command; inventory issue event |
| **Preconditions** | Material Work Resource or product link; qty > 0 |
| **Processing Rules** | Consumption qty × unit cost → operational cost fact. Inventory remains SoT for stock. EWM does not recompute inventory valuation methods. |
| **Validation Rules** | Negative stock handling per Inventory rules — EWM does not override |
| **Approval Requirements** | Issue approval per company policy |
| **Exceptions** | Direct-to-project purchases may enter as consumption with PO ref |
| **Failure Behaviour** | Inventory reject → no EWM consumption lock |
| **Published Events** | `work.resource_consumed` |
| **Consumed Events** | Inventory issue posted |
| **Audit Requirements** | Qty, unit cost source, inventory ref |
| **Reporting Impact** | Material burn vs budget |
| **AI Readiness** | Waste/variance advise |
| **Integration Consumers** | Inventory, Costing, Accounting (facts only) |

---

## 15. Vehicle Usage Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Attribute vehicle time/distance/hire burn to Projects. |
| **Owner** | Assets/Fleet master; EWM usage facts; AP if hired |
| **Trigger** | Assignment; trip/usage close |
| **Preconditions** | Vehicle Work Resource active |
| **Processing Rules** | Same pattern as Equipment; fuel may be separate Fuel consumption/claim |
| **Validation Rules** | Overlapping exclusive assignments per policy |
| **Approval Requirements** | Usage approval if claim-based |
| **Exceptions** | Personal use carve-outs are policy flags — not payroll calc in EWM |
| **Failure Behaviour** | Reject overlapping exclusive use |
| **Published Events** | `work.resource_assigned`, `work.resource_consumed` |
| **Consumed Events** | Asset status change |
| **Audit Requirements** | Distance/time evidence optional |
| **Reporting Impact** | Fleet utilisation |
| **AI Readiness** | Route inefficiency advise (optional later) |
| **Integration Consumers** | Costing, optional Expenses |

---

## 16. Travel Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Attach travel claims to Project operational cost; Expenses/AP remain monetary SoT where applicable. |
| **Owner** | Expenses/AP (claim amounts); EWM (project attribution & op cost fact) |
| **Trigger** | Travel claim approved/linked to Project |
| **Preconditions** | Recoverable flag optional; Project active or cost period open |
| **Processing Rules** | Claim amount → consumption cost fact. EWM does not recalculate subsistence tax. |
| **Validation Rules** | Amount ≥ 0; currency per company |
| **Approval Requirements** | Expense/claim approval in owning module; EWM may require project confirmation |
| **Exceptions** | Per diem tables live outside EWM statutory calc |
| **Failure Behaviour** | Unapproved claim → no cost fact |
| **Published Events** | `work.resource_consumed` |
| **Consumed Events** | Expense approved |
| **Audit Requirements** | Claim ref, amount, project |
| **Reporting Impact** | Travel burn; recoverable vs non-recoverable |
| **AI Readiness** | Policy outlier advise |
| **Integration Consumers** | Costing, Billing (recoverable) |

---

## 17. Accommodation Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Same pattern as Travel for lodging PO/claims. |
| **Owner** | Expenses/Purchases; EWM attribution |
| **Trigger** | Accommodation claim/PO link |
| **Preconditions** | Amount present; Project link |
| **Processing Rules** | Amount → op cost fact; recoverable flag for billing eligibility signal |
| **Validation Rules** | Amount ≥ 0 |
| **Approval Requirements** | Owning module approval |
| **Exceptions** | Long-term site camp may use Equipment/Plant stereotypes — still no payroll |
| **Failure Behaviour** | Same as Travel |
| **Published Events** | `work.resource_consumed` |
| **Consumed Events** | PO/expense approved |
| **Audit Requirements** | Full |
| **Reporting Impact** | Accommodation burn |
| **AI Readiness** | Rate outlier advise |
| **Integration Consumers** | Costing, Billing |

---

## 18. Resource Allocation Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Confirm who/what is planned against Projects without inventing parallel booking objects. |
| **Owner** | EWM Capacity / Assignment |
| **Trigger** | Assignment create/confirm/release |
| **Preconditions** | Work Resource active; Project active; company match |
| **Processing Rules** | Assignment confirmed → capacity reserved. Universal Work Resource only — no parallel equipment/subbie booking entities. |
| **Validation Rules** | Soft/hard capacity limits per policy; hard reject only if policy=hard |
| **Approval Requirements** | Confirmer role (PM/admin) |
| **Exceptions** | Tentative assignments do not emit overload until confirmed |
| **Failure Behaviour** | Conflict → reject or warn per policy |
| **Published Events** | `work.allocation_confirmed`, `work.resource_assigned`, `work.capacity_overload` |
| **Consumed Events** | Leave posted; resource inactivated |
| **Audit Requirements** | Allocation window, %/hours |
| **Reporting Impact** | Capacity plan, Command Centre load |
| **AI Readiness** | Reallocation suggestions |
| **Integration Consumers** | Capacity, Roster, Costing (planned vs actual) |

---

## 19. Capacity Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Measure available vs assigned vs actual effort; raise overload signals. |
| **Owner** | EWM Capacity Engine |
| **Trigger** | Assignment confirm; time lock; leave overlay; roster publish |
| **Preconditions** | Calendars/holiday adapters resolved for country |
| **Processing Rules** | Utilisation = assigned/available (plan) and actual/available (actual). Overload threshold company-configurable single formula. Analytics consumes capacity snapshots — does not recompute. |
| **Validation Rules** | Available hours ≥ 0 after leave overlay |
| **Approval Requirements** | N/A for calc; planning publish may require admin |
| **Exceptions** | Multi-country calendars per resource locale |
| **Failure Behaviour** | Missing calendar → use company default + warning |
| **Published Events** | `work.capacity_overload` |
| **Consumed Events** | Leave; `work.allocation_confirmed`; `work.time_locked`; roster/shift |
| **Audit Requirements** | Snapshot generation metadata |
| **Reporting Impact** | Capacity heatmaps; executive load |
| **AI Readiness** | `ai.work.capacity_balance` advise |
| **Integration Consumers** | Planning, Forecast, Notifications |

---

## 20. Planning Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Publish shifts/rosters and phase plans that guide expected time without becoming payroll. |
| **Owner** | EWM Planning (Shift/Roster/Phase) |
| **Trigger** | Plan publish; phase update |
| **Preconditions** | Workspace/Project context |
| **Processing Rules** | Published Shift/Roster informs OT classification and expected windows. Plans do not create locked cost facts. |
| **Validation Rules** | Roster resources must be active |
| **Approval Requirements** | Publish requires planner/admin |
| **Exceptions** | Ad-hoc work without roster allowed |
| **Failure Behaviour** | Publish fails atomically |
| **Published Events** | `work.shift_published`, `work.roster_published`, `work.phase_completed` |
| **Consumed Events** | Capacity overload (replan signal) |
| **Audit Requirements** | Publish version |
| **Reporting Impact** | Plan vs actual |
| **AI Readiness** | Schedule repair suggestions |
| **Integration Consumers** | Clocking, Capacity, OT classification |

---

## 21. Forecast Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Project remaining operational cost and operational revenue signals — never recognised profit. |
| **Owner** | EWM Costing / Forecast |
| **Trigger** | Budget change; cost lock; remaining effort update; schedule change |
| **Preconditions** | Project has budget and/or contract snapshot policy choice configured **once** per company |
| **Processing Rules** | Forecast Cost = Burn + remaining effort × blended operational rates (+ known consumptions). Forecast Revenue = operational earn-out signal — **must not** be labelled Recognised. Forecast Margin per single company formula (Contract−Forecast Cost **or** Forecast Revenue−Forecast Cost). |
| **Validation Rules** | Formula switch requires admin + audit; no dual simultaneous formulas in one company |
| **Approval Requirements** | Baseline forecast publish optional approval |
| **Exceptions** | Manual forecast override lines allowed if flagged `manual` and audited |
| **Failure Behaviour** | Insufficient rate data → forecast incomplete status, not silent zero |
| **Published Events** | `work.forecast_updated`, `work.budget_at_risk` |
| **Consumed Events** | `work.time_locked`, `work.resource_consumed`, commercial snapshot refresh |
| **Audit Requirements** | Inputs, formula id, actor |
| **Reporting Impact** | Executive margin at risk; portfolio concentration |
| **AI Readiness** | `ai.work.margin_risk` — advisory only |
| **Integration Consumers** | Dashboard, Alerts, Reporting |

---

## 22. Operational Cost Rules

*(Detail pack: Report 02.)*

Summary ruling: Locked time and locked consumptions create immutable operational cost facts; rate resolution order is Task → Project role → Employee operational rate → Company default; Analytics does not recalculate; Accounting never posted by EWM.

---

## 23. Budget Consumption Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Track burn against operational budgets and signal at-risk conditions. |
| **Owner** | EWM Costing |
| **Trigger** | Cost fact create; budget baseline change |
| **Preconditions** | Budget exists for Project/Portfolio scope |
| **Processing Rules** | Budget Consumed = Σ locked op costs; Remaining = Budget − Consumed; At-Risk when Forecast Cost > Budget × threshold. |
| **Validation Rules** | Budget ≥ 0; threshold ∈ (0,∞) company config |
| **Approval Requirements** | Budget baseline changes require admin |
| **Exceptions** | Unbudgeted Projects report burn without remaining |
| **Failure Behaviour** | Missing budget → no at-risk event (status=unbudgeted) |
| **Published Events** | `work.budget_at_risk` |
| **Consumed Events** | Cost facts; forecast updates |
| **Audit Requirements** | Baseline versions |
| **Reporting Impact** | Burn charts; alerts |
| **AI Readiness** | Advise re-baseline |
| **Integration Consumers** | Dashboard, Notifications |

---

## 24. Project Health Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Compose schedule, cost, risk, and delivery signals into an operational health view. |
| **Owner** | EWM Analytics composition (reads engines — no new math ownership) |
| **Trigger** | Milestone miss; budget at risk; issue/risk open; phase slip |
| **Preconditions** | Project active or completed |
| **Processing Rules** | Health score consumes Capacity, Costing, Risk, Milestone events. Must not invent a second cost engine. Label operational vs financial clearly. |
| **Validation Rules** | Weights company-configurable; sum to 1 |
| **Approval Requirements** | N/A |
| **Exceptions** | Manual health override with expiry and audit |
| **Failure Behaviour** | Missing component → degrade with partial badge |
| **Published Events** | None new required; may raise notification |
| **Consumed Events** | `work.milestone_missed`, `work.budget_at_risk`, `work.risk_opened`, `work.issue_opened`, `work.capacity_overload` |
| **Audit Requirements** | Override only |
| **Reporting Impact** | Portfolio health; Command Centre |
| **AI Readiness** | Explain drivers |
| **Integration Consumers** | Executive Dashboard, Alerts |

---

## 25. Executive Dashboard Rules

*(Detail pack: Report 05.)*

Summary: Dual-authority labelling mandatory; EWM metrics operational/forecast only; Accounting metrics read-only recognised; no merged ambiguous “Profit”.

---

## 26. Command Centre Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Operational control surface for today’s execution: approvals, overloads, at-risk budgets, open risks. |
| **Owner** | EWM Command Centre (composition) |
| **Trigger** | User open; event-driven refresh |
| **Preconditions** | Company membership; role permissions |
| **Processing Rules** | Surfaces queues and signals from Time, Capacity, Costing, Risk — does not recalculate facts. Actions deep-link to owning workflows. |
| **Validation Rules** | Action permissions enforced at owning engine |
| **Approval Requirements** | Approvals executed via Approval Rules, not bypassed in UI |
| **Exceptions** | None |
| **Failure Behaviour** | Partial widget failure isolated; show error per panel |
| **Published Events** | None (UI composition) |
| **Consumed Events** | All operational alert events |
| **Audit Requirements** | Actions audit in owning modules |
| **Reporting Impact** | Primary ops console |
| **AI Readiness** | Daily focus ranking advisory |
| **Integration Consumers** | Notifications |

---

## 27. Notifications Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Deliver human-visible notices for operational events without owning business truth. |
| **Owner** | Platform Notification delivery; EWM owns when to request notify |
| **Trigger** | Certified EWM events (submit, approve, overload, at-risk, etc.) |
| **Preconditions** | Recipient resolvable; company prefs |
| **Processing Rules** | EWM emits/requests; Platform delivers. No duplicate notification product inside EWM. |
| **Validation Rules** | No notify on AI-only suggestions without human event unless user opted in |
| **Approval Requirements** | N/A |
| **Exceptions** | Digest batching allowed |
| **Failure Behaviour** | Delivery fail → retry in Platform; business fact unchanged |
| **Published Events** | Platform notification events |
| **Consumed Events** | EWM `work.*` alert/approval events |
| **Audit Requirements** | Delivery attempts in Platform |
| **Reporting Impact** | None as SoT |
| **AI Readiness** | May rank urgency — not suppress mandatory compliance notices |
| **Integration Consumers** | Email/push/in-app |

---

## 28. Alerts Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Persist actionable operational alert states (overload, budget, milestone). |
| **Owner** | EWM |
| **Trigger** | Threshold breach events |
| **Preconditions** | Threshold configured |
| **Processing Rules** | Alert open → acknowledge → resolve. Resolving alert does not reverse underlying facts. |
| **Validation Rules** | Cannot resolve without actor |
| **Approval Requirements** | N/A |
| **Exceptions** | Auto-resolve when underlying condition clears (optional policy) |
| **Failure Behaviour** | Keep alert open on partial clear |
| **Published Events** | Underlying `work.capacity_overload`, `work.budget_at_risk`, etc. |
| **Consumed Events** | Same |
| **Audit Requirements** | Ack/resolve actor |
| **Reporting Impact** | Alert ageing |
| **AI Readiness** | Suggest resolution playbooks |
| **Integration Consumers** | Command Centre, Notifications |

---

## 29. Escalations Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Escalate aged approvals/alerts to higher roles without creating a second approval system. |
| **Owner** | EWM + Platform orchestration |
| **Trigger** | SLA breach on approval queue or critical alert age |
| **Preconditions** | SLA policy configured |
| **Processing Rules** | Escalate notification/assignment of approver role; does not auto-approve. |
| **Validation Rules** | Escalation path must remain in-company |
| **Approval Requirements** | Still human approve |
| **Exceptions** | Owner-operator single-user companies may no-op escalate |
| **Failure Behaviour** | Log escalation failure; keep original queue |
| **Published Events** | Notification/activity |
| **Consumed Events** | Approval ageing signals |
| **Audit Requirements** | Escalation hops |
| **Reporting Impact** | SLA compliance |
| **AI Readiness** | Predict breach — not auto-escalate beyond policy |
| **Integration Consumers** | Notifications |

---

## 30. Risk Scoring Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Score operational delivery risk for prioritisation — not credit risk or statutory risk. |
| **Owner** | EWM Risk object |
| **Trigger** | Risk open/update; linked issue; dependency break |
| **Preconditions** | Project context |
| **Processing Rules** | Score = impact × likelihood (company scale). Does not alter Accounting provisions. |
| **Validation Rules** | Scales bounded |
| **Approval Requirements** | Risk accept/close by PM/admin |
| **Exceptions** | Manual score override audited |
| **Failure Behaviour** | Incomplete score → unscored status |
| **Published Events** | `work.risk_opened`, `work.dependency_broken` |
| **Consumed Events** | `work.issue_opened`, milestone miss |
| **Audit Requirements** | Score changes |
| **Reporting Impact** | Portfolio risk heat |
| **AI Readiness** | Suggest scores — human confirms |
| **Integration Consumers** | Dashboard, Alerts |

---

## 31. Profitability Forecasting Rules

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Forecast operational margin for management action while preserving Accounting as financial authority. |
| **Owner** | EWM Forecast; Accounting owns recognised profit |
| **Trigger** | Forecast recalculation triggers (see Forecast Rules) |
| **Preconditions** | Dual-label policy enforced in all surfaces |
| **Processing Rules** | Operational Forecast Margin only. Display Recognised Profit only as Accounting read model. Forbidden to rename Forecast Margin as Recognised Profit. |
| **Validation Rules** | UI/report copy must include authority labels |
| **Approval Requirements** | N/A for calc |
| **Exceptions** | None for labelling |
| **Failure Behaviour** | Hide ambiguous combined profit widgets as non-conforming |
| **Published Events** | `work.forecast_updated` |
| **Consumed Events** | Invoice posted / revenue recognised (read-only signal) |
| **Audit Requirements** | Forecast runs |
| **Reporting Impact** | Executive economics |
| **AI Readiness** | Margin risk narrative with labels |
| **Integration Consumers** | Executive Dashboard, Reporting |

---

## 32. Cross-Cutting Conflict Register (Resolved)

| Potential conflict | Resolution |
|--------------------|------------|
| Time vs Clock Session as SoT | Time Entry approved/locked is SoT; Clock is channel |
| Job vs Project | Job = Project stereotype |
| Contract vs Snapshot | Commercial SoT vs EWM snapshot |
| Op cost vs Payroll cost | Dual facts; payroll calc only in Payroll |
| Op margin vs Recognised profit | Dual authority labelling |
| Subcontractor hours to payroll | Forbidden |
| Analytics recalculating cost | Forbidden — consume rollups |
| AI auto-lock | Forbidden |

---

## 33. Board Result

**ENTERPRISE BUSINESS RULES CERTIFIED** for all listed rule families.  
Implementation remains prohibited until Implementation Approval.
