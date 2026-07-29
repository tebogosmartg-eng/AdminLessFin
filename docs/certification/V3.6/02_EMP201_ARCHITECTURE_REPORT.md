# 02 — EMP201 Architecture Report

**Version:** 3.6  
**Return:** EMP201 (ZA monthly employer declaration)

## 1. Purpose

Produce the monthly SARS EMP201 declaration of PAYE, UIF, and SDL from **finalized** payroll runs in a calendar/tax month.

## 2. Generator

| Item | Value |
|------|-------|
| Package | `zaEmp201Package` |
| Path | `src/lib/statutoryReturns/countries/south-africa/emp201/generator.ts` |
| Entry | `generateEmp201` / `generateStatutoryReturn('ZA','EMP201', …)` |
| Frequency | Monthly |

## 3. Inputs (finalized only)

- `GenerateReturnInput.runs` — each run `status ∈ {finalized, paid}`
- `periodStart` / `periodEnd` — required; filters by `payDate`
- Optional read of legislation EMP201 field labels via `resolveLegislation` + `unwrap(pkg.emp201.*)`

## 4. Amount resolution (no recalculation)

| EMP201 field | Source |
|--------------|--------|
| PAYE | `engine_results` ids `paye`, `directors_paye`, `bonus_tax`, `termination_tax` (employee) |
| UIF employee | `uif` employee_amount |
| UIF employer | `uif_employer` employer_amount |
| SDL | `sdl` employer_amount |
| Gross | `calculation_snapshot.gross_earnings` |

Fallback: keyword match on persisted `payslip_items` with validation warning if snapshot absent.

## 5. Outputs

`declarationData` includes:

- `fieldCodes` (PAYE / UIF / SDL from legislation maps)
- `totals` (paye, uifEmployee, uifEmployer, uifTotal, sdl, grossRemuneration, employeeCount)
- `sourceRunIds`
- `legislationRuleVersion`

Envelope status: `validated` if no error-severity issues; else `draft`.

## 6. Validations

| Code | Severity | Meaning |
|------|----------|---------|
| `RUN_NOT_FINALIZED` | error | Draft/processing run rejected |
| `PERIOD_REQUIRED` | error | Missing month bounds |
| `NO_RUNS_IN_PERIOD` | error | No finalized runs in window |
| `ZERO_LIABILITY` | warning | All zeros |
| `LEGISLATION_CODE_RESOLVE_FAILED` | warning | Codes fall back to defaults |
| `MISSING_CALCULATION_SNAPSHOT` | warning | Line-item fallback |

## 7. Isolation proof

- Does not import payroll engines
- Does not call `executeStatutoryPipeline` / `GENERATE_PAYSLIPS`
- Does not mutate `payrollReports.ts` or journals

## 8. Verdict

**CERTIFIED** — EMP201 generator architecture complies with finalized-only consumption and common `StatutoryReturn` envelope.
