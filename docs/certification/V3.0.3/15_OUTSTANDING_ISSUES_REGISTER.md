# 15. Outstanding Issues Register (V3.0.3)

**Date:** 2026-07-05  
**Status:** **7 BLOCKING ISSUES OPEN**

---

## Blocking (Certification Gate)

| ID | Severity | Issue | Required Action |
|----|----------|-------|-----------------|
| OIR-V303-001 | **P0** | ESLint gate fails (419 errors) | Resolve lint or scope CI gate |
| OIR-V303-002 | **P0** | No unit test framework | Add vitest/jest + payroll unit tests |
| OIR-V303-003 | **P0** | No integration tests | Add payroll workflow integration suite |
| OIR-V303-004 | **P0** | E2E payroll cycle not executed | Run against staging Supabase with evidence |
| OIR-V303-005 | **P1** | Payslip PDF/HTML missing YTD, tax year, rule/calc version | Surface `calculation_snapshot` fields on output |
| OIR-V303-006 | **P1** | Journal uses consolidated liability only | Wire `buildJournalLines` or document accepted model |
| OIR-V303-007 | **P1** | Bank EFT lacks hash totals | Implement hash control per bank spec |

---

## Non-Blocking

| ID | Issue | Notes |
|----|-------|-------|
| OIR-V303-008 | Security RLS not runtime-tested | Pen-test or automated RLS suite |
| OIR-V303-009 | Cost Centre report not found | May be out of scope |
| OIR-V303-010 | Excel export not implemented | CSV/PDF only |
| OIR-V303-011 | Performance benchmark scope = calculation only | Extend benchmark harness |
| OIR-V303-012 | Failure injection = envelope only | Add integration failure tests |

---

## Resolved This Sprint

| ID | Issue | Resolution |
|----|-------|------------|
| DEF-001 | `verify:statutory` broken on Windows | `npx --yes tsx` in package.json |

---

## Carried Forward (V3.0.2 — Resolved)

Statutory engine issues OIR-001 through OIR-010 remain resolved. See `docs/certification/V3.0.2/10_OUTSTANDING_ISSUES_REGISTER.md`.
