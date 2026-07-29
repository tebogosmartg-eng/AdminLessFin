# 3. Mathematical Certification Report

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05  
**Suite:** `src/lib/statutoryPayrollEngine/certification.ts`  
**Tolerance:** R0.01

---

## Results Summary

| Suite | Total | Passed | Failed |
|-------|-------|--------|--------|
| Verification (`verify.ts`) | 12 | 12 | 0 |
| Certification (`certification.ts`) | 62 | 62 | 0 |
| **Combined** | **74** | **74** | **0** |

**Command:** `npx tsx` via `npm run certify:statutory`

---

## Coverage by Category

### PAYE (18 cases)

| Scenario | ID | Result |
|----------|-----|--------|
| Monthly payroll R25k | paye_middle_25k | ✅ PASS |
| Low income R8k (below threshold) | paye_low_income_8k | ✅ PASS |
| High income R80k | paye_high_80k | ✅ PASS |
| Age 65 secondary rebate | paye_age_65 | ✅ PASS |
| Age 75 tertiary+secondary rebate | paye_age_75 | ✅ PASS (after CERT-001 fix) |
| Zero income | paye_zero_income | ✅ PASS |
| Pre-tax deduction | paye_negative_adjustment | ✅ PASS |
| YTD recalculation | paye_ytd_month6 | ✅ PASS |
| Weekly normalisation | paye_weekly_norm, paye_weekly_paye | ✅ PASS |
| Fortnightly normalisation | paye_fortnightly_norm | ✅ PASS |
| Bonus R10,000 | paye_bonus_aggregate | ✅ PASS |
| Bracket spot-checks (6) | bracket_* | ✅ PASS |

### UIF (3 cases)

| Scenario | Expected | Actual | Result |
|----------|----------|--------|--------|
| R10,000 below ceiling | R100.00 | R100.00 | ✅ |
| R17,712 at ceiling | R177.12 | R177.12 | ✅ |
| R50,000 above ceiling | R177.12 | R177.12 | ✅ |

### SDL (4 cases)

| Scenario | Result |
|----------|--------|
| Liable employer (R600k annual) | ✅ |
| Exempt below R500k | ✅ |
| Exempt at exactly R500k | ✅ |
| Liable at R500,001 | ✅ |

### Medical Credits (3 cases)

| Members | Expected | Result |
|---------|----------|--------|
| 1 (main) | R364 | ✅ |
| 2 | R728 | ✅ |
| 4 | R1,220 | ✅ |

### Retirement (4 cases)

| Scenario | Result |
|----------|--------|
| Below 27.5% limit | ✅ |
| Above 27.5% limit (capped) | ✅ |
| Non-deductible portion | ✅ |

### Travel Allowance (2 cases)

| Business Use | Taxable % | Result |
|--------------|-----------|--------|
| 80% | 20% → R1,000 on R5,000 | ✅ |
| 20% | 80% → R4,000 on R5,000 | ✅ |

### Leave Encashment (1 case)

5 days × R1,000 = R5,000 taxable — ✅

### Termination (3 cases)

| Scenario | Result |
|----------|--------|
| R200k within exemption | ✅ |
| R600k with R100k taxable | ✅ |

### Fringe Benefits (1 case)

Company car 3.5% of R100,000 = R3,500 — ✅ (simplified model)

### Historical (4 cases)

| Test | Result |
|------|--------|
| Tax year resolution | ✅ |
| Rule version stable | ✅ |
| Recalculation identical | ✅ |
| Results unchanged | ✅ |

---

## Sample Certification Record Format

```
ID: paye_middle_25k
Expected: 3119.08
Actual:   3119.08
Difference: 0.00
Tolerance: 0.01
Pass/Fail: PASS
```

---

## Mathematical Certification Conclusion

**All 74 certification scenarios pass within R0.01 tolerance.** One engine defect (rebate stacking) was corrected during certification and re-verified.
