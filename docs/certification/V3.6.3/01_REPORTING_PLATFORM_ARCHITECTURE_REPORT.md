# 01 — Reporting Platform Architecture Report

**Version:** 3.6.3  
**Board:** Independent Principal Enterprise Reporting Architecture

## 1. Target layout

```
src/reporting/
  registry/          reportDefinition.ts, reportRegistry.ts
  engine/            matrixEngine, aggregationEngine, filterEngine, groupingEngine
  export/            csv/, excel/, pdf/, json/
  scheduler/         schedule stubs
  permissions/       capability evaluation
  reports/
    payroll/         LOCKED report adapters (generators wrap V3.6.2 builders)
    accounting/      placeholder registration
    inventory/       placeholder registration
    assets/          placeholder registration
    sales/           placeholder registration
  index.ts           public platform entry + bootstrapReportingPlatform()
```

## 2. Principles

1. Every report registers through the Report Registry.
2. Generators consume finalized snapshots / facts only — no business recalculation.
3. Matrix / aggregation / filter / grouping engines are domain-agnostic.
4. Module-specific report packages adapt domain facts → platform contracts.
5. Existing payroll UI (`/payroll-reports`) and builders remain the production path (no UI redesign).

## 3. Module onboarding path

To add a report for any module:

1. Register a `ReportDefinition` (`id`, `name`, `category`, `description`, `supportedFilters`, `supportedExports`, `permissions`, `generator`).
2. Implement a generator that maps finalized source facts → `ReportResult.rows`.
3. Reuse `buildMatrix` / `exportReportRows` from the shared platform.

## 4. Isolation from locked domains

| Domain | Status |
|--------|--------|
| Payroll Engine | Untouched |
| `buildPeriodReports` / Register | Untouched semantics |
| Management / Statutory payroll builders | Untouched; wrapped by registry generators |
| Accounting / Journals | Untouched (placeholder registration only) |

## 5. Verdict

**CERTIFIED** — Platform architecture delivered without regressing locked payroll reporting.
