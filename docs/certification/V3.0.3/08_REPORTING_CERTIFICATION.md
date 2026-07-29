# 8. Reporting Certification Report (V3.0.3)

**Date:** 2026-07-05  
**Phase:** 7 — Reporting  
**Result:** **NOT VERIFIED**

---

## Report Catalogue (Code Present)

| Report | Route/Module | Export | Status |
|--------|--------------|--------|--------|
| Payroll Register | `payrollReports.ts`, run detail | CSV, HTML | Code verified |
| Payroll Summary | run `output_metadata.summary` | — | Code verified |
| Department Report | register rows include department | CSV | Code verified |
| Cost Centre Report | — | — | **NOT FOUND** |
| Statutory Report | PAYE/UIF/SDL tabs | CSV | Code verified |
| Employer Contributions | employer tab | CSV | Code verified |
| Leave Report | leave balances on payslip | partial | PARTIAL |
| Employee Earnings | earnings tab | CSV | Code verified |
| Variance Report | `payrollIntelligence.ts` alerts | — | PARTIAL |
| Historical Reports | `GET_PERIOD_REPORTS` | CSV | Code verified |

**Exports:** PDF (payslip), Excel — **NOT FOUND** (CSV only via `downloadCSV`).

---

## Reconciliation Requirement

> Figures must reconcile to journals.

**Status:** **NOT VERIFIED** — no live run comparing register totals to posted journal amounts.

**Phase 7 Verdict:** **NOT VERIFIED**.
