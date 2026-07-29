# 02 — KPI Ownership Matrix

**Board:** Independent Principal Enterprise Performance Management Board  
**Version:** 4.1.5  
**Date:** 2026-07-13  

---

## 1. Ownership Planes (Frozen)

| Plane | May calculate | Must not |
|-------|---------------|----------|
| **Commercial / Engagement** | COM-* | Operational cost, PAYE, recognition |
| **Sales** | SAL-01, SAL-02 (AR as implemented) | EWM cost math, Payroll |
| **EWM Costing** | OPS-*, PRJ-01, CLI-02 | Journals, payslip math |
| **EWM Forecast** | FCT-*, EXE-03/04, PRJ-03 | Recognised revenue, FS profit |
| **EWM Capacity / Resource** | CAP-*, RES-* | Payroll rates as silent op rates |
| **EWM Clocking** | CLK-* | Auto payroll, journals |
| **EWM Time / Adapter** | PAY-01, PAY-02 | PAY-03, PAY-04 |
| **EWM Risk / Alerts / Analytics** | RSK-*, EXE-01/02, CLI-01, PRD-* composition | Invent financial KPIs |
| **Payroll** | PAY-03, PAY-04 | Be bypassed by EWM |
| **Accounting** | ACC-* | Be recalculated by dashboard/EWM |
| **Dashboard / Report / API / AI** | **None** — consume published KPI values | Invent definitions or financial formulas |

---

## 2. Matrix (KPI → Owner → Engine → Consumers)

| KPI ID | Business Name | Calculation Owner | Engine | Primary consumers |
|--------|---------------|-------------------|--------|-------------------|
| EXE-01 | Attention Queue Depth | EWM Analytics | Attention builder | Exec dash, AI focus |
| EXE-02 | Business Health Index | EWM Analytics | Health composer | Exec dash |
| EXE-03 | Making Money Count (Ops) | EWM Forecast | Forecast | Exec dash, AI |
| EXE-04 | Losing Money Count (Ops) | EWM Forecast | Forecast | Exec dash, AI |
| EXE-05 | Losing Money Count (Acc) | Accounting | GL P&L | Exec dash (RO), FD |
| COM-01 | Contract Value (Commercial) | Commercial | Contract | Economics, Forecast |
| COM-02 | Approved Variations | Commercial | Variations | Economics |
| COM-03 | Pipeline Value | Commercial (+ EWM snapshot agg) | Pipeline | Exec dash |
| COM-04 | Awarded Contract Value | Commercial | Contract policy | Exec dash |
| SAL-01 | Invoiced (Sales) | Sales | Invoicing | Dash RO, reports |
| SAL-02 | Outstanding Receivables | Sales/Accounting AR | AR | Dash RO, FD |
| SAL-03 | Unbilled Work (Operational) | EWM Billing signal | Time/billing bridge | Attention, Sales CTA |
| OPS-01 | Operational Cost (EWM) | EWM Costing | Cost rollups | All ops surfaces |
| OPS-02 | Operational Burn Rate | EWM Costing | Periodisation | Ops dash |
| OPS-03 | Active Work Count | EWM Projects | Registry | Exec / portfolio |
| OPS-04 | Budgets at Risk | EWM Costing/Budget | Budget rules | Attention, alerts |
| PRJ-01 | Project Burn % | EWM Costing | Costing | Project CC |
| PRJ-02 | Project Progress % | EWM Projects | Progress rules | Project CC |
| PRJ-03 | Project Forecast Margin | EWM Forecast | Forecast | Project CC |
| PRJ-04 | Overdue Milestones | EWM Milestones | Milestone registry | Attention |
| RES-01 | Active Resources | EWM Resource | Registry | Resources |
| RES-02 | Resource Utilisation % | EWM Capacity | Snapshots | Heatmap |
| CAP-01 | Portfolio Utilisation % | EWM Capacity | Snapshots | Resource Health |
| CAP-02 | Capacity Remaining (h) | EWM Capacity | Snapshots | Resource Health |
| CAP-03 | Capacity Overloads | EWM Capacity | Snapshots | Attention |
| CAP-04 | Idle Resources | EWM Capacity | Snapshots | Attention |
| CLK-01 | Open Clock Sessions | EWM Clocking | Sessions | Clocking Status |
| CLK-02 | Missing Clock-outs | EWM Clocking | Exceptions | Attention |
| CLK-03 | Clocked Hours | EWM Clocking | Sessions | Attendance |
| PAY-01 | Time Approvals Outstanding | EWM Time | Approval workflow | Pending Approvals |
| PAY-02 | Payroll Inputs Ready | EWM Adapter | Adapter facts | Payroll readiness |
| PAY-03 | Net Pay | **Payroll** | Statutory payroll | Payroll CC |
| PAY-04 | PAYE/UIF/SDL | **Payroll** | Statutory payroll | Payroll reports |
| ACC-01 | Recognised Revenue | **Accounting** | GL/recognition | Dash RO |
| ACC-02 | Profit (Accounting) | **Accounting** | GL P&L | Dash RO |
| ACC-03 | Cash Position | **Accounting** | Cash/bank | Dash RO |
| ACC-04 | Outstanding AP | **Accounting** | AP | Dash RO |
| RSK-01 | Delivery Risk Score | EWM Risk | Risk register | Risks |
| RSK-02 | Unacked Budget Alerts | EWM Alerts | Alert rules | Executive Alerts |
| CLI-01 | Clients Requiring Attention | EWM Analytics | Client composer | Exec / MD |
| CLI-02 | Client Operational Cost | EWM Costing | Rollups | Client reports |
| PRD-01 | Billable Hours Ratio | EWM Time | Time analytics | Productivity |
| PRD-02 | Completed Milestones | EWM Milestones | Registry | Throughput |
| FCT-01 | Forecast Cost | EWM Forecast | Forecast | Economics |
| FCT-02 | Forecast Revenue (Ops) | EWM Forecast | Forecast | Economics |
| FCT-03 | Forecast Margin (Ops) | EWM Forecast | Forecast | Economics, AI |

---

## 3. Duplication Control

| Risk | Control |
|------|---------|
| Dashboard recomputes contract − cost as profit | Forbidden; use FCT-03 / ACC-02 |
| OPS-01 labelled as burn rate | Use OPS-02 for rate; OPS-01 for incurred |
| EWM displays “Recognised” from forecast | Forbidden; ACC-01 only |
| Payroll net from clock hours in EWM | Forbidden; PAY-03 only |
| Analytics recalculates labour_cost | Forbidden; consume rollups |
| Two forecast margin formulas active | One company policy (a or b) for FCT-03 |

---

## 4. Multi-Company / Multi-Industry

| Concern | Rule |
|---------|------|
| Default scope | Active `company_id` |
| Cross-company | Platform multi-company role; aggregate published KPI values; no cross-company mutation |
| Currency | Company currency; no silent FX in EWM |
| Industry | Label + threshold packs only; same KPI IDs |

---

## 5. Result

**KPI OWNERSHIP MATRIX CERTIFIED.**
