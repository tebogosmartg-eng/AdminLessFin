# Regression Verification Report

**Product:** AdminLess Fin · **Version:** 3.4 · **Date:** 2026-07-12

---

## Results

| Suite | Result |
|-------|--------|
| `npm run test:payroll` (unit 18 + integration 3) | **PASS** |
| `npm run certify:statutory` (12 + 76 + 3, benchmark stable) | **ALL PASSED** |
| `npm run build` (Vite production) | **PASS** |

---

## Calculation parity (sample)

| Case | Expected | Status |
|------|----------|--------|
| PAYE R25k monthly 2025/2026 | 3119.08 | PASS |
| Primary rebate | 17235 | PASS |
| Medical main member | 364 | PASS |
| UIF at ceiling | 177.12 | PASS |
| Historical 2024/2025 resolution | 2024/2025 | PASS |

---

## Locked surfaces

Accounting, workflow, BOE, commands, events, employee numbering — not modified in this sprint.

---

## Regression gate: PASS
