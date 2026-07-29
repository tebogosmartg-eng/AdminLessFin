# 06 — Analytics Architecture Report

**Module:** Enterprise Work Management — Analytics  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board verdict:** APPROVED  

---

## 1. Purpose

Provide real-time operational intelligence as the **executive control centre**, without recalculating Payroll, Accounting, or Capacity/Costing engines.

---

## 2. Principle: Facts In, Views Out

```
Time Engine ──┐
Capacity ─────┼──→ ewm_analytics_facts ──→ Dashboards / Reports / AI hooks
Costing ──────┤
OKR ──────────┤
Resource ─────┘
```

Analytics **aggregates and presents**. It does not redefine hours, capacity, cost, or OKR scores.

---

## 3. Executive Surfaces

| Surface | Answers |
|---------|---------|
| Executive Dashboard | What are we doing? Cost? Schedule? Objectives? |
| Capacity Heatmap | Who is overloaded / idle? |
| Utilisation | Actual / Available by team, role, person |
| Project Burn | Cost & effort burn vs plan |
| Budget Burn | Operational budget consumption |
| Deadline Risk | Milestones/tasks at risk |
| Idle Time | Available − Actual (and − Booked) |
| Resource Forecast | Future booked vs available |
| Objective Progress | OKR scores & at-risk |
| Portfolio Health | Composite delivery + cost + risk |
| Team Velocity | Completed effort / throughput per period |

---

## 4. Fact Schema (Logical)

`ewm_analytics_facts` grain examples:

- employee_day  
- team_week  
- project_week  
- portfolio_month  
- objective_period  
- client_month  

Measures are **copied from upstream engines** at computation time (or via incremental projection).

---

## 5. Risk Scores (Operational)

| Risk | Inputs |
|------|--------|
| Deadline | remaining effort, capacity on assignees, milestone date |
| Budget | forecast complete cost vs budget |
| Overload | allocation ratio |
| Objective | KR trajectory vs time elapsed |
| Client concentration | % capacity on single client |

Risk engines live in Analytics as **derived operational scores**, documented and versioned — not accounting impairment.

---

## 6. Reporting Integration

- New pack under `src/reporting/reports/work/`  
- Register with reporting platform registry (additive)  
- **Do not** modify locked payroll report builders or VIP adapters  
- Export uses existing export framework patterns where available  

---

## 7. Performance

- Materialized rollups for heatmap and executive tiles  
- Incremental update on time lock / allocation confirm / OKR update  
- Multi-company: always filter `company_id`  

---

## 8. Board Decision

**APPROVED.** Analytics is a read-model over isolated EWM engines; frozen Reporting adapters remain untouched.
