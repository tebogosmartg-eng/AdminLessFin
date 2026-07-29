# 02 — Report Registry Report

**Version:** 3.6.3  
**Modules:** `src/reporting/registry/*`

## 1. Contract

Every report exposes:

| Field | Purpose |
|-------|---------|
| `id` | Stable unique key (e.g. `payroll.operational.register`) |
| `name` | Display name |
| `module` | payroll / accounting / inventory / assets / sales / crm / platform |
| `category` | operational / management / statutory / analytical / compliance |
| `description` | Catalogue text |
| `supportedFilters` | Filter definitions |
| `supportedExports` | csv / excel / pdf / json |
| `permissions` | roles / permission codes |
| `generator` | Snapshot → `ReportResult` |

## 2. API

| Function | Behaviour |
|----------|-----------|
| `registerReport` | Freeze + insert; rejects duplicate ids |
| `getReport` / `requireReport` | Lookup |
| `listReports` / `listReportCatalogue` | Discover by module/category |
| `bootstrapReportingPlatform` | Idempotent module registration |

## 3. Payroll registrations

Operational catalogue, management catalogue, and statutory report views are registered as:

- `payroll.operational.*`
- `payroll.management.*`
- `payroll.statutory.*`

Generators call existing locked builders (`buildPeriodReports`, `buildManagementReports`, …).

## 4. Verdict

**CERTIFIED** — Report Registry is the single catalogue entry point for platform reports.
