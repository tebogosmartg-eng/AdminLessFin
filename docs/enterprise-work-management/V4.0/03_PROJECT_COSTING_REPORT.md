# 03 — Project Costing Report

**Module:** Enterprise Work Management — Operational Costing Engine  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board verdict:** APPROVED  

---

## 1. Purpose

Every time entry contributes automatically to **operational** costing:

- Project Cost  
- Client Cost  
- Department Cost  
- Labour Cost  
- Payroll Cost **reference** (from frozen payroll facts when available)  
- Budget Consumption  
- Operational Profitability  

---

## 2. Hard Boundary: Operational vs Accounting

| Operational Costing (EWM) | Accounting (FROZEN) |
|---------------------------|---------------------|
| Rate × hours = labour cost fact | Journal entries, GL balances |
| Budget burn vs project budget | Revenue recognition rules |
| Client resource consumption | AR/AP, VAT |
| Margin signal (billable value − op. cost) | Financial statements |
| Department cost rollup | Cost centre GL posting |

> **No accounting calculations may occur in EWM.**  
> Accounting consumes **finalized operational facts**; it does not recompute them, and EWM does not post journals.

---

## 3. Cost Fact Pipeline

```
Time Entry (Locked)
  → Resolve labour rate (role / employee / project override)
  → Compute labour_cost = hours × rate
  → Attribute to Project, Client, Department, Cost Centre
  → Update budget_consumed, remaining_budget
  → Emit ewm.cost_fact.created (BOE)
  → Available for Accounting / Billing / Analytics consumers
```

### Rate resolution order

1. Task override rate  
2. Project role rate  
3. Employee operational cost rate  
4. Company default role rate  

Rates are **operational** (planning/costing). They are not payroll rates and must not silently replace payslip calculations.

---

## 4. Profitability (Operational)

```
Billable Value   = billable_hours × billable_rate (project/client)
Operational Cost = Σ labour_cost (+ optional expense tags — read-only from Expenses)
Operational Margin = Billable Value − Operational Cost
Budget Remaining = Budget − Operational Cost
```

Expense amounts are **referenced** from Expenses module; EWM does not recalculate expense tax or GL.

---

## 5. Payroll Cost Reference

When a time entry is locked into a payroll period:

- EWM stores `payroll_period_id` and optional `payroll_cost_ref`  
- Actual employer labour cost from payroll (if exposed as a read-only fact) may be attached **after** payroll finalization  
- EWM never computes PAYE, UIF, SDL, or net pay  

This preserves freeze: payroll remains SoT for statutory/payroll cost; EWM remains SoT for operational delivery cost.

---

## 6. Budget & Burn

| Metric | Definition |
|--------|------------|
| Budget | Project/portfolio operational budget |
| Burn | Σ locked operational costs |
| Burn Rate | Burn / elapsed planned duration |
| Forecast Complete Cost | Burn + remaining effort × blended rate |
| At-Risk | Forecast > Budget × threshold |

---

## 7. Data Structures

- `ewm_rate_cards`  
- `ewm_project_budgets`  
- `ewm_cost_facts` (immutable once period locked)  
- `ewm_cost_rollups` (project/client/dept materialized)  
- `ewm_budget_alerts`

---

## 8. Quality Rules

- One cost fact per locked time entry (idempotent)  
- No duplicate rollup math in Analytics — consume `ewm_cost_rollups`  
- Corrections create compensating cost facts  

---

## 9. Board Decision

**APPROVED.** Operational Costing is isolated; Accounting and Payroll remain frozen consumers/producers of adjacent facts only.
