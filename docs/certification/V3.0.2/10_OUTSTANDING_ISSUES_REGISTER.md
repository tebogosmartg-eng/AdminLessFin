# 10. Updated Outstanding Issues Register (V3.0.2)

**Date:** 2026-07-05  
**Status:** All certification-blocking issues **RESOLVED**

| ID | Issue | Resolution |
|----|-------|------------|
| OIR-001 | Audit metadata gaps | Full snapshot in `audit.ts` |
| OIR-002 | No CI gate | `.github/workflows/statutory-certification.yml` |
| OIR-003 | Fringe benefits | `registry/seventhSchedule.ts` |
| OIR-004 | Travel allowance | `registry/travelAllowance.ts` |
| OIR-005 | Termination | `registry/terminationBenefits.ts` |
| OIR-006 | Directors PAYE | `engines/directorsPayeEngine.ts` |
| OIR-007 | YTD periods | `periodsProcessed` in PAYE engine |
| OIR-008 | Medical expenses credit | Out of standard payroll scope (§6A(3)) — documented |
| OIR-009 | YTD retirement | YTD contributions reduce cap |
| OIR-010 | SDL company annual | Wired in `generatePayslips.ts` |

**Certification:** 91/91 tests pass. No open blocking issues.
