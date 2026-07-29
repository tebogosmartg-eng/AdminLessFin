# South African Statutory Architecture Report

**Product:** AdminLess Fin  
**Version:** 3.3  
**Board:** Independent Principal Payroll Architecture Board  
**Date:** 2026-07-12  
**Classification:** Legislative Architecture Isolation

---

## Verdict

South African statutory legislation is isolated into `src/statutory/south-africa/`. The payroll calculation engine no longer owns SARS constants. Future tax years require only a new tax-year folder plus registry registration.

---

## Target flow (implemented)

```
Payroll Run
    ↓
Resolve Tax Year (pay date)
    ↓
Resolve South African Legislation Package  (registry)
    ↓
legislationToStatutoryRuleSet()            (adapter only)
    ↓
Payroll Engine                             (calculations only)
    ↓
Calculation Snapshot
```

---

## Module layout

```
src/statutory/south-africa/
  index.ts
  registry/
    legislationTypes.ts      # SouthAfricanLegislation contract
    registry.ts              # REGISTERED_SOUTH_AFRICAN_LEGISLATION
    resolveLegislation.ts    # resolveSouthAfricanLegislation(payDate)
    toStatutoryRuleSet.ts    # adapter → StatutoryRuleSet
  tax-years/
    2024-2025/               # self-contained package
    2025-2026/
    2026-2027/
```

Edge runtime mirror (deployment constraint — Deno cannot import `src/`):

```
supabase/functions/_shared/statutory/south-africa/
```

Canonical source of truth: **`src/statutory/south-africa/`**. Edge tree must remain a sync of that module.

---

## Interface contract

Every package exposes exactly `SouthAfricanLegislation`:

| Property | Contents |
|----------|----------|
| `taxYear` / `ruleVersion` / `effectiveFrom` / `effectiveTo` | Package identity |
| `taxBrackets` | PAYE brackets |
| `rebates` | Primary / secondary / tertiary |
| `medicalCredits` | §6A medical tax credits |
| `uif` | Ceiling + employee/employer rates |
| `sdl` | Rate + exemption threshold |
| `retirement` | Cap, rate, lump-sum table, death/severance |
| `travel` | Prescribed km rate + deemed inclusion % |
| `fringeBenefits` | Seventh Schedule rates |
| `thresholds` | Rebate ages + tax thresholds |
| `irp5` | IRP5 source-code mappings |
| `emp201` | EMP201 field mappings |

No package may add or omit properties.

---

## Locked domains (unchanged)

| Domain | Status |
|--------|--------|
| Payroll Architecture | LOCKED |
| Payroll Workflow | LOCKED |
| Accounting / Journals | LOCKED |
| BOE | LOCKED |
| Commands / Events / Subscribers | LOCKED |
| Security | LOCKED |
| Statutory calculation formulas | LOCKED (not modified) |

---

## How to add SARS 2027/2028

1. Create `src/statutory/south-africa/tax-years/2027-2028/` (same file set as prior years).
2. Register `RULE_SET_2027_2028` in `registry/registry.ts`.
3. Sync edge mirror under `supabase/functions/_shared/statutory/`.
4. Seed matching `payroll_tax_year_config` DB row (operational config — not engine code).

**No payroll engine, workflow, accounting, reporting, or UI code changes are required.**

---

## Success criteria assessment

| Criterion | Result |
|-----------|--------|
| Legislation isolated from payroll engine | PASS |
| Single interface per package | PASS |
| Registry selects legislation | PASS |
| Fail-fast on unresolved legislation | PASS |
| No silent DEFAULT_TAX_YEAR in engine paths | PASS |
| Adding a year = folder + register | PASS |
