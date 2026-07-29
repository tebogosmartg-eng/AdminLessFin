# Legislation Compliance Report

**Product:** AdminLess Fin · **Version:** 3.5.1 · **Date:** 2026-07-12  
**Board:** Independent Principal Enterprise Release Board

---

## Architecture (locked)

| Layer | Status |
|-------|--------|
| Legislation Repository (`src/statutory/countries/...`) | LOCKED — sole authority for legislative constants |
| Edge mirror (`supabase/functions/_shared/statutory/`) | Deploy copy |
| Payroll Engine | LOCKED — calculation logic only |
| Legislation Resolver | Fail-fast (`LegislationResolutionError`) |

---

## Compliance changes in V3.5.1

1. **Tax-year mapping** — `mapDbRowToRuleSet` no longer merges DB statutory columns over/under legislation. Label → complete package from repository.
2. **Furnished abatement multiplier** — `furnishedAccommodationAbatementMultiplier` added to `FringeBenefitsBlock` with provenance metadata for all registered ZA tax years; adapted into `StatutoryRuleSet`.

---

## Verification executed

```
npm run verify:legislation  → ok: true
npm run certify:statutory   → Verification 12/12, Certification 76/76, Historical 3/3, Benchmark stable
npm run test:payroll        → 21 tests passed (18 unit + 3 integration)
```

Legislation warnings (non-blocking): NA/BW zero packages; ZA PDF catalogue status=implemented.

---

## Assertions

| Requirement | Result |
|-------------|--------|
| No silent legislation substitution | PASS |
| Legislative constants only in repository (runtime) | PASS |
| Payroll engine = calculation logic only | PASS |
| Provenance metadata on new constant | PASS |
| Existing statutory certification | PASS |

**Legislation compliance gate: PASS**
