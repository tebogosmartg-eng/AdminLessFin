# 02 — Widget Ownership Matrix

**Board:** Independent Principal Executive Experience Board  
**Version:** 4.1.3  
**Date:** 2026-07-13  

Defines ownership for every certified Executive Dashboard widget. Dashboards **compose** — they never become a calculation authority.

---

## Legend

| Status | Meaning |
|--------|---------|
| **LIVE** | Rendered on `/work` today |
| **PARTIAL** | Signal exists (KPI/API) without full widget contract |
| **MISSING** | Required for certification; not on `/work` |
| **DESIGN** | Design-only zone permitted (AI) |

---

## Matrix

### 1. Business Health

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Is the portfolio healthy enough to run without crisis today? |
| **Primary Data Owner** | EWM Analytics composition (health drivers from Project Health / burn / schedule / capacity) |
| **Update Frequency** | On open; refresh on `work.*` risk/forecast/capacity events |
| **Drill-down Behaviour** | Portfolio Health report → Project Command Centre |
| **Permissions** | Company member with `work` read; multi-company rollup only with platform multi-company role |
| **Cross-module Dependencies** | EWM costing, capacity, milestones; optional Accounting recognised margin for dual strip |
| **Performance Expectations** | ≤400ms from analytics facts / pre-aggregated health; never recompute hours×rate |
| **Mobile Behaviour** | Single score + top 3 drivers; full matrix on tablet+ |
| **Audit Considerations** | Access audit; drill actions audit in owning workflows |
| **Implementation Status** | **MISSING** |

### 2. Commercial Pipeline

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What revenue is secured in pipeline vs awarded? |
| **Primary Data Owner** | Commercial / Engagement SoT; EWM displays contract snapshot |
| **Update Frequency** | On commercial approve / snapshot refresh |
| **Drill-down Behaviour** | Pipeline project list (`status=pipeline`) → engagement/commercial record |
| **Permissions** | Commercial read + EWM read |
| **Cross-module Dependencies** | Sales/Engagement; EWM `ewm_projects` snapshot fields |
| **Performance Expectations** | Sum of snapshots only; no FX invent |
| **Mobile Behaviour** | Two figures: Pipeline Value / Awarded Contract Value with Commercial labels |
| **Audit Considerations** | Snapshot refresh events audited in commercial owner |
| **Implementation Status** | **PARTIAL** (unlabelled KPI) |

### 3. Active Work

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What work is active right now? |
| **Primary Data Owner** | EWM Projects |
| **Update Frequency** | Near real-time on project status change |
| **Drill-down Behaviour** | Filtered `/work/projects?status=active` → Project Command Centre |
| **Permissions** | EWM project read |
| **Cross-module Dependencies** | None for count; optional client master for grouping |
| **Performance Expectations** | Count/filter from project index ≤200ms |
| **Mobile Behaviour** | Count + “View active” CTA |
| **Audit Considerations** | Status changes audited in EWM |
| **Implementation Status** | **PARTIAL** |

### 4. Operational Cost Summary

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What are total operational costs (burn) to date / period? |
| **Primary Data Owner** | EWM Costing (`ewm_cost_rollups`) |
| **Update Frequency** | On cost fact lock / rollup refresh |
| **Drill-down Behaviour** | Cost by project → consumption/time cost facts |
| **Permissions** | EWM cost read |
| **Cross-module Dependencies** | Must not read GL expense as operational burn substitute |
| **Performance Expectations** | Consume rollups; label **Operational Cost (EWM)** |
| **Mobile Behaviour** | Single period total + burn % of budget |
| **Audit Considerations** | Cost fact lineage in EWM |
| **Implementation Status** | **PARTIAL** (Costs Incurred ≈ Operational Burn duplicate) |

### 5. Forecast Profitability

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What is forecast operational margin, and what is Accounting profit (if shown)? |
| **Primary Data Owner** | EWM Forecast engine for Forecast Margin; **Accounting** for Profit (Accounting) |
| **Update Frequency** | Forecast on planning events; Accounting on period close / journal post |
| **Drill-down Behaviour** | Project Economics Strip (dual series) — never one merged total |
| **Permissions** | Ops forecast: EWM; FS profit: Accounting entitlement (often admin) |
| **Cross-module Dependencies** | Cost rollups + forecast; GL project P&L read-only |
| **Performance Expectations** | No dashboard-side `contract − cost` profit invention |
| **Mobile Behaviour** | Two labelled tiles side-by-side |
| **Audit Considerations** | Forecast version id on drill |
| **Implementation Status** | **PARTIAL / REJECTED form** (“Expected Gross Profit”) |

### 6. Cash Position

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What is our cash position? |
| **Primary Data Owner** | **Accounting** (bank / cash balances) — read-only |
| **Update Frequency** | Accounting dashboard refresh / bank sync events |
| **Drill-down Behaviour** | Accounting bank accounts / cash report (`/` or finance route) |
| **Permissions** | Accounting financial KPI entitlement |
| **Cross-module Dependencies** | `dashboard-data` or certified Accounting read model; EWM must not invent cash |
| **Performance Expectations** | Reuse Accounting aggregate; fail widget if Accounting unavailable (no zero-as-health) |
| **Mobile Behaviour** | Single balance + currency |
| **Audit Considerations** | Financial access audit per Accounting norms |
| **Implementation Status** | **MISSING** on `/work` (exists on Accounting `/`) |

### 7. Resource Utilisation

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | How utilised is the workforce / resource pool? |
| **Primary Data Owner** | EWM Capacity (`ewm_capacity_snapshots`) |
| **Update Frequency** | Period snapshots / clock & time lock |
| **Drill-down Behaviour** | Resource list sorted by utilisation → Resources / Time |
| **Permissions** | EWM capacity read |
| **Cross-module Dependencies** | HR identity for employee display names |
| **Performance Expectations** | Snapshot aggregates ≤300ms |
| **Mobile Behaviour** | % + overloaded count |
| **Audit Considerations** | Snapshot generation audited |
| **Implementation Status** | **PARTIAL** |

### 8. Capacity Heatmap

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Who is overloaded vs available across the period? |
| **Primary Data Owner** | EWM Capacity |
| **Update Frequency** | Daily snapshot / planning change |
| **Drill-down Behaviour** | Cell → resource allocations / clocking |
| **Permissions** | EWM capacity read |
| **Cross-module Dependencies** | Work resources + employees |
| **Performance Expectations** | Prefer `ewm_analytics_facts` materialization |
| **Mobile Behaviour** | List of hot/cold resources (heatmap on larger screens) |
| **Audit Considerations** | Read-only visualisation |
| **Implementation Status** | **MISSING** |

### 9. Clocking Status

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Who is clocked in, missing clock-outs, or stalled sessions? |
| **Primary Data Owner** | EWM Clocking domain |
| **Update Frequency** | Near real-time on clock events |
| **Drill-down Behaviour** | `/work/clocking` with filters |
| **Permissions** | Clocking read / approve per role |
| **Cross-module Dependencies** | Time Entry creation rules (no auto-approve from dash) |
| **Performance Expectations** | Open session counts ≤200ms |
| **Mobile Behaviour** | Counts + CTA to Clocking |
| **Audit Considerations** | Clock mutations audit in Clocking |
| **Implementation Status** | **MISSING** on exec dash (**LIVE** page elsewhere) |

### 10. Pending Approvals

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What payroll-input / time approvals are blocking today? |
| **Primary Data Owner** | EWM Time Approval pattern; Payroll remains calculation authority |
| **Update Frequency** | On submit / approve / reject |
| **Drill-down Behaviour** | `/work/time` approval queue |
| **Permissions** | Approver role |
| **Cross-module Dependencies** | Payroll adapter facts after approval — never payslip math here |
| **Performance Expectations** | Count + ageing buckets |
| **Mobile Behaviour** | Count + Review CTA |
| **Audit Considerations** | Approvals audited in Time workflow |
| **Implementation Status** | **LIVE** (count only; no ageing) |

### 11. Executive Alerts

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What escalations/budget alerts need acknowledgement? |
| **Primary Data Owner** | EWM Alerts (`ewm_budget_alerts` + escalation rules) |
| **Update Frequency** | On alert publish |
| **Drill-down Behaviour** | Alert detail → acknowledge/escalate via Alert Rules (not dashboard invent) |
| **Permissions** | Alert read / acknowledge |
| **Cross-module Dependencies** | Notifications platform |
| **Performance Expectations** | Top N unacknowledged |
| **Mobile Behaviour** | Severity-sorted list |
| **Audit Considerations** | Acknowledge/resolve audited |
| **Implementation Status** | **PARTIAL** (API returns; UI does not render) |

### 12. Risk Register Summary

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Which delivery risks are open and highest scored? |
| **Primary Data Owner** | EWM Risk |
| **Update Frequency** | On risk create/score change |
| **Drill-down Behaviour** | Risk register → project |
| **Permissions** | Risk read |
| **Cross-module Dependencies** | Projects; optional commercial concentration |
| **Performance Expectations** | Top risks by score |
| **Mobile Behaviour** | Top 5 |
| **Audit Considerations** | Risk mutations in Risk owner |
| **Implementation Status** | **MISSING** |

### 13. Upcoming Milestones

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What milestones are due soon or overdue? |
| **Primary Data Owner** | EWM Milestones |
| **Update Frequency** | On milestone change |
| **Drill-down Behaviour** | Project Command Centre milestones |
| **Permissions** | EWM project read |
| **Cross-module Dependencies** | Projects |
| **Performance Expectations** | Window query (e.g. 14 days) |
| **Mobile Behaviour** | Compact due list |
| **Audit Considerations** | Milestone completion audited |
| **Implementation Status** | **LIVE** (drill incomplete) |

### 14. Recent Activity

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What just happened across work/commercial/finance signals? |
| **Primary Data Owner** | Platform BOE / activity feed composition |
| **Update Frequency** | Event stream |
| **Drill-down Behaviour** | Owning module deep link |
| **Permissions** | Activity read per company |
| **Cross-module Dependencies** | BOE subscribers; must not mutate |
| **Performance Expectations** | Last N events; independent fail |
| **Mobile Behaviour** | Compact feed |
| **Audit Considerations** | Feed is presentation of audited events |
| **Implementation Status** | **MISSING** on `/work` (**LIVE** on Accounting `/`) |

### 15. AI Readiness Zone (design only)

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What should I focus on today / which margins need review? (advisory) |
| **Primary Data Owner** | AI advisory layer consuming certified metrics — **non-mutating** |
| **Update Frequency** | On demand / daily |
| **Drill-down Behaviour** | Cite metric authorities; open owning widget |
| **Permissions** | Same as underlying metrics |
| **Cross-module Dependencies** | `ai.work.daily_focus`, `ai.work.margin_risk` |
| **Performance Expectations** | Async; never block core widgets |
| **Mobile Behaviour** | Collapsed advisory strip |
| **Audit Considerations** | Log prompts/citations; no silent actions |
| **Implementation Status** | **DESIGN** — **DESIGN CERTIFIED** |

---

## Ownership Summary (No Duplication)

| Plane | Widgets owned / composed |
|-------|--------------------------|
| **EWM** | Business Health, Active Work, Operational Cost, Resource Utilisation, Capacity Heatmap, Clocking Status, Pending Approvals, Executive Alerts, Risk Register, Upcoming Milestones, Forecast Margin (ops) |
| **Commercial / Sales** | Commercial Pipeline (SoT); invoiced / outstanding AR signals |
| **Accounting** | Cash Position; Recognised Revenue; Profit (Accounting) |
| **Payroll** | None calculated on dashboard — Pending Approvals feeds Payroll inputs only |
| **Platform / AI** | Recent Activity composition; AI Readiness Zone |

---

## Matrix Result

Widget ownership targets are **CERTIFIED**.  
Current UI coverage is **insufficient** for Executive Dashboard certification (see Report 01).
