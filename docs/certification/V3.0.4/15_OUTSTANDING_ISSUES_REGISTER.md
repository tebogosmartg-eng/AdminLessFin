# Outstanding Issues Register (V3.0.4)

**Date:** 2026-07-07  
**Status:** **1 OPEN** (down from 7)

| ID | Blocker | Status | Evidence |
|----|---------|--------|----------|
| OIR-V303-001 | ESLint gate | **RESOLVED** | `npm run lint` exit 0 (0 errors; 138 legacy warnings) |
| OIR-V303-002 | Unit test infrastructure | **RESOLVED** | Vitest + 17 unit tests pass |
| OIR-V303-003 | Integration tests | **RESOLVED** | 3 integration tests pass |
| OIR-V303-004 | Live E2E payroll | **OPEN** | Connectivity PASS; full cycle **NOT_VERIFIED** |
| OIR-V303-005 | Payslip metadata render | **RESOLVED** | PDF/HTML certification fields |
| OIR-V303-006 | Journal liability model | **RESOLVED** | `src/lib/payrollJournal.ts` |
| OIR-V303-007 | Bank hash totals | **RESOLVED** | EFT/CSV control hash |

## Open: OIR-V304-001

Provision `E2E_EMAIL` + `E2E_PASSWORD` and run `npm run certify:e2e` for full cycle evidence.
