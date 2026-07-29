# 01 — Statutory Returns Architecture Report

**Version:** 3.6  
**Board:** Independent Principal Enterprise Payroll Architecture Board  
**Date:** 2026-07-12

## 1. Objective

Introduce a dedicated **Statutory Returns** module that declares to government authorities using values already produced by the Payroll Engine and frozen on finalized payroll runs.

This is **not** a payroll calculation sprint.

## 2. Separation of concerns

| Layer | Responsibility | Status |
|-------|----------------|--------|
| Payroll Engine | Calculate PAYE, UIF, SDL, etc. | **LOCKED** |
| Finalized Payroll Run | Immutable payslips + `calculation_snapshot` | Source of truth |
| Payroll Reports | Internal operational reporting | **LOCKED** |
| Statutory Returns | Government declarations (EMP201, EMP501, IRP5, …) | **NEW** |
| Legislation Repository | Code maps / rates / provenance | **LOCKED** (read-only consume) |
| Accounting / Journals | GL posting | **LOCKED** |

### Pipeline (mandatory)

```
Payroll Engine
    ↓
Finalized Payroll Run (status ∈ {finalized, paid})
    ↓
Statutory Returns generators
    ↓
StatutoryReturn envelope + declarationData
```

Statutory Returns **must never** recalculate payroll.

## 3. Target product structure

```
Payroll
├── Employees
├── Payroll Runs
├── Payroll Reports          ← internal
└── Statutory Returns        ← government
    ├── EMP201
    ├── EMP501
    ├── IRP5
    ├── Tax Certificates
    ├── Submission History
    └── Validation
```

UI: `/statutory-returns` (admin), nav entry under Payroll.

## 4. Common interface — `StatutoryReturn`

```ts
{
  id,
  country,
  returnType,
  taxYear,
  payrollRunId,
  status,
  generatedAt,
  generatedBy,
  sourcePayrollRuns,
  validationResult,
  declarationData,
  submissionReference,
  submittedAt
}
```

Implemented in `src/lib/statutoryReturns/types.ts`.

## 5. Module layout

```
src/lib/statutoryReturns/
  types.ts
  registry.ts              # country + returnType → package
  source.ts                # extract amounts from finalized snapshots
  validate.ts              # shared validation framework
  loadFinalizedSources.ts  # read-only payroll edge consumption
  index.ts                 # public API
  countries/
    south-africa/
      index.ts             # register ZA packages
      emp201/generator.ts
      emp501/generator.ts
      irp5/generator.ts
```

Persistence: `statutory_returns` table (`supabase/migrations/20260712190000_statutory_returns_module.sql`).

## 6. Extensibility contract (success criteria)

Adding a new statutory return or country requires only:

1. **Create** the return package under `countries/<slug>/<return>/`
2. **Register** via `registerStatutoryReturn()`
3. **Implement** country-specific mappings (field/code → snapshot engines)

**Forbidden for extension:**

- Payroll Engine changes
- Payroll Reports changes
- Accounting / journal changes
- Workflow changes
- Legislation package mutations (consume `resolveLegislation` / `unwrap` only)

## 7. Quality gates (executed)

| Gate | Result |
|------|--------|
| Payroll Engine unchanged by this sprint | PASS |
| Payroll Reports unchanged | PASS |
| Legislation verify | PASS (`verifyLegislation` ok) |
| Statutory certification | PASS (12/12, 76/76, 3/3) |
| Existing payroll unit + integration tests | PASS |
| New statutory-returns unit tests | PASS |

## 8. Architecture decision record

| Decision | Rationale |
|----------|-----------|
| Separate module from `payrollReports.ts` | Internal reports ≠ SARS declarations |
| Consume `calculation_snapshot.engine_results` | Engine remains sole calculator |
| Country registry for returns (not legislation) | Multi-country without touching locked legislation tree |
| Client generation + DB persistence | Avoid payroll edge mutation; keep engine locked |
| Fallback to payslip_items keywords only if snapshot missing | Resilience with warning — never invent tax math |

## 9. Verdict

**CERTIFIED** — Statutory Returns architecture is established, isolated from locked payroll/accounting/legislation surfaces, and ready for return-specific certification (reports 02–06).
