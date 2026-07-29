# 05 — Regression Verification Report

**Version:** 3.6.2

## 1. Quality gates

| Gate | Result |
|------|--------|
| Existing Payroll Register unchanged | ✓ `buildPeriodReports` semantics preserved; covered by regression assertion |
| Existing operational reports unchanged | ✓ Catalogue IDs/labels unchanged; CSV helper retained |
| Payroll Engine unchanged | ✓ No edits to statutory engine / generatePayslips calculation path |
| Accounting unchanged | ✓ No journal/GL modules touched |
| Reports consume finalized payroll only | ✓ Period fetch filters `isRunFinalized` / `FINALIZED_RUN_STATUSES` |
| Matrix engine reusable | ✓ Unit coverage for month/dept/cost-centre dimensions |
| Excel/PDF/CSV exports supported | ✓ Export framework + unit coverage for CSV/SpreadsheetML |
| Existing regression tests pass | ✓ |

## 2. Test evidence

| Suite | Result |
|-------|--------|
| `tests/unit/payroll-matrix-reporting.test.ts` | PASS (matrix, management, export, register lock) |
| `tests/unit/payroll-employer-contribution-consistency.test.ts` | PASS |
| `tests/unit/payroll-lockdown.test.ts` | PASS |
| Full unit suite (`npm test`) | **36 passed** |
| Integration (`npm run test:integration`) | **3 passed** |

## 3. Register lock proof

Management suite asserts operational register totals for the same finalized input:

- `register[0].gross_pay` / `employer_contributions` / `totals.cost_to_company` unchanged relative to V3.6.1 behaviour

## 4. Verdict

**PASS** — Regression green; operational register behaviour preserved.
