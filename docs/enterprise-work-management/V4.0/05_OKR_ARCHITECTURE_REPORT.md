# 05 — OKR Architecture Report

**Module:** Enterprise Work Management — Objectives Engine  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board verdict:** APPROVED  

---

## 1. Purpose

Every hour worked can contribute to a measurable objective.

```
Company Objective
  → Department Objective
    → Project Objective
      → Task
        → Time Entry
```

Executives answer: *Are we achieving company objectives?* — not only *Did people log hours?*

---

## 2. Model

### Objective

| Field | Description |
|-------|-------------|
| level | company \| department \| project \| team |
| parent_id | Hierarchy link |
| period | Quarter / year / custom |
| owner_id | Accountable person |
| status | draft \| active \| at_risk \| achieved \| missed \| cancelled |
| workspace_id / portfolio_id | Optional scope |

### Key Result

| Field | Description |
|-------|-------------|
| metric_type | numeric \| percent \| currency \| boolean |
| baseline, target, actual | Progress inputs |
| source | manual \| task_completion \| time_rollups \| external |
| weight | Contribution to objective score |

### Contribution link

`ewm_objective_links`: objective/KR ↔ project | milestone | task  

When time is locked against a linked task, `ewm_objective_contributions` records hours and optional KR increment rules.

---

## 3. Progress Calculation

```
KR Progress = f(actual, baseline, target)   # clamped 0–100%
Objective Score = Σ (KR Progress × weight) / Σ weights
Roll-up = weighted child objectives (department → company)
```

**Single authority:** OKR Engine. Dashboards consume scores; they do not redefine formulas.

---

## 4. Time → Objective

Rules (company-configurable):

| Mode | Behaviour |
|------|-----------|
| Attribution | Hours attribute to linked objectives for “effort on strategy” |
| Completion-driven | KR updates only on task/milestone completion |
| Hybrid | Hours for effort view; completion for KR actuals |

Time never creates financial OKRs (revenue/profit KR actuals come from Accounting/CRM **read-only facts** if linked).

---

## 5. Isolation

| OKR Engine | Must not |
|------------|----------|
| Own objective hierarchy & scores | Post journals |
| Emit at-risk events | Modify payroll |
| Read project/task/time facts | Duplicate capacity math |

---

## 6. Governance

- Company objectives require admin/owner role  
- Department objectives require department lead  
- Changes after period lock → compensating commentary + versioned objective revision  
- Full audit on score changes  

---

## 7. AI Hooks

- `ai.work.okr_risk` — which objectives will miss target  
- `ai.work.daily_focus` — tasks linked to at-risk KRs  

---

## 8. Board Decision

**APPROVED.** OKRs are a first-class EWM concern binding strategy to execution without entering frozen financial engines.
