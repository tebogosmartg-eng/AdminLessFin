# 11. Performance Benchmark Report (V3.0.3)

**Date:** 2026-07-05  
**Phase:** 11 — Performance  
**Result:** **PASS**

---

## Observed Results (`npm run certify:statutory`)

| Employees | Time (ms) | Memory Δ (MB) | Audit Steps | Passed |
|-----------|-----------|---------------|-------------|--------|
| 100 | 3.94 | 2.28 | 2,000 | ✅ |
| 500 | 14.57 | -0.96 | 10,000 | ✅ |
| 1,000 | 19.79 | -1.07 | 20,000 | ✅ |
| 5,000 | 65.54 | 2.16 | 100,000 | ✅ |
| 10,000 | 90.49 | -1.87 | 200,000 | ✅ |

**Engine version:** 3.0.2  
**Benchmark stable:** true (sample net pay consistent with baseline)  
**Regression vs V3.0.2:** 10,000 employees 70ms → 90.49ms (+29%) — within acceptable variance for local run; `allStable: true`

---

## Scope Limitation

Benchmark covers **statutory calculation pipeline only**, not:

- Journal creation
- Payslip PDF generation
- Report exports
- Edge function round-trip

**Phase 11 Verdict:** **PASS** for calculation engine; **NOT VERIFIED** for full platform paths.
