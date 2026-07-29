# 01 — Enterprise KPI Catalogue

**Board:** Independent Principal Enterprise Performance Management Board  
**Version:** 4.1.5  
**Date:** 2026-07-13  
**Status:** **CERTIFIED — definitional SoT**  
**Scope:** All enterprise KPIs for AdminLess Fin. Implementation prohibited.

---

## 0. Catalogue Invariants (Frozen)

1. **One ID, one definition, one calculation owner.** Consumers display/compose only.  
2. **Authority labels mandatory** on every money KPI: `(Commercial)`, `(Sales)`, `(Accounting)`, `(EWM)`, `(Operational)`.  
3. **Dashboards, reports, APIs, and AI must not invent formulas.** They cite `KPI-ID` and consume published values.  
4. **Forecast ≠ Recognition.** Operational forecast KPIs never labelled as recognised revenue or FS profit.  
5. **Accounting KPIs are read-only** to EWM/Executive surfaces.  
6. **Payroll calculation KPIs** (PAYE, net, UIF, SDL) owned only by Payroll engine.  
7. **Company scope default** = active company; multi-company rollup only with platform multi-company role; no silent FX invent.  
8. **Industry packs** may rename labels and default thresholds; they may not fork calculation owners or formulas.  
9. **Rejected alias:** `Expected Gross Profit` — not a catalogue KPI. Use `FCT-03` and/or `ACC-02`.  
10. **Rejected alias:** bare `Profit` / `Margin` / `Revenue` without authority suffix.

### ID Prefix Legend

| Prefix | Domain |
|--------|--------|
| `EXE` | Executive |
| `COM` | Commercial |
| `OPS` | Operational |
| `PRJ` | Project |
| `RES` | Resource |
| `CAP` | Capacity |
| `CLK` | Clocking |
| `PAY` | Payroll |
| `ACC` | Accounting (read-only composition) |
| `RSK` | Risk |
| `CLI` | Client |
| `PRD` | Productivity |
| `FCT` | Forecast |
| `SAL` | Sales / Billing (commercial outbound) |

---

## 1. Executive KPIs

### EXE-01 — Attention Queue Depth

| Field | Certification |
|-------|---------------|
| **Business Name** | Attention Queue Depth |
| **Business Definition** | Count of severity-ranked attention items requiring executive/operational intervention in the active company. |
| **Business Purpose** | Answer “what requires attention today?” at portfolio level. |
| **Calculation Owner** | EWM Analytics |
| **Calculation Engine** | Attention builder (deterministic rules; AI may re-rank only) |
| **Source Data** | Budget risks, deadlines, capacity idle/overload, approvals, unbilled, alerts, composed AR/AP signals |
| **Refresh Frequency** | On open; on contributing events |
| **Industry Applicability** | All |
| **Drill-down Path** | Attention list → owning workflow |
| **Reporting Usage** | Executive Attention Queue report |
| **Dashboard Usage** | Executive Attention section (first) |
| **AI Usage** | `ai.work.daily_focus` ranking with citations to source KPI IDs |
| **Alert Thresholds** | See `THR-EXE-01` |
| **Trend Behaviour** | Directional daily; rising = worsening load |
| **Audit Requirements** | Snapshot of item IDs/severities at access optional; actions audit in owners |

### EXE-02 — Business Health Index

| Field | Certification |
|-------|---------------|
| **Business Name** | Business Health Index |
| **Business Definition** | Composed ordinal status (`healthy` / `watch` / `crisis`) from certified drivers (budget-at-risk, overloads, overdue milestones, open critical risks, approval backlog ageing). **No new cost math.** |
| **Business Purpose** | Single pulse for CEO/MD/Owner. |
| **Calculation Owner** | EWM Analytics composition |
| **Calculation Engine** | Health composer consuming other catalogue KPIs |
| **Source Data** | OPS-04, CAP-03, PRJ-04, RSK-01, PAY-01 |
| **Refresh Frequency** | On open / driver events |
| **Industry Applicability** | All; driver weights configurable by industry pack |
| **Drill-down Path** | Drivers → Attention |
| **Reporting Usage** | Portfolio Health |
| **Dashboard Usage** | Business Health section |
| **AI Usage** | Explain top driver; no mutation |
| **Alert Thresholds** | `THR-EXE-02` |
| **Trend Behaviour** | Status transitions audited |
| **Audit Requirements** | Record driver set and weights version |

### EXE-03 — Making Money Count (Operational)

| Field | Certification |
|-------|---------------|
| **Business Name** | Making Money Work Count (Operational) |
| **Business Definition** | Count of active projects where Forecast Margin (Operational) > 0 per company forecast policy. |
| **Business Purpose** | Where are we making money (ops lens)? |
| **Calculation Owner** | EWM Forecast (composition count) |
| **Calculation Engine** | Forecast engine + portfolio filter |
| **Source Data** | FCT-03 per project |
| **Refresh Frequency** | On forecast refresh |
| **Industry Applicability** | All |
| **Drill-down Path** | Winning projects list → Project CC |
| **Reporting Usage** | Portfolio economics |
| **Dashboard Usage** | Commercial/ops story beat |
| **AI Usage** | Cite FCT-03 |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Weekly preferred |
| **Audit Requirements** | Forecast policy id |

### EXE-04 — Losing Money Count (Operational)

| Field | Certification |
|-------|---------------|
| **Business Name** | Losing Money Work Count (Operational) |
| **Business Definition** | Count of active projects where FCT-03 < 0. |
| **Business Purpose** | Where are we losing money (ops lens)? |
| **Calculation Owner** | EWM Forecast |
| **Calculation Engine** | Forecast engine |
| **Source Data** | FCT-03 |
| **Refresh Frequency** | On forecast refresh |
| **Industry Applicability** | All |
| **Drill-down Path** | Loss-makers → Project CC |
| **Reporting Usage** | Margin risk |
| **Dashboard Usage** | Executive money story |
| **AI Usage** | `ai.work.margin_risk` |
| **Alert Thresholds** | `THR-EXE-04` |
| **Trend Behaviour** | Rising = deterioration |
| **Audit Requirements** | Policy id + project set |

### EXE-05 — Losing Money Count (Accounting)

| Field | Certification |
|-------|---------------|
| **Business Name** | Losing Money Work Count (Accounting) |
| **Business Definition** | Count of projects/cost centres with negative Profit (Accounting) in selected period. |
| **Business Purpose** | Financial loss view — distinct from EXE-04. |
| **Calculation Owner** | Accounting |
| **Calculation Engine** | GL / project P&L |
| **Source Data** | ACC-02 |
| **Refresh Frequency** | Accounting period refresh |
| **Industry Applicability** | All |
| **Drill-down Path** | Accounting project P&L |
| **Reporting Usage** | Financial project profitability |
| **Dashboard Usage** | Financial Readiness (read-only) |
| **AI Usage** | Cite Accounting only |
| **Alert Thresholds** | `THR-EXE-05` |
| **Trend Behaviour** | Period-based |
| **Audit Requirements** | Period + ledger version |

---

## 2. Commercial KPIs

### COM-01 — Contract Value (Commercial)

| Field | Certification |
|-------|---------------|
| **Business Name** | Contract Value (Commercial) |
| **Business Definition** | Awarded commercial contract baseline for in-scope engagements/projects (EWM holds snapshot only). |
| **Business Purpose** | Secured commercial baseline. |
| **Calculation Owner** | Commercial / Engagement SoT |
| **Calculation Engine** | Commercial contract engine |
| **Source Data** | Contract/engagement master; EWM snapshot fields |
| **Refresh Frequency** | On commercial approve / snapshot refresh |
| **Industry Applicability** | All |
| **Drill-down Path** | Commercial record |
| **Reporting Usage** | Contract register |
| **Dashboard Usage** | Commercial Position |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Stale snapshot flag |
| **Trend Behaviour** | Step changes on variation |
| **Audit Requirements** | Snapshot version + commercial event id |

### COM-02 — Approved Variations (Commercial)

| Field | Certification |
|-------|---------------|
| **Business Name** | Approved Variations (Commercial) |
| **Business Definition** | Σ approved commercial change orders. |
| **Business Purpose** | Track certified scope value changes. |
| **Calculation Owner** | Commercial |
| **Calculation Engine** | Commercial variation workflow |
| **Source Data** | Approved variations |
| **Refresh Frequency** | On variation approve |
| **Industry Applicability** | All |
| **Drill-down Path** | Variation list |
| **Reporting Usage** | Contract change log |
| **Dashboard Usage** | Economics strip |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Optional concentration |
| **Trend Behaviour** | Cumulative |
| **Audit Requirements** | Approver + timestamp |

### COM-03 — Pipeline Value (Commercial)

| Field | Certification |
|-------|---------------|
| **Business Name** | Pipeline Value (Commercial) |
| **Business Definition** | Σ snapshot contract value where work status = pipeline (pre-award). |
| **Business Purpose** | Prospective secured revenue. |
| **Calculation Owner** | Commercial (SoT); EWM snapshot aggregation for display |
| **Calculation Engine** | Commercial pipeline + EWM status filter |
| **Source Data** | Pipeline engagements / `ewm_projects` pipeline |
| **Refresh Frequency** | On status/commercial change |
| **Industry Applicability** | All |
| **Drill-down Path** | Pipeline list |
| **Reporting Usage** | Pipeline report |
| **Dashboard Usage** | Commercial Position |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Weekly |
| **Audit Requirements** | Status transition audit |

### COM-04 — Awarded Contract Value (Commercial)

| Field | Certification |
|-------|---------------|
| **Business Name** | Awarded Contract Value (Commercial) |
| **Business Definition** | Σ COM-01 (+ COM-02 when policy includes variations) for active awarded work. |
| **Business Purpose** | Secured awarded book. |
| **Calculation Owner** | Commercial |
| **Calculation Engine** | Commercial + snapshot policy |
| **Source Data** | COM-01, COM-02 |
| **Refresh Frequency** | On award/variation |
| **Industry Applicability** | All |
| **Drill-down Path** | Active awarded list |
| **Reporting Usage** | Book of business |
| **Dashboard Usage** | Commercial Position |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Step |
| **Audit Requirements** | Policy whether variations included |

---

## 3. Sales / Billing KPIs

### SAL-01 — Invoiced (Sales)

| Field | Certification |
|-------|---------------|
| **Business Name** | Invoiced (Sales) |
| **Business Definition** | Σ invoice amounts posted/issued in period (tax policy per Sales module). |
| **Business Purpose** | Billed commercial outflow. |
| **Calculation Owner** | Sales |
| **Calculation Engine** | Sales invoicing |
| **Source Data** | Sales invoices |
| **Refresh Frequency** | On invoice post |
| **Industry Applicability** | All |
| **Drill-down Path** | Invoice list |
| **Reporting Usage** | Sales reports |
| **Dashboard Usage** | Financial Readiness / Commercial |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Optional period targets |
| **Trend Behaviour** | Period series |
| **Audit Requirements** | Invoice ids |

### SAL-02 — Outstanding Receivables (Sales/AR)

| Field | Certification |
|-------|---------------|
| **Business Name** | Outstanding Invoices (Sales/AR) |
| **Business Definition** | Open accounts receivable balance (customer invoices unpaid). |
| **Business Purpose** | Which payments are outstanding (collections)? |
| **Calculation Owner** | Sales / Accounting AR (module SoT as implemented) |
| **Calculation Engine** | AR ledger |
| **Source Data** | Open invoices |
| **Refresh Frequency** | On payment/invoice events |
| **Industry Applicability** | All |
| **Drill-down Path** | AR ageing |
| **Reporting Usage** | Debtors |
| **Dashboard Usage** | Financial Readiness (read-only) |
| **AI Usage** | Cite AR |
| **Alert Thresholds** | `THR-SAL-02` |
| **Trend Behaviour** | Rising = cash risk |
| **Audit Requirements** | Period cut |

### SAL-03 — Billable Ready to Invoice (Operational Signal)

| Field | Certification |
|-------|---------------|
| **Business Name** | Unbilled Work (Operational) |
| **Business Definition** | Locked billable value not yet bridged to invoice/timesheet billing artefact. **Not recognised revenue.** |
| **Business Purpose** | Which invoices should be issued? |
| **Calculation Owner** | EWM Billing bridge signal (Sales executes invoice) |
| **Calculation Engine** | EWM time/billing signal |
| **Source Data** | Locked billable time / billing bridge |
| **Refresh Frequency** | On lock / invoice link |
| **Industry Applicability** | All billable industries |
| **Drill-down Path** | Unbilled list → Sales invoice flow |
| **Reporting Usage** | Unbilled WIP ops |
| **Dashboard Usage** | Attention / Commercial actions |
| **AI Usage** | Suggest invoice candidates; no auto-issue |
| **Alert Thresholds** | `THR-SAL-03` |
| **Trend Behaviour** | Rising = billing lag |
| **Audit Requirements** | Source time entry ids |

---

## 4. Operational KPIs

### OPS-01 — Operational Cost (EWM)

| Field | Certification |
|-------|---------------|
| **Business Name** | Operational Cost (EWM) |
| **Business Definition** | Σ locked operational cost facts (labour + consumptions) for scope/period — from cost rollups. |
| **Business Purpose** | Total operational costs. |
| **Calculation Owner** | EWM Costing |
| **Calculation Engine** | Cost fact + rollup engine |
| **Source Data** | `ewm_cost_rollups` / cost facts |
| **Refresh Frequency** | On time lock / consumption lock |
| **Industry Applicability** | All |
| **Drill-down Path** | Cost by project/category |
| **Reporting Usage** | Burn reports |
| **Dashboard Usage** | Operational Performance |
| **AI Usage** | Explain drivers; never rewrite |
| **Alert Thresholds** | Via OPS-04 |
| **Trend Behaviour** | Cumulative / period |
| **Audit Requirements** | Source fact lineage |

### OPS-02 — Operational Burn Rate (EWM)

| Field | Certification |
|-------|---------------|
| **Business Name** | Operational Burn Rate (EWM) |
| **Business Definition** | Periodised operational cost (e.g. cost per day/week in window) — **distinct from OPS-01 incurred total**. |
| **Business Purpose** | Velocity of spend. |
| **Calculation Owner** | EWM Costing |
| **Calculation Engine** | Costing periodisation |
| **Source Data** | Cost facts by date |
| **Refresh Frequency** | Daily / on lock |
| **Industry Applicability** | All |
| **Drill-down Path** | Period cost series |
| **Reporting Usage** | Burn trend |
| **Dashboard Usage** | Optional ops KPI (must not duplicate OPS-01 label) |
| **AI Usage** | Trend narrative |
| **Alert Thresholds** | `THR-OPS-02` |
| **Trend Behaviour** | Time series |
| **Audit Requirements** | Window definition |

### OPS-03 — Active Work Count

| Field | Certification |
|-------|---------------|
| **Business Name** | Active Work Count |
| **Business Definition** | Count of EWM projects/jobs with `status=active`. |
| **Business Purpose** | What work is active? |
| **Calculation Owner** | EWM Projects |
| **Calculation Engine** | Project registry |
| **Source Data** | `ewm_projects` |
| **Refresh Frequency** | On status change |
| **Industry Applicability** | All (label variants) |
| **Drill-down Path** | Active list |
| **Reporting Usage** | Portfolio |
| **Dashboard Usage** | Work Portfolio |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Optional capacity coupling |
| **Trend Behaviour** | Count series |
| **Audit Requirements** | Status transitions |

### OPS-04 — Budgets at Risk Count

| Field | Certification |
|-------|---------------|
| **Business Name** | Budgets at Risk |
| **Business Definition** | Count of projects where operational burn % of operational budget ≥ warning threshold. |
| **Business Purpose** | Which work is at cost risk? |
| **Calculation Owner** | EWM Costing / Budget |
| **Calculation Engine** | Budget rules (consume OPS-01; no dashboard math) |
| **Source Data** | Rollups + operational_budget |
| **Refresh Frequency** | On cost/budget change |
| **Industry Applicability** | All |
| **Drill-down Path** | At-risk projects |
| **Reporting Usage** | Budget risk |
| **Dashboard Usage** | Attention / Risks |
| **AI Usage** | Cite burn % |
| **Alert Thresholds** | `THR-OPS-04` |
| **Trend Behaviour** | Rising = worse |
| **Audit Requirements** | Threshold version |

---

## 5. Project KPIs

### PRJ-01 — Project Operational Burn %

| Field | Certification |
|-------|---------------|
| **Business Name** | Project Operational Burn % |
| **Business Definition** | (Project OPS-01 / project operational_budget) × 100 when budget > 0. |
| **Business Purpose** | Project cost consumption. |
| **Calculation Owner** | EWM Costing |
| **Calculation Engine** | Costing |
| **Source Data** | Project rollups + budget |
| **Refresh Frequency** | On cost lock |
| **Industry Applicability** | All |
| **Drill-down Path** | Project CC economics |
| **Reporting Usage** | Project health |
| **Dashboard Usage** | Project CC |
| **AI Usage** | Margin risk input |
| **Alert Thresholds** | `THR-OPS-04` |
| **Trend Behaviour** | Monotonic upward typical |
| **Audit Requirements** | Budget baseline version |

### PRJ-02 — Project Progress %

| Field | Certification |
|-------|---------------|
| **Business Name** | Project Progress % |
| **Business Definition** | Certified overall progress field / milestone-weighted progress per project rules. |
| **Business Purpose** | Delivery completion signal. |
| **Calculation Owner** | EWM Projects |
| **Calculation Engine** | Project progress rules |
| **Source Data** | Progress + milestones |
| **Refresh Frequency** | On progress/milestone update |
| **Industry Applicability** | All |
| **Drill-down Path** | Project CC |
| **Reporting Usage** | Delivery reports |
| **Dashboard Usage** | Project CC |
| **AI Usage** | Schedule risk narrative |
| **Alert Thresholds** | Coupled with PRJ-04 |
| **Trend Behaviour** | 0–100 |
| **Audit Requirements** | Progress change actor |

### PRJ-03 — Project Forecast Margin (Operational)

| Field | Certification |
|-------|---------------|
| **Business Name** | Project Forecast Margin (Operational) |
| **Business Definition** | Project-scoped FCT-03. |
| **Business Purpose** | Project make/lose (ops). |
| **Calculation Owner** | EWM Forecast |
| **Calculation Engine** | Forecast |
| **Source Data** | FCT-01, FCT-02, COM snapshot per policy |
| **Refresh Frequency** | On forecast_updated |
| **Industry Applicability** | All |
| **Drill-down Path** | Project Economics Strip |
| **Reporting Usage** | Project economics |
| **Dashboard Usage** | Project CC |
| **AI Usage** | `ai.work.margin_risk` |
| **Alert Thresholds** | `THR-FCT-03` |
| **Trend Behaviour** | Forecast series |
| **Audit Requirements** | Formula policy id |

### PRJ-04 — Overdue Milestones Count

| Field | Certification |
|-------|---------------|
| **Business Name** | Overdue Milestones |
| **Business Definition** | Count of incomplete milestones with due_date < today. |
| **Business Purpose** | Schedule risk. |
| **Calculation Owner** | EWM Milestones |
| **Calculation Engine** | Milestone registry |
| **Source Data** | `ewm_milestones` |
| **Refresh Frequency** | Daily / on milestone change |
| **Industry Applicability** | All |
| **Drill-down Path** | Milestone list → Project |
| **Reporting Usage** | Schedule |
| **Dashboard Usage** | Attention / Upcoming |
| **AI Usage** | Read-only |
| **Alert Thresholds** | `THR-PRJ-04` |
| **Trend Behaviour** | Rising = worse |
| **Audit Requirements** | Due date changes |

---

## 6. Resource KPIs

### RES-01 — Active Resources Count

| Field | Certification |
|-------|---------------|
| **Business Name** | Active Resources |
| **Business Definition** | Count of work resources in active status for company. |
| **Business Purpose** | Workforce/asset pool size. |
| **Calculation Owner** | EWM Resource Registry |
| **Calculation Engine** | Resource registry |
| **Source Data** | Work resources |
| **Refresh Frequency** | On resource status |
| **Industry Applicability** | All |
| **Drill-down Path** | `/work/resources` |
| **Reporting Usage** | Resource register |
| **Dashboard Usage** | Resource Health |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Headcount-like |
| **Audit Requirements** | Status changes |

### RES-02 — Resource Utilisation % (Individual)

| Field | Certification |
|-------|---------------|
| **Business Name** | Resource Utilisation % |
| **Business Definition** | actual_hours / available_hours × 100 for resource in period snapshot. |
| **Business Purpose** | Individual load. |
| **Calculation Owner** | EWM Capacity |
| **Calculation Engine** | Capacity snapshots |
| **Source Data** | `ewm_capacity_snapshots` |
| **Refresh Frequency** | Snapshot cadence |
| **Industry Applicability** | All |
| **Drill-down Path** | Resource → allocations/time |
| **Reporting Usage** | Utilisation |
| **Dashboard Usage** | Heatmap / lists |
| **AI Usage** | Overload narrative |
| **Alert Thresholds** | `THR-CAP-03` |
| **Trend Behaviour** | Period series |
| **Audit Requirements** | Snapshot id |

---

## 7. Capacity KPIs

### CAP-01 — Portfolio Utilisation %

| Field | Certification |
|-------|---------------|
| **Business Name** | Resource Utilisation % (Portfolio) |
| **Business Definition** | Σ actual_hours / Σ available_hours across capacity snapshots in scope. |
| **Business Purpose** | Team load overview. |
| **Calculation Owner** | EWM Capacity |
| **Calculation Engine** | Capacity |
| **Source Data** | Capacity snapshots |
| **Refresh Frequency** | Snapshot cadence |
| **Industry Applicability** | All |
| **Drill-down Path** | Heatmap / RES-02 |
| **Reporting Usage** | Capacity |
| **Dashboard Usage** | Resource Health |
| **AI Usage** | Cite CAP |
| **Alert Thresholds** | `THR-CAP-01` |
| **Trend Behaviour** | Period series |
| **Audit Requirements** | Snapshot set |

### CAP-02 — Capacity Remaining (Hours)

| Field | Certification |
|-------|---------------|
| **Business Name** | Capacity Remaining (h) |
| **Business Definition** | max(0, Σ available_hours − Σ booked_hours) in scope. |
| **Business Purpose** | Which teams have capacity? |
| **Calculation Owner** | EWM Capacity |
| **Calculation Engine** | Capacity |
| **Source Data** | Capacity snapshots |
| **Refresh Frequency** | On planning/snapshot |
| **Industry Applicability** | All |
| **Drill-down Path** | Idle/available resources |
| **Reporting Usage** | Capacity plan |
| **Dashboard Usage** | Resource Health |
| **AI Usage** | Allocation suggestions (non-mutating) |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Period |
| **Audit Requirements** | Snapshot id |

### CAP-03 — Capacity Overloads Count

| Field | Certification |
|-------|---------------|
| **Business Name** | Capacity Overloads |
| **Business Definition** | Count of resources with utilisation_pct > 100 in latest snapshots. |
| **Business Purpose** | Which teams are overloaded? |
| **Calculation Owner** | EWM Capacity |
| **Calculation Engine** | Capacity |
| **Source Data** | Capacity snapshots |
| **Refresh Frequency** | Snapshot cadence |
| **Industry Applicability** | All |
| **Drill-down Path** | Overloaded list |
| **Reporting Usage** | Overload |
| **Dashboard Usage** | Attention / Resource Health |
| **AI Usage** | Rebalance suggestions |
| **Alert Thresholds** | `THR-CAP-03` |
| **Trend Behaviour** | Rising = worse |
| **Audit Requirements** | Snapshot id |

### CAP-04 — Idle Resources Count

| Field | Certification |
|-------|---------------|
| **Business Name** | Idle Resources |
| **Business Definition** | Count where available_hours > 0 and actual/available < idle threshold (default 20%). |
| **Business Purpose** | Spare capacity identification. |
| **Calculation Owner** | EWM Capacity |
| **Calculation Engine** | Capacity |
| **Source Data** | Capacity snapshots |
| **Refresh Frequency** | Snapshot cadence |
| **Industry Applicability** | All |
| **Drill-down Path** | Idle list |
| **Reporting Usage** | Bench report |
| **Dashboard Usage** | Resource Health |
| **AI Usage** | Fill suggestions |
| **Alert Thresholds** | `THR-CAP-04` |
| **Trend Behaviour** | Context-dependent |
| **Audit Requirements** | Threshold version |

---

## 8. Clocking KPIs

### CLK-01 — Open Clock Sessions

| Field | Certification |
|-------|---------------|
| **Business Name** | Open Clock Sessions |
| **Business Definition** | Count of clock sessions not closed (clocked in / on break). |
| **Business Purpose** | Live presence control. |
| **Calculation Owner** | EWM Clocking |
| **Calculation Engine** | Clock session engine |
| **Source Data** | Clock sessions |
| **Refresh Frequency** | Near real-time on clock events |
| **Industry Applicability** | Industries using clocking |
| **Drill-down Path** | `/work/clocking` |
| **Reporting Usage** | Attendance |
| **Dashboard Usage** | Clocking Status |
| **AI Usage** | Exception detect only |
| **Alert Thresholds** | `THR-CLK-01` |
| **Trend Behaviour** | Intraday |
| **Audit Requirements** | Clock event audit |

### CLK-02 — Missing Clock-outs

| Field | Certification |
|-------|---------------|
| **Business Name** | Missing Clock-outs |
| **Business Definition** | Open sessions past expected end / policy orphan window. |
| **Business Purpose** | Attendance exception. |
| **Calculation Owner** | EWM Clocking |
| **Calculation Engine** | Clocking exception rules |
| **Source Data** | Clock sessions |
| **Refresh Frequency** | Scheduled sweep + events |
| **Industry Applicability** | Clocking industries |
| **Drill-down Path** | Clocking exceptions |
| **Reporting Usage** | Attendance exceptions |
| **Dashboard Usage** | Attention |
| **AI Usage** | Flag only; no auto-close |
| **Alert Thresholds** | `THR-CLK-02` |
| **Trend Behaviour** | Daily |
| **Audit Requirements** | Exception disposition |

### CLK-03 — Clocked Hours (Period)

| Field | Certification |
|-------|---------------|
| **Business Name** | Clocked Hours (Period) |
| **Business Definition** | Σ closed session durations in period (operational attendance hours). **Not payslip hours.** |
| **Business Purpose** | Attendance volume. |
| **Calculation Owner** | EWM Clocking |
| **Calculation Engine** | Clocking |
| **Source Data** | Closed sessions |
| **Refresh Frequency** | On clock_out |
| **Industry Applicability** | Clocking industries |
| **Drill-down Path** | Sessions list |
| **Reporting Usage** | Attendance |
| **Dashboard Usage** | Optional |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Period series |
| **Audit Requirements** | Session ids |

---

## 9. Payroll KPIs

### PAY-01 — Time Approvals Outstanding

| Field | Certification |
|-------|---------------|
| **Business Name** | Approvals Ageing / Pending Time Approvals |
| **Business Definition** | Count (and age buckets) of time entries in `submitted` awaiting approval. |
| **Business Purpose** | Which payroll approvals are outstanding? (input gate — not payslip) |
| **Calculation Owner** | EWM Time Approval pattern |
| **Calculation Engine** | Time workflow |
| **Source Data** | `ewm_time_entries` |
| **Refresh Frequency** | On submit/approve/reject |
| **Industry Applicability** | All using time→payroll path |
| **Drill-down Path** | `/work/time` |
| **Reporting Usage** | Approval backlog |
| **Dashboard Usage** | Pending Approvals |
| **AI Usage** | Ageing narrative; no auto-approve |
| **Alert Thresholds** | `THR-PAY-01` |
| **Trend Behaviour** | Rising = blocker |
| **Audit Requirements** | Approval actor audit in Time |

### PAY-02 — Payroll Inputs Ready (Hours)

| Field | Certification |
|-------|---------------|
| **Business Name** | Payroll Inputs Ready (not payslip) |
| **Business Definition** | Approved/locked hours (and classified OT flags) ready for payroll adapter export. |
| **Business Purpose** | Payroll run readiness signal. |
| **Calculation Owner** | EWM Payroll Adapter facts |
| **Calculation Engine** | Adapter (does not calculate PAYE/net) |
| **Source Data** | Adapter-ready time facts |
| **Refresh Frequency** | On approve/lock |
| **Industry Applicability** | Employee payroll path |
| **Drill-down Path** | Adapter export / Payroll intake |
| **Reporting Usage** | Payroll readiness |
| **Dashboard Usage** | Payroll due signal |
| **AI Usage** | Readiness only |
| **Alert Thresholds** | `THR-PAY-02` |
| **Trend Behaviour** | Period |
| **Audit Requirements** | Adapter batch ids |

### PAY-03 — Payslip Net Pay (Payroll)

| Field | Certification |
|-------|---------------|
| **Business Name** | Net Pay (Payroll) |
| **Business Definition** | Employee net pay per certified Payroll engine for run/period. |
| **Business Purpose** | Statutory/payroll outcome — **never computed in EWM/dashboard**. |
| **Calculation Owner** | **Payroll** |
| **Calculation Engine** | Frozen Payroll statutory engine |
| **Source Data** | Payslips / payroll run |
| **Refresh Frequency** | On payroll finalisation |
| **Industry Applicability** | Employers |
| **Drill-down Path** | Payroll Command Centre / payslip |
| **Reporting Usage** | Payroll reports |
| **Dashboard Usage** | Payroll surfaces only (not EWM invent) |
| **AI Usage** | Forbidden to recompute |
| **Alert Thresholds** | Payroll module thresholds |
| **Trend Behaviour** | Run-based |
| **Audit Requirements** | Full payroll audit trail |

### PAY-04 — PAYE / UIF / SDL (Payroll)

| Field | Certification |
|-------|---------------|
| **Business Name** | Statutory Deductions (Payroll) |
| **Business Definition** | PAYE, UIF, SDL (and related) per Payroll legislation engine. |
| **Business Purpose** | Compliance amounts. |
| **Calculation Owner** | **Payroll** |
| **Calculation Engine** | Statutory engine |
| **Source Data** | Payroll run |
| **Refresh Frequency** | On finalisation |
| **Industry Applicability** | SA employers (legislation packs) |
| **Drill-down Path** | Payroll statutory reports |
| **Reporting Usage** | EMP201 etc. |
| **Dashboard Usage** | Payroll only |
| **AI Usage** | Forbidden to recompute |
| **Alert Thresholds** | Payroll |
| **Trend Behaviour** | Run-based |
| **Audit Requirements** | Legislation version pins |

---

## 10. Accounting KPIs (Read-only to EWM/Executive)

### ACC-01 — Recognised Revenue (Accounting)

| Field | Certification |
|-------|---------------|
| **Business Name** | Recognised Revenue (Accounting) |
| **Business Definition** | Revenue recognised in GL for period/scope. |
| **Business Purpose** | What revenue has been earned (financial)? |
| **Calculation Owner** | **Accounting** |
| **Calculation Engine** | Recognition / GL |
| **Source Data** | GL / recognition |
| **Refresh Frequency** | On journal/recognition |
| **Industry Applicability** | All |
| **Drill-down Path** | Accounting reports |
| **Reporting Usage** | FS / project revenue |
| **Dashboard Usage** | Financial Readiness (read-only) |
| **AI Usage** | Cite Accounting |
| **Alert Thresholds** | Accounting policies |
| **Trend Behaviour** | Period |
| **Audit Requirements** | Journal audit |

### ACC-02 — Profit (Accounting)

| Field | Certification |
|-------|---------------|
| **Business Name** | Profit (Accounting) |
| **Business Definition** | Financial statement / project P&L profit per Accounting. |
| **Business Purpose** | Financial profitability. |
| **Calculation Owner** | **Accounting** |
| **Calculation Engine** | GL P&L |
| **Source Data** | GL |
| **Refresh Frequency** | Period close / journals |
| **Industry Applicability** | All |
| **Drill-down Path** | P&L |
| **Reporting Usage** | Financial statements |
| **Dashboard Usage** | Dual-authority economics only |
| **AI Usage** | Cite Accounting; never merge with FCT-03 |
| **Alert Thresholds** | `THR-EXE-05` related |
| **Trend Behaviour** | Period |
| **Audit Requirements** | Period lock |

### ACC-03 — Cash Position (Accounting)

| Field | Certification |
|-------|---------------|
| **Business Name** | Cash Position (Accounting) |
| **Business Definition** | Cash and bank balances per Accounting. |
| **Business Purpose** | Liquidity readiness. |
| **Calculation Owner** | **Accounting** |
| **Calculation Engine** | Cash/bank aggregates |
| **Source Data** | Bank/cash accounts |
| **Refresh Frequency** | Bank sync / journals |
| **Industry Applicability** | All |
| **Drill-down Path** | Bank accounts |
| **Reporting Usage** | Cash reports |
| **Dashboard Usage** | Financial Readiness (read-only) |
| **AI Usage** | Cite only |
| **Alert Thresholds** | `THR-ACC-03` |
| **Trend Behaviour** | Daily |
| **Audit Requirements** | Financial access audit |

### ACC-04 — Outstanding AP (Accounting)

| Field | Certification |
|-------|---------------|
| **Business Name** | Outstanding AP (Accounting) |
| **Business Definition** | Open supplier/payable balances. |
| **Business Purpose** | Supplier payment obligations. |
| **Calculation Owner** | **Accounting** |
| **Calculation Engine** | AP ledger |
| **Source Data** | Bills / AP |
| **Refresh Frequency** | On bill/payment |
| **Industry Applicability** | All |
| **Drill-down Path** | AP ageing |
| **Reporting Usage** | Creditors |
| **Dashboard Usage** | Financial Readiness |
| **AI Usage** | Cite only |
| **Alert Thresholds** | `THR-ACC-04` |
| **Trend Behaviour** | Rising = outflow pressure |
| **Audit Requirements** | Period cut |

---

## 11. Risk KPIs

### RSK-01 — Open Delivery Risk Score

| Field | Certification |
|-------|---------------|
| **Business Name** | Delivery Risk (Open Score) |
| **Business Definition** | Aggregate score of open delivery risks (sum or weighted per Risk rules). |
| **Business Purpose** | Portfolio risk pressure. |
| **Calculation Owner** | EWM Risk |
| **Calculation Engine** | Risk register |
| **Source Data** | Open risks |
| **Refresh Frequency** | On risk change |
| **Industry Applicability** | All |
| **Drill-down Path** | Risk register |
| **Reporting Usage** | Risk |
| **Dashboard Usage** | Risks section |
| **AI Usage** | Explain top risks |
| **Alert Thresholds** | `THR-RSK-01` |
| **Trend Behaviour** | Rising = worse |
| **Audit Requirements** | Risk mutations |

### RSK-02 — Unacknowledged Budget Alerts

| Field | Certification |
|-------|---------------|
| **Business Name** | Unacknowledged Budget Alerts |
| **Business Definition** | Count of unacknowledged `ewm_budget_alerts` (or successor). |
| **Business Purpose** | Explicit escalations awaiting ack. |
| **Calculation Owner** | EWM Alerts |
| **Calculation Engine** | Alert rules |
| **Source Data** | Budget alerts |
| **Refresh Frequency** | On alert publish/ack |
| **Industry Applicability** | All |
| **Drill-down Path** | Alert → project |
| **Reporting Usage** | Escalations |
| **Dashboard Usage** | Executive Alerts |
| **AI Usage** | Prioritise; no auto-ack |
| **Alert Thresholds** | `THR-RSK-02` |
| **Trend Behaviour** | Rising = governance lag |
| **Audit Requirements** | Ack actor |

---

## 12. Client KPIs

### CLI-01 — Clients Requiring Attention

| Field | Certification |
|-------|---------------|
| **Business Name** | Clients Requiring Attention |
| **Business Definition** | Count of clients with ≥1 attention driver (overdue milestone, budget risk, unbilled lag, AR ageing flag) in company scope. |
| **Business Purpose** | Which clients need attention? |
| **Calculation Owner** | EWM Analytics composition (+ client master) |
| **Calculation Engine** | Client attention composer |
| **Source Data** | PRJ-04, OPS-04, SAL-03, SAL-02 linked via client |
| **Refresh Frequency** | On driver events |
| **Industry Applicability** | All |
| **Drill-down Path** | Client → projects / AR |
| **Reporting Usage** | Client health |
| **Dashboard Usage** | Client attention |
| **AI Usage** | Rank clients; cite drivers |
| **Alert Thresholds** | `THR-CLI-01` |
| **Trend Behaviour** | Rising = relationship risk |
| **Audit Requirements** | Driver set version |

### CLI-02 — Client Operational Cost (EWM)

| Field | Certification |
|-------|---------------|
| **Business Name** | Client Operational Cost (EWM) |
| **Business Definition** | Σ OPS-01 attributed to client via project/engagement link. |
| **Business Purpose** | Client delivery cost. |
| **Calculation Owner** | EWM Costing |
| **Calculation Engine** | Cost rollups by client |
| **Source Data** | Cost facts + client link |
| **Refresh Frequency** | On cost lock |
| **Industry Applicability** | All |
| **Drill-down Path** | Client cost breakdown |
| **Reporting Usage** | Client profitability ops |
| **Dashboard Usage** | Client drill |
| **AI Usage** | Cite OPS |
| **Alert Thresholds** | Via client margin policy |
| **Trend Behaviour** | Cumulative |
| **Audit Requirements** | Attribution path |

---

## 13. Productivity KPIs

### PRD-01 — Billable Hours Ratio

| Field | Certification |
|-------|---------------|
| **Business Name** | Billable Hours Ratio |
| **Business Definition** | Billable locked hours / total locked hours in period. |
| **Business Purpose** | Productivity of time mix. |
| **Calculation Owner** | EWM Time |
| **Calculation Engine** | Time analytics (consume locked facts) |
| **Source Data** | Locked time entries |
| **Refresh Frequency** | On lock |
| **Industry Applicability** | Professional services / billable industries |
| **Drill-down Path** | Time by billable flag |
| **Reporting Usage** | Utilisation productivity |
| **Dashboard Usage** | Optional productivity |
| **AI Usage** | Narrative |
| **Alert Thresholds** | `THR-PRD-01` |
| **Trend Behaviour** | Period series |
| **Audit Requirements** | Period definition |

### PRD-02 — Throughput — Completed Milestones

| Field | Certification |
|-------|---------------|
| **Business Name** | Completed Milestones (Period) |
| **Business Definition** | Count of milestones completed in period. |
| **Business Purpose** | Delivery throughput. |
| **Calculation Owner** | EWM Milestones |
| **Calculation Engine** | Milestone registry |
| **Source Data** | Milestones |
| **Refresh Frequency** | On complete |
| **Industry Applicability** | All |
| **Drill-down Path** | Completed list |
| **Reporting Usage** | Throughput |
| **Dashboard Usage** | Optional |
| **AI Usage** | Read-only |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Period series |
| **Audit Requirements** | Completion actor |

---

## 14. Forecast KPIs

### FCT-01 — Forecast Cost (EWM)

| Field | Certification |
|-------|---------------|
| **Business Name** | Forecast Cost (EWM) |
| **Business Definition** | Operational cost to complete: burn to date + remaining effort × operational rates (+ known consumptions). |
| **Business Purpose** | Forward cost view. |
| **Calculation Owner** | EWM Forecast |
| **Calculation Engine** | Forecast engine (consumes OPS rollups; does not recompute cost facts) |
| **Source Data** | Cost rollups + remaining plan |
| **Refresh Frequency** | On `work.forecast_updated` |
| **Industry Applicability** | All |
| **Drill-down Path** | Forecast breakdown |
| **Reporting Usage** | Forecast |
| **Dashboard Usage** | Forecast Profitability |
| **AI Usage** | Explain; no silent rewrite |
| **Alert Thresholds** | Via FCT-03 |
| **Trend Behaviour** | Forecast versions |
| **Audit Requirements** | Forecast version id |

### FCT-02 — Forecast Revenue (Operational — not recognised)

| Field | Certification |
|-------|---------------|
| **Business Name** | Forecast Revenue (Operational — not recognised) |
| **Business Definition** | Operational projection of billable/contract earn-out. **Must never be labelled Recognised.** |
| **Business Purpose** | Forward revenue (ops). |
| **Calculation Owner** | EWM Forecast |
| **Calculation Engine** | Forecast |
| **Source Data** | Contract snapshot + billing plan / progress policy |
| **Refresh Frequency** | On forecast_updated |
| **Industry Applicability** | All |
| **Drill-down Path** | Forecast revenue drivers |
| **Reporting Usage** | Forecast |
| **Dashboard Usage** | Dual series only |
| **AI Usage** | Label enforcement |
| **Alert Thresholds** | Informational |
| **Trend Behaviour** | Versioned |
| **Audit Requirements** | Policy id |

### FCT-03 — Forecast Margin (Operational)

| Field | Certification |
|-------|---------------|
| **Business Name** | Forecast Margin (Operational) |
| **Business Definition** | Per company policy (exactly one): (a) FCT-02 − FCT-01 **or** (b) Contract Value − FCT-01. |
| **Business Purpose** | Forecast operational profitability. |
| **Calculation Owner** | EWM Forecast |
| **Calculation Engine** | Forecast |
| **Source Data** | FCT-01, FCT-02, COM-01 |
| **Refresh Frequency** | On forecast_updated |
| **Industry Applicability** | All |
| **Drill-down Path** | Project/portfolio forecast |
| **Reporting Usage** | Margin |
| **Dashboard Usage** | Forecast Profitability (never bare “Profit”) |
| **AI Usage** | `ai.work.margin_risk` |
| **Alert Thresholds** | `THR-FCT-03` |
| **Trend Behaviour** | Versioned |
| **Audit Requirements** | Policy choice (a|b) frozen per company |

---

## 15. Explicit Non-KPIs (Forbidden)

| Alias | Reason | Use instead |
|-------|--------|-------------|
| Expected Gross Profit | Dashboard-invented; no owner | FCT-03 and/or ACC-02 |
| Profit (unqualified) | Ambiguous authority | ACC-02 or FCT-03 |
| Margin (unqualified) | Ambiguous | FCT-03 or Accounting gross margin if certified later |
| Revenue (unqualified) | Ambiguous | ACC-01 / SAL-01 / FCT-02 |
| Operational Burn (as duplicate of incurred total) | Confuses OPS-01 vs OPS-02 | Use correct id |

---

## 16. Catalogue Result

**ENTERPRISE KPI CATALOGUE CERTIFIED** as the single definitional source of truth.

Count certified: **40 KPI IDs** across Executive, Commercial, Sales, Operational, Project, Resource, Capacity, Clocking, Payroll, Accounting, Risk, Client, Productivity, and Forecast domains.
