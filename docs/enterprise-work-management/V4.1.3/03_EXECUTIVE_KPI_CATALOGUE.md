# 03 — Executive KPI Catalogue

**Board:** Independent Principal Executive Experience Board  
**Version:** 4.1.3  
**Date:** 2026-07-13  

Certified catalogue of executive KPIs for the Operations Dashboard. Extends V4.1.2 §3 Metric Catalogue with presentation, readiness, and 30-second mapping.

---

## 1. Labelling Invariant

Every money KPI **must** carry an authority suffix in the UI label:

| Suffix | Meaning |
|--------|---------|
| `(Commercial)` | Contract / engagement SoT snapshot |
| `(Sales)` | Invoicing / billing |
| `(Accounting)` | GL / recognition / cash / FS |
| `(EWM)` | Operational cost, forecast, capacity |
| `(Operational)` | Billing/ops signal — not recognised |

**Forbidden:** bare “Profit”, “Margin”, “Revenue”, or “Expected Gross Profit” without authority.

---

## 2. Catalogue

| KPI ID | Display label (mandatory) | Definition | Authority | Source | 30s question | `/work` today |
|--------|---------------------------|------------|-----------|--------|--------------|---------------|
| `EWM-KPI-01` | Active Work Count | Count of projects with `status=active` | EWM | `ewm_projects` | Active work | LIVE |
| `EWM-KPI-02` | Pipeline Value (Commercial) | Σ contract_value where `status=pipeline` | Commercial snapshot | `ewm_projects` | Secured pipeline | PARTIAL (unlabelled) |
| `EWM-KPI-03` | Awarded Contract Value (Commercial) | Σ contract_value where `status=active` (+ variations when present) | Commercial snapshot | `ewm_projects` | Secured awarded | PARTIAL |
| `ACC-KPI-01` | Recognised Revenue (Accounting) | Period / YTD recognised revenue | Accounting | GL / Accounting read | Earned revenue | MISSING |
| `SAL-KPI-01` | Invoiced (Sales) | Period invoiced amount | Sales | Sales invoices | Earned/billed bridge | MISSING |
| `EWM-KPI-04` | Unbilled Work (Operational) | Locked billable value without timesheet/invoice bridge | EWM / Billing signal | Time facts | Attention / cash conversion | PARTIAL (attention only) |
| `EWM-KPI-05` | Operational Cost (EWM) | Σ `ewm_cost_rollups.amount` (period or ITD policy) | EWM | Cost rollups | Op costs | LIVE (duplicate burn tile) |
| `EWM-KPI-06` | Forecast Cost (EWM) | Forecast engine remaining + burn | EWM | Forecast | Forecast profit inputs | MISSING on exec |
| `EWM-KPI-07` | Forecast Revenue (Operational — not recognised) | Ops earn-out projection | EWM | Forecast | Forecast profit | MISSING |
| `EWM-KPI-08` | Forecast Margin (Operational) | Certified forecast formula per company policy | EWM | Forecast | Forecast profit | **REJECTED substitute** present |
| `ACC-KPI-02` | Profit (Accounting) | FS / project P&L profit | Accounting | GL | Forecast vs FS dual view | MISSING |
| `ACC-KPI-03` | Cash Position (Accounting) | Cash & bank balances | Accounting | Accounts / bank | Cash | MISSING on `/work` |
| `SAL-KPI-02` | Outstanding Invoices (Sales/AR) | Open AR | Sales/Accounting | AR read | Outstanding invoices | MISSING (stub) |
| `ACC-KPI-04` | Outstanding AP (Accounting) | Open supplier balances | Accounting | AP read | Supplier attention | MISSING (stub) |
| `EWM-KPI-09` | Resource Utilisation % | actual_hours / available_hours | EWM | Capacity snapshots | Overload/available | LIVE |
| `EWM-KPI-10` | Capacity Remaining (h) | max(0, available − booked) | EWM | Capacity | Available | LIVE |
| `EWM-KPI-11` | Capacity Overloads | Count utilisation_pct > 100 | EWM | Capacity | Overloaded | PARTIAL (attention) |
| `EWM-KPI-12` | Idle Resources | Low actual/available ratio | EWM | Capacity | Available | PARTIAL (attention) |
| `EWM-KPI-13` | Budgets at Risk | Burn ≥ threshold (e.g. 85%) of operational_budget | EWM | Cost + project | At risk | PARTIAL |
| `EWM-KPI-14` | Delivery Risk Score | Open risks aggregate | EWM | Risk register | At risk | MISSING |
| `EWM-KPI-15` | Approvals Ageing | Submitted time entries by age bucket | EWM | Time entries | Payroll due / attention | PARTIAL (count only) |
| `EWM-KPI-16` | Payroll Inputs Ready (not payslip) | Approved/locked hours ready for adapter | EWM adapter | Adapter facts | Payroll due | MISSING |
| `EWM-KPI-17` | Open Clock Sessions | Active / missing clock-outs | EWM Clocking | Clock sessions | Attention / capacity | MISSING |
| `EWM-KPI-18` | Loss-Making Work (Operational) | Projects where Forecast Margin < 0 **or** Contract − Forecast Cost < 0 (policy) | EWM | Forecast + rollups | Losing money | MISSING |
| `ACC-KPI-05` | Loss-Making Work (Accounting) | Projects with negative Accounting P&L | Accounting | GL | Losing money | MISSING |
| `EWM-KPI-19` | Clients Requiring Attention | Clients with overdue milestones / budget risk / unbilled | EWM + CRM/client master | Composition | Clients | MISSING |
| `EWM-KPI-20` | Attention Queue Depth | Count of severity-ranked attention items | EWM Analytics | Attention builder | Today’s focus | LIVE |

---

## 3. Rejected / Non-Conforming KPIs (Must Remove or Relabel)

| Current label | Why rejected | Required replacement |
|---------------|--------------|----------------------|
| Expected Gross Profit | No authority; dashboard-computed contract − costs | Forecast Margin (Operational) from forecast engine **or** dual tiles with Accounting Profit |
| Operational Burn (duplicate of Costs Incurred) | Confuses rate vs incurred total | Single Operational Cost (EWM); optional separate burn-rate KPI if periodised |

---

## 4. Industry Configuration

KPIs are **industry-agnostic**. Industry packs may:

- Rename “Project” → Job / Engagement / Matter / Case in labels only  
- Reorder widget packs  
- Adjust default risk thresholds (config, not hard-coded engines)

Industry packs may **not** invent new profit formulas or bypass Accounting.

---

## 5. Catalogue Result

**Executive KPI Catalogue CERTIFIED** as the target measurement set.  
**Current `/work` KPI strip is NOT catalogue-compliant.**
