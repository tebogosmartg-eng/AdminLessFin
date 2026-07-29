# 02 — Management Reporting Report

**Version:** 3.6.2

## 1. Report categories

| Category | Reports |
|----------|---------|
| **Operational** (existing) | Payroll Register · Earnings · Deductions · Employer Contributions · UIF Summary · PAYE Summary · Employee Cost Report |
| **Management** (new) | Payroll Matrix · Monthly Payroll Analysis · Department Analysis · Cost Centre Analysis · Payroll Variance Report |
| **Statutory** (reporting view) | PAYE Summary · UIF Summary · SDL Summary · Employer Contributions |

Statutory *returns* (EMP201/501/IRP5) remain in the locked V3.6/V3.6.1 module. Statutory *reports* here are internal management/statutory summaries from finalized payslips.

## 2. Module map

| Concern | Module |
|---------|--------|
| Operational (unchanged) | `src/lib/payrollReports.ts` |
| Matrix engine | `src/lib/payrollMatrixEngine.ts` |
| Management + statutory report views | `src/lib/payrollManagementReports.ts` |
| Exports | `src/lib/payrollReportExport.ts` |
| UI | `src/pages/PayrollReports.tsx` |

## 3. Dimension coverage

Reusable matrix dimensions:

- Month (SA FY Mar–Feb)
- Department
- Cost Centre (`employees.branch`, fallback department)
- Company
- Employee Group (`employees.position`)

## 4. Variance

Payroll Variance Report computes month-over-month deltas from the month matrix cells — no recalculation of PAYE/UIF/SDL.

## 5. Verdict

**CERTIFIED** — Management reporting layer coexists with operational reports without duplicating engine logic.
