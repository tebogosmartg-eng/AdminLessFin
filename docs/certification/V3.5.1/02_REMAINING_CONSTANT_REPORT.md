# Remaining Constant Report

**Product:** AdminLess Fin · **Version:** 3.5.1 · **Date:** 2026-07-12  
**Board:** Independent Principal Enterprise Release Board

---

## Scope

Numeric constants related to PAYE, UIF, SDL, Medical Credits, Rebates, Thresholds, Retirement, Travel, Fringe Benefits, Seventh Schedule, IRP5, EMP201 — classified as mathematical formula vs legislative constant.

---

## FAIL — resolved

| Constant | Former location | Classification | Resolution |
|----------|-----------------|----------------|------------|
| `1.25` furnished accommodation abatement multiplier | `statutoryPayrollEngine/registry/seventhSchedule.ts` (src + edge) | **Legislative** (Seventh Schedule para 9) | Moved to legislation repository as `furnishedAccommodationAbatementMultiplier` with full provenance for 2024/2025, 2025/2026, 2026/2027. Engine multiplies only; missing value fail-fast. |

---

## PASS — engine sources legislation only

| Domain | Engine behaviour |
|--------|------------------|
| PAYE brackets / rebates / ages | From `StatutoryRuleSet` via legislation adapter |
| Medical credits | From `ruleSet.medicalCredits` |
| UIF rate / ceiling | From `ruleSet` (engine config override is operational, not a hardcoded statutory default) |
| SDL rate / exemption threshold | From `ruleSet` |
| Retirement cap / rate | From `ruleSet` |
| Travel rates / deemed inclusion | From `ruleSet` |
| Vehicle fringe / official interest / accommodation abatement | From `ruleSet` |
| IRP5 / EMP201 codes | Legislation packages only (not engine literals) |

Mathematical constants retained in engine (months=12, currency rounding, `/100` style conversions): **allowed**.

---

## NOTE — non-runtime

| Location | Classification |
|----------|----------------|
| `certification.ts` / `verify.ts` expected oracles | Independent test assertions — not calculation inputs |
| Forensic scripts (`taxYearPayeReplay`, `payeVarianceForensics`, etc.) | Diagnostic reference tables — not production execution path |

---

## Gate

**No legislative constants remain outside the legislation repository on the production calculation path.**

**Constant gate: PASS**
