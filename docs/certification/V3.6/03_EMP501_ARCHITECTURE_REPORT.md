# 03 — EMP501 Architecture Report

**Version:** 3.6  
**Return:** EMP501 (ZA annual employer reconciliation)

## 1. Purpose

Produce the annual EMP501 reconciliation by aggregating **all finalized payroll runs** in the employer’s tax year and proving monthly totals roll up to annual declared liabilities.

## 2. Generator

| Item | Value |
|------|-------|
| Package | `zaEmp501Package` |
| Path | `src/lib/statutoryReturns/countries/south-africa/emp501/generator.ts` |
| Entry | `generateEmp501` |
| Frequency | Annual |

## 3. Inputs

- Finalized runs spanning the tax year (caller scopes via `loadFinalizedPayrollSources` / tax year filter)
- No legislation package mutation; EMP501 field structure lives in the return package

## 4. Declaration shape

```ts
reconciliation: {
  payeDeclared,
  uifEmployeeDeclared,
  uifEmployerDeclared,
  uifTotalDeclared,
  sdlDeclared,
  grossRemuneration,
  employeeCount,
  finalizedRunCount
}
monthlyBreakdown: [{ periodLabel, payDate, payrollRunId, paye, uifTotal, sdl, gross }]
```

## 5. Reconciliation rule

Annual `payeDeclared` must equal Σ `monthlyBreakdown.paye` within R0.02.

Failure code: `EMP501_PAYE_RECON_MISMATCH` (error).

This is a **consistency check on stored finalized amounts**, not a recompute of PAYE tables.

## 6. Isolation

EMP501 does not:

- Open tax brackets
- Call PAYE engines
- Alter journals or payroll reports

## 7. Verdict

**CERTIFIED** — EMP501 architecture is an aggregation/reconciliation consumer of finalized payroll.
