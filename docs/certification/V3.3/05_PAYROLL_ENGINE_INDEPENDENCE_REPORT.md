# Payroll Engine Independence Report

**Product:** AdminLess Fin  
**Version:** 3.3  
**Date:** 2026-07-12

---

## Verdict

The payroll engine is legislation-agnostic. It performs calculations only. All statutory constants are injected via `StatutoryRuleSet`, produced exclusively from `SouthAfricanLegislation`.

---

## What the engine may do

- Progressive tax math (`calculateAnnualTax`, bracket search)
- Rebate application using ages supplied by legislation
- Medical credit aggregation from `ruleSet.medicalCredits`
- UIF / SDL / retirement / travel / fringe formulas using `ruleSet` rates
- Pipeline orchestration and audit snapshots

## What the engine must not contain

| Prohibited content | Status |
|--------------------|--------|
| Primary / secondary / tertiary rebate values | ABSENT |
| Medical credit values | ABSENT |
| Tax brackets | ABSENT |
| UIF limits / rates | ABSENT |
| SDL limits / rates | ABSENT |
| Retirement limits | ABSENT |
| Travel constants | ABSENT |
| Fringe benefit rates | ABSENT |
| Tax thresholds / rebate ages | ABSENT from utils (sourced from legislation) |
| IRP5 / EMP201 constants | ABSENT (live in legislation packages) |
| Silent fallback to another tax year | ABSENT |

---

## Wiring changes only (no formula changes)

| Change | Intent |
|--------|--------|
| `resolveRebate(..., ages)` | Ages from `ruleSet.rebateSecondaryAge` / `rebateTertiaryAge` |
| `StatutoryRuleSet` +age fields | Carry thresholds from legislation adapter |
| Registry delegates to `src/statutory/south-africa` | Selection isolation |
| Rules engine removes `?? 0.01` | Fail-fast |

PAYE, UIF, SDL, medical, travel, fringe, termination **formulas were not redesigned**.

---

## Consumption pattern

```ts
const legislation = resolveSouthAfricanLegislation(payDate);
const ruleSet = legislationToStatutoryRuleSet(legislation);
// engines receive ruleSet only — unaware which package was chosen
```

Production path continues to resolve via DB `payroll_tax_year_config` + registered legislation merge (`resolveRuleSetForPayroll`), still failing immediately when unresolved.

---

## Independence gate: PASS
