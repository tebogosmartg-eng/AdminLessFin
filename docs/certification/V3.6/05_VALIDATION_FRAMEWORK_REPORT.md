# 05 — Validation Framework Report

**Version:** 3.6  
**Module:** `src/lib/statutoryReturns/validate.ts` + `source.ts`

## 1. Purpose

Provide a shared validation framework so every return generator:

1. Proves sources are finalized
2. Enforces return-specific prerequisites (period / employee)
3. Surfaces warnings for incomplete snapshots
4. Emits a uniform `validationResult` on `StatutoryReturn`

## 2. Core types

```ts
StatutoryValidationIssue { code, severity, message, field? }
StatutoryValidationResult { ok, issues, validatedAt }
```

`ok === false` iff any issue has `severity: 'error'`.

## 3. Shared checks

| Function | Role |
|----------|------|
| `validateGenerateInput` | country, taxYear, period/employee requirements, finalized runs |
| `assertFinalizedRuns` | `status ∈ {finalized, paid}` via `isRunFinalized` |
| `validateSourcePayrollIntegrity` | missing `calculation_snapshot` warnings |
| `buildValidationResult` | normalize envelope |
| `mergeIssues` | compose generator-specific checks |

## 4. Generator-specific extensions

| Return | Extra codes |
|--------|-------------|
| EMP201 | `NO_RUNS_IN_PERIOD`, `ZERO_LIABILITY`, `LEGISLATION_CODE_RESOLVE_FAILED` |
| EMP501 | `EMP501_PAYE_RECON_MISMATCH`, `EMP501_NO_EMPLOYEES` |
| IRP5 | `IRP5_EMPLOYEE_NOT_FOUND`, `IRP5_MISSING_TAX_REFERENCE`, `IRP5_CODE_RESOLVE_FAILED` |

## 5. UI surface

Statutory Returns page tab **Validation** renders the latest `validationResult.issues` with severity badges. **Submission History** lists session-generated envelopes (DB table ready for durable history).

## 6. Invariants

1. Validation never recalculates PAYE/UIF/SDL.
2. A non-finalized run always fails generation (`RUN_NOT_FINALIZED`).
3. Warnings do not flip `ok` to false; errors do.

## 7. Verdict

**CERTIFIED** — Validation framework is common, composable, and return-agnostic.
