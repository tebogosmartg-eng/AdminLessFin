# Production Readiness Report — Statutory Legislation Isolation V3.3

**Product:** AdminLess Fin  
**Version:** 3.3  
**Date:** 2026-07-12  
**Board:** Independent Principal Payroll Architecture Board

---

## Executive verdict

**READY for production adoption of the legislation module**, subject to edge-mirror sync discipline on deploy.

Legislative architecture isolation is complete. Certified calculation outcomes are unchanged. Payroll workflow, accounting, BOE, commands, events, and security remain locked and unmodified.

---

## Quality gates

| Gate | Status |
|------|--------|
| Payroll engine contains zero legislation constants | PASS |
| Every SARS constant for calc sourced from tax-year packages | PASS |
| Every tax year isolated | PASS |
| Registry selects legislation | PASS |
| Payroll engine consumes legislation via adapter | PASS |
| No duplicate authoritative constants in engine | PASS |
| No hardcoded tax values in calculation paths | PASS |
| No silent fallbacks | PASS |
| Existing payroll tests pass | PASS |
| Statutory certification programme passes | PASS |
| Accounting/journal paths untouched | PASS |

---

## Success criteria (2027/2028 readiness)

Adding SARS 2027/2028 requires exactly:

1. Create `src/statutory/south-africa/tax-years/2027-2028/`
2. Register `RULE_SET_2027_2028` in `registry/registry.ts`
3. Sync edge mirror + seed DB `payroll_tax_year_config`

| Requirement | Met |
|-------------|-----|
| No payroll engine modifications | YES |
| No accounting modifications | YES |
| No workflow modifications | YES |
| No reporting modifications required for legislation rates | YES |
| No UI modifications | YES |

---

## Operational notes

1. **Source of truth:** `src/statutory/south-africa/`
2. **Edge deploy:** keep `supabase/functions/_shared/statutory/south-africa/` synchronised with source.
3. **DB config:** `payroll_tax_year_config` remains the runtime overlay for brackets/rebates/medical/UIF/SDL stored in DB; builtin legislation supplies fields DB does not store. Unregistered tax-year labels **fail immediately**.
4. **Forensic scripts** may still mention historical `DEFAULT_TAX_YEAR` for analysis; production engine paths do not.

---

## Outstanding (non-blocking)

| Item | Notes |
|------|-------|
| Live E2E certification | Run in target environment with credentials |
| Automated edge↔src sync check | Recommended CI assert for future years |
| IRP5/EMP201 consumer wiring | Mappings now exist; report generators may adopt in a later reporting sprint (out of scope) |

---

## Recommendation

**APPROVE V3.3 legislative architecture isolation for production.**

The Payroll Engine remains unchanged for future SARS updates. Legislation is the only surface that grows.
