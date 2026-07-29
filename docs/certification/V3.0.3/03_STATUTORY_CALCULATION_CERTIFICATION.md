# 3. Statutory Calculation Certification Report (V3.0.3)

**Date:** 2026-07-05  
**Phase:** 3 — Statutory Calculation  
**Result:** **PASS**

---

## Observed Evidence

**Command:** `npm run certify:statutory` (exit 0)

| Suite | Passed | Total | Tolerance |
|-------|--------|-------|-----------|
| Verification | 12 | 12 | 0 |
| Certification | 76 | 76 | 0 (legislative), 0.01 (paye) |
| Historical | 3 | 3 | exact replay |
| Benchmark | 5 sizes | 5 | stable |

**Engine version:** 3.0.2  
**Tax year:** 2025/2026

---

## Calculation Pipeline Verified

| Component | Cases | Legislative Ref |
|-----------|-------|-----------------|
| PAYE brackets | 6+ | SARS tax table 2025/2026 |
| Rebates (primary/secondary/tertiary) | 3 | SARS Rates of Tax 2025 |
| Medical tax credits | 3 | SARS Medical Tax Credit 2025 |
| UIF (rate + ceiling) | 4 | UI Act / DOL |
| SDL (rate + exemption) | 2 | SDL Act 9 of 1999 |
| Retirement deductions | multiple | Fourth Schedule |
| Fringe benefits (7th Schedule) | 3 | Seventh Schedule |
| Travel allowance | multiple | Logbook + 80/20 |
| Termination benefits | 2 | Second Schedule |
| Directors PAYE | 2 | PAYE-GEN-01-G01 |
| YTD recalculation | 1 | PAYE annualisation |
| Historical tax years | 3 | 2024.2.0, 2025.2.0 |

**Difference tolerated:** ZERO for all legislative cases (observed `difference: 0`).

---

## Integration Point

Server payslip generation calls `executeStatutoryPipeline` in `supabase/functions/_shared/generatePayslips.ts` with full audit metadata.

**Phase 3 Verdict:** **PASS** — mathematically certified with observed evidence.
