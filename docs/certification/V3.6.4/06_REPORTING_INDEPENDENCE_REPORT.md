# 06 — Reporting Independence Report

**Version:** 3.6.4

## 1. Independence rules

| Consumer | Reads payslips? | Reads Payroll Facts? |
|----------|-----------------|----------------------|
| Operational Reports UI | No | Yes |
| Management Reports UI | No | Yes |
| VIP / Audit | No | Yes |
| Statutory Returns loader | No | Yes → adapter to locked generators |
| Payroll Register builder | Input projected from facts | Semantics locked / identical |
| Accounting / Journals | Unchanged (finalized payroll) | N/A (not redesigned) |
| Payslips | Presentation only | N/A |

## 2. Adapters (compatibility)

`factsToRegisterPayslips` · `factsToManagementPayslips` · `factsToStatutoryRunSources` project facts into locked builder input shapes so Register / statutory **outputs remain identical**.

## 3. Adding a new consumer

Create a new module under `src/reporting/{operational|management|audit|statutory}` that calls `loadPayrollFacts` (or receives facts). No Payroll Engine / Register / calculation / Accounting / Legislation changes.

## 4. Verdict

**CERTIFIED** — Reporting is independent of payslip presentation documents.
