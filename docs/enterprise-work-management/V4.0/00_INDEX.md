# Enterprise Work Management V4.0 — Architecture Board Index

**Product:** AdminLess Fin  
**Module:** Enterprise Work Management  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Operations Architecture Board  
**Status:** Architecture APPROVED for design freeze — implementation not started  

---

## Freeze Declaration

| Module | Status | Rule |
|--------|--------|------|
| Payroll | **FROZEN** | Do not modify. EWM may emit read-only operational facts for consumption only. |
| Accounting | **FROZEN** | Do not modify. Accounting consumes finalized operational facts; EWM never posts journals. |
| Statutory Returns | **FROZEN** | Do not modify. No statutory calculations in EWM. |
| Reporting (locked adapters) | **FROZEN** | Do not rewrite locked builders. Register new EWM reports as a separate domain. |

---

## Deliverables

| # | Report | Path | Verdict |
|---|--------|------|---------|
| 1 | Enterprise Work Management Architecture | [01_ENTERPRISE_WORK_MANAGEMENT_ARCHITECTURE_REPORT.md](./01_ENTERPRISE_WORK_MANAGEMENT_ARCHITECTURE_REPORT.md) | APPROVED |
| 2 | Capacity Planning | [02_CAPACITY_PLANNING_REPORT.md](./02_CAPACITY_PLANNING_REPORT.md) | APPROVED |
| 3 | Project Costing | [03_PROJECT_COSTING_REPORT.md](./03_PROJECT_COSTING_REPORT.md) | APPROVED |
| 4 | Resource Allocation | [04_RESOURCE_ALLOCATION_REPORT.md](./04_RESOURCE_ALLOCATION_REPORT.md) | APPROVED |
| 5 | OKR Architecture | [05_OKR_ARCHITECTURE_REPORT.md](./05_OKR_ARCHITECTURE_REPORT.md) | APPROVED |
| 6 | Analytics Architecture | [06_ANALYTICS_ARCHITECTURE_REPORT.md](./06_ANALYTICS_ARCHITECTURE_REPORT.md) | APPROVED |
| 7 | Integration | [07_INTEGRATION_REPORT.md](./07_INTEGRATION_REPORT.md) | APPROVED |
| 8 | Production Readiness | [08_PRODUCTION_READINESS_REPORT.md](./08_PRODUCTION_READINESS_REPORT.md) | CONDITIONAL — design ready; build gated |

---

## Positioning Relative to Existing Platform

| Existing surface | Relationship to EWM |
|------------------|---------------------|
| `projects` + milestones | Retained as customer/billable engagement layer; EWM deepens hierarchy around/beside it |
| `timesheets` | Legacy billable bridge; EWM Time Entries become the operational source of truth; optional sync to timesheets for invoicing |
| Payroll | Downstream consumer of **locked** time facts only (future bridge); never recalculates payroll |
| Accounting | Downstream consumer of finalized operational cost facts; never recalculated in EWM |
| BOE (`src/lib/boe/`) | EWM registers new `work.*` events/commands; does not alter payroll/accounting events |

---

## Quality Gates (Board)

| Gate | Result |
|------|--------|
| Payroll unchanged | PASS (by design) |
| Accounting unchanged | PASS (by design) |
| Projects isolated | PASS |
| Capacity engine isolated | PASS |
| Costing isolated (operational only) | PASS |
| Reporting isolated | PASS |
| Audit complete | PASS (designed) |
| Workflow immutable after lock | PASS (designed) |
| Multi-company supported | PASS |
| Multi-project supported | PASS |
| Multi-country ready | PASS (calendar/holiday adapters) |
| No duplicated calculations | PASS (single calculation authority per fact) |

---

## Recommended Code Placement (Future Implementation)

```
src/pages/work/
src/components/work/
src/lib/work/                    # workflows, types, engines (capacity, costing, OKR)
supabase/functions/work/         # company-scoped edge API
supabase/migrations/*_ewm_*.sql
src/lib/boe/                     # ADD work.* events only
src/reporting/reports/work/      # new domain registrations only
```

**Non-touch list:** `supabase/functions/payroll/**`, `src/lib/statutoryPayrollEngine/**`, `src/lib/payroll*.ts`, `src/statutory/countries/**`, locked payroll report builders, journal posting contracts.
