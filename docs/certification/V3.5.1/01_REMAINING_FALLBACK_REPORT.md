# Remaining Fallback Report

**Product:** AdminLess Fin · **Version:** 3.5.1 · **Date:** 2026-07-12  
**Board:** Independent Principal Enterprise Release Board

---

## Scope

Repository-wide search for `??`, `DEFAULT`, `fallback`, and hardcoded statutory defaults that can silently substitute legislation.

---

## FAIL — resolved

| Location | Behaviour | Resolution |
|----------|-----------|------------|
| `src/lib/statutoryPayrollEngine/registry/index.ts` → `mapDbRowToRuleSet` | Incomplete `payroll_tax_year_config` fields (`brackets`, `rebates`, `medicalCredits`, `uif*`, `sdlRate`, dates, country) were silently completed from the built-in legislation package, producing a hybrid rule set | **Eliminated.** DB row supplies tax-year **identity** (`tax_year_label` + matching window only). All statutory values resolve exclusively from the locked legislation repository. Missing label → `LegislationResolutionError`. |
| Edge mirror `supabase/functions/_shared/statutoryPayrollEngine/registry/index.ts` | Same merge fallback | **Eliminated** (mirrored). |

---

## PASS — fail-fast already

| Location | Notes |
|----------|-------|
| `src/statutory/registry/resolveLegislation.ts` | No package / date match → throw; silent year fallback prohibited |
| `resolveRuleSetForPayroll` | Missing DB rows or date mismatch → throw |
| `payrollRulesEngine/rules.ts` UIF/SDL | Non-finite rate/ceiling → throw (“Silent rate fallback is prohibited”) |

---

## REVIEW — not legislation substitution (not freeze blockers)

| Location | Notes |
|----------|-------|
| `generatePayslips.ts` `companyAnnualRemuneration ?? 600000` | Business input assumption for SDL exemption test path — does **not** substitute a legislative constant. Out of freeze-blocker scope (workflow input). |
| PAYE bracket `?? last bracket` | Mathematical open-ended table selection; not a legislation value substitute. |
| UI / toast / AvatarFallback / audit log “fallback” | Non-statutory. |

---

## Gate

**No statutory fallback remains that can silently substitute legislation.**

**Fallback gate: PASS**
