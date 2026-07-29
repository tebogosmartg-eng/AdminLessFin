# 10. Regression Report

**Version:** 6.6.3

## Scope of change

Experience-layer only. Extends V6.6.2 accountant experience with Continue Preparation, engagement sidebar, Supporting Schedules labelling, topic-based notes, and validation/publication copy refinements.

## Frozen surfaces — regression status

| Surface | Status |
|---|---|
| Enterprise Financial Statements Architecture | Unchanged |
| Statement Engine | Unchanged |
| Reporting Snapshots | Unchanged |
| Working Papers platform (data/APIs) | Unchanged |
| Disclosure Platform | Unchanged |
| Validation Platform | Unchanged |
| Review Workflow | Unchanged |
| Publication Platform | Unchanged |
| Database schema / migrations | No new migration in V6.6.3 |
| Edge Function `financial-statements` methods | Unchanged |
| Routes `/financial-statements-workspace*` | Preserved |
| Feature flags `VITE_EFS_*` | Preserved |
| V6.6.2 engagement minimum information fields | Preserved |
| Orchestrator API sequence | Preserved |

## UX regressions checked

| Check | Result |
|---|---|
| New engagement wizard still three steps | PASS |
| Generate still one action | PASS |
| Advanced pipeline still persona-gated | PASS |
| Working Papers APIs still power Supporting Schedules | PASS |
| Review / Publication accountant flows still available | PASS |

## No duplicated ownership

Generation remains owned by `GENERATE_STATEMENTS` and related certified methods. Experience layer only derives navigation and labels from existing dashboard payloads.
