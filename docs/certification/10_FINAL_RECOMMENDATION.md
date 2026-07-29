# 10. Final Recommendation

**Programme:** V3.0.1 Certification  
**Board:** Principal Payroll Certification Board  
**Date:** 2026-07-05

---

## FINAL RECOMMENDATION

# CONDITIONALLY CERTIFIED

---

## Evidence Summary

### What Was Proven

| Claim | Evidence |
|-------|----------|
| PAYE brackets match SARS 2025/2026 formula | 6 bracket cases + 18 PAYE scenarios — 74/74 pass |
| Rebates match SARS published values | R17,235 / R9,444 / R3,145 verified |
| Medical credits match SARS 2025 rates | R364 / R364 / R246 verified |
| UIF rate, ceiling, capping correct | 3 scenarios pass |
| SDL rate and R500k exemption correct | 4 scenarios pass |
| Historical reproducibility | 4 consistency cases pass |
| Performance at 10,000 employees | 70.55 ms, zero mathematical variance |
| Build and TypeScript | Exit code 0 |
| Architecture preserved | No workflow/BOE changes |

### What Was NOT Proven

| Claim | Reason |
|-------|--------|
| Full Seventh Schedule fringe benefits | Simplified model only (OIR-003) |
| Full SARS travel allowance method | 80/20 simplification only (OIR-004) |
| Full termination lump-sum methodology | Simplified severance PAYE (OIR-005) |
| Directors' PAYE | Not implemented (OIR-006) |
| Automated CI deployment gate | Not wired (OIR-002) |

### Defect Corrected During Certification

**CERT-001:** `resolveRebate()` did not stack secondary + tertiary rebates for age 75+. Fixed with minimum one-function change. Re-verified: `paye_age_75` passes.

---

## Conditions for Production Use

The Statutory Payroll Engine is **conditionally certified** for production subject to:

1. **Scope limitation:** Standard monthly payroll for permanent employees using PAYE, UIF, SDL, and medical tax credits
2. **Disclosure:** Optional engines (fringe benefits, travel, termination) must be disclosed as simplified models
3. **Manual review:** Termination packages and complex fringe benefits require payroll administrator verification
4. **CI gate:** `npm run certify:statutory` must pass before deployment (script exists; pipeline wiring required)
5. **Migration:** Apply `20260705180000_statutory_payroll_engine.sql` for 2024/2025 historical support

---

## Path to Full Certification

| Step | Action |
|------|--------|
| 1 | Wire `certify:statutory` to CI/CD pipeline |
| 2 | Add `employee_id` to calculation snapshot |
| 3 | Implement or formally exclude fringe/travel/termination from production scope |
| 4 | Validate termination calculations against SARS IRP3(a) examples |

---

## Certification Sign-Off Matrix

| Criterion | Result |
|-----------|--------|
| Mathematical correctness (core) | ✅ PROVEN |
| SARS legislative compliance (core) | ✅ PROVEN |
| Historical reproducibility | ✅ PROVEN |
| Audit trail completeness | ⚠️ CONDITIONAL |
| Regression suite | ✅ PROVEN (74/74) |
| Performance | ✅ PROVEN |
| Optional engine compliance | ❌ NOT PROVEN |

---

**Certification Board Determination:** The engine is **mathematically correct, legislatively compliant, historically reproducible, and auditable** for standard South African monthly payroll. It is **not fully certified** for all optional statutory scenarios. Production deployment is approved under stated conditions.

---

*Run certification: `npm run certify:statutory`*  
*Full reports: `docs/certification/01` through `09`*
