# Duplicate Constant Report

**Product:** AdminLess Fin  
**Version:** 3.3  
**Date:** 2026-07-12

---

## Objective

Ensure every SARS constant used for calculation has a single **authoritative** definition path: the registered tax-year legislation package.

---

## Pre-V3.3 duplication (eliminated from engine)

| Location | Issue | V3.3 disposition |
|----------|-------|------------------|
| `statutoryPayrollEngine/registry/taxYears.ts` | Owned all brackets/rebates/rates | Now adapter only — imports legislation |
| `mapDbRowToRuleSet` numeric literals | Fallback SARS values (`17712`, `0.01`, `350000`, `4.76`, …) | Removed |
| `utils.resolveRebate` ages `65` / `75` | Hardcoded thresholds | Moved to `thresholds.ts` per package |
| `payrollRulesEngine/rules.ts` `?? 0.01` | Silent rate fallback | Fail-fast throw |

---

## Acceptable remaining literals

| Location | Why allowed |
|----------|-------------|
| `tax-years/*/…` | Authoritative legislation packages |
| `certification.ts` / `verify.ts` expected values | Independent SARS reference assertions (tests), not calculation inputs |
| Edge mirror `_shared/statutory/` | Deployment duplicate of `src/statutory` (Deno boundary) — must stay in sync |

---

## Single-source rule

```
Calculation path:
  SouthAfricanLegislation (tax-years package)
    → legislationToStatutoryRuleSet
    → StatutoryRuleSet
    → engines

Forbidden:
  Hardcoded SARS values inside engines, pipeline, rules calculators, or utils
```

---

## Scan results (engine calculation paths)

| Path | SARS literals for calculation |
|------|-------------------------------|
| `src/lib/statutoryPayrollEngine/engines/*` | None (consume `ruleSet`) |
| `src/lib/statutoryPayrollEngine/registry/taxYears.ts` | None |
| `src/lib/statutoryPayrollEngine/registry/index.ts` | None (fail-fast only) |
| `src/lib/payrollRulesEngine/rules.ts` UIF/SDL | None (config/legislation only) |

**Duplicate constant gate: PASS** (authoritative constants exist only in tax-year packages + intentional edge mirror).
