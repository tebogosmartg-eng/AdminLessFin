# Legislation Registry Report

**Product:** AdminLess Fin  
**Version:** 3.3  
**Date:** 2026-07-12

---

## Purpose

The registry is responsible **only** for selecting the correct South African legislation package. It performs no calculations.

---

## Components

| File | Responsibility |
|------|----------------|
| `registry/registry.ts` | Registers packages; exports `RULE_SET_*` |
| `registry/resolveLegislation.ts` | Date → package; fail-fast |
| `registry/legislationTypes.ts` | Contract + `LegislationResolutionError` |
| `registry/toStatutoryRuleSet.ts` | Maps legislation → engine `StatutoryRuleSet` |

---

## Resolution API

```ts
resolveSouthAfricanLegislation(payDate) → SouthAfricanLegislation
```

- Matches `payDate` against `effectiveFrom` … `effectiveTo`.
- On no match: throws `LegislationResolutionError`.
- **Never** substitutes another tax year.
- **Never** applies a default package.

```ts
requireLegislationByTaxYear('2025/2026') → SouthAfricanLegislation
```

Throws if the label is not registered.

---

## Registered packages (V3.3)

| Export | Tax year | Effective |
|--------|----------|-----------|
| `RULE_SET_2024_2025` | 2024/2025 | 2024-03-01 → 2025-02-28 |
| `RULE_SET_2025_2026` | 2025/2026 | 2025-03-01 → 2026-02-28 |
| `RULE_SET_2026_2027` | 2026/2027 | 2026-03-01 → 2027-02-28 |

---

## Engine bridge

`src/lib/statutoryPayrollEngine/registry/`:

- `taxYears.ts` — **thin adapter only** (no SARS literals).
- `resolveRuleSetForDate` → `resolveSouthAfricanLegislation` → `legislationToStatutoryRuleSet`.
- `resolveRuleSetForPayroll` — requires matching DB `payroll_tax_year_config` row; merges DB-stored fields over registered legislation; throws if label not registered.

---

## Fail-fast behaviours removed / enforced

| Previous behaviour | V3.3 |
|--------------------|------|
| Numeric hardcoded fallbacks in `mapDbRowToRuleSet` (`17712`, `0.01`, `350000`, …) | Removed — values come from registered legislation only |
| `resolveRuleSetForDate` returning `undefined` | Now throws via legislation resolver |
| UIF/SDL `?? 0.01` in rules engine | Throws if rate/ceiling missing |

---

## Registration checklist (future year)

1. Import new package in `registry.ts`.
2. Append to `REGISTERED_SOUTH_AFRICAN_LEGISLATION`.
3. Re-export `RULE_SET_YYYY_YYYY`.

No other registry logic changes are required.
