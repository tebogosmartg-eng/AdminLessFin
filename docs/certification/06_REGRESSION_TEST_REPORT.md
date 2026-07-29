# 6. Regression Test Report

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05

---

## Regression Suite Location

| File | Purpose | Cases |
|------|---------|-------|
| `src/lib/statutoryPayrollEngine/verify.ts` | Quick SARS validation | 12 |
| `src/lib/statutoryPayrollEngine/certification.ts` | Full certification suite | 62 |
| `src/lib/statutoryPayrollEngine/certificationRunner.ts` | Programme orchestrator | 74 combined |
| `src/lib/statutoryPayrollEngine/benchmark.ts` | Performance + stability | 5 batch sizes |

---

## NPM Scripts

```bash
npm run verify:statutory      # 12-case quick verification
npm run certify:statutory     # Full 74-case certification (exit 1 on failure)
npm run certify:statutory:json  # JSON output for CI
```

---

## Execution Results (2026-07-05)

| Suite | Passed | Failed |
|-------|--------|--------|
| verify.ts | 12/12 | 0 |
| certification.ts | 62/62 | 0 |
| benchmark stability | 5/5 | 0 |

---

## Defect Found During Regression

| Defect | Test | Status |
|--------|------|--------|
| CERT-001: Age 75+ rebate stacking | paye_age_75 | **FIXED** in `utils.ts` `resolveRebate()` |

---

## CI Integration Status

| Requirement | Status |
|-------------|--------|
| Automated test suite exists | ✅ |
| Exit code 1 on failure | ✅ |
| Pre-deployment gate in CI pipeline | ❌ **NOT YET WIRED** |

**Recommendation:** Add `npm run certify:statutory` to CI workflow before deployment.

---

## Regression Conclusion

**74/74 tests pass.** Permanent regression suite created. CI gate not yet configured — deployment blocker per certification requirements.
