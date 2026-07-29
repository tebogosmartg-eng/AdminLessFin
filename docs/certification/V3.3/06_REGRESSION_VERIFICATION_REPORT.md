# Regression Verification Report

**Product:** AdminLess Fin  
**Version:** 3.3  
**Date:** 2026-07-12

---

## Scope

Verify that legislative isolation did not alter certified calculation outcomes or break payroll/accounting test contracts.

---

## Results

### Unit + integration (`npm run test:payroll`)

| Suite | Result |
|-------|--------|
| Vitest unit (2 files, 18 tests) | **PASS** |
| Vitest integration (1 file, 3 tests) | **PASS** |

Includes payroll lockdown (PAYE R3,119.08, UIF ceiling, medical credits, travel/fringe/termination, certification gate) and workflow → statutory pipeline integration.

### Statutory verification (`npm run verify:statutory`)

| Metric | Result |
|--------|--------|
| Cases | 12/12 |
| Failed | 0 |

### Certification programme (`npm run certify:statutory`)

| Gate | Result |
|------|--------|
| Verification | 12/12 |
| Certification | 76/76 |
| Historical | 3/3 |
| Benchmark stable | true |
| **Overall** | **ALL PASSED** |

---

## Calculation parity

Representative locked values unchanged:

| Case | Expected | Actual |
|------|----------|--------|
| PAYE R25,000 monthly (2025/2026) | 3119.08 | 3119.08 |
| Primary rebate | 17235 | 17235 |
| Medical main member | 364 | 364 |
| UIF at ceiling | 177.12 | 177.12 |
| Historical 2024/2025 resolution | 2024/2025 | 2024/2025 |

---

## Live E2E

`npm run certify:e2e` requires live project credentials and is environment-dependent. Offline certification gates above are the mandatory regression bar for this isolation sprint.

---

## Regression gate: PASS
