# Resolver Report

**Product:** AdminLess Fin · **Version:** 3.4 · **Date:** 2026-07-12

---

## API

```ts
resolveSouthAfricanLegislation(payDate) → SouthAfricanLegislation
```

Returns:

```ts
{
  payDate, countryCode: 'ZA',
  paye, uif, sdl, medical, retirement, travel,
  fringeBenefits, irp5, emp201, bcea, coida, skillsDevelopment
}
```

---

## Fail-fast

If **any** domain has no matching version for `payDate`:

- Throw `LegislationResolutionError`
- Do **not** fallback, guess, reuse prior year, or default

After composition, `validateSouthAfricanLegislation` asserts metadata coverage and PAYE brackets presence.

---

## Helpers

| API | Behaviour |
|-----|-----------|
| `requireLegislationByTaxYear(label)` | Resolve using PAYE version’s `effectiveFrom` |
| `getLegislationByTaxYear(label)` | Same, or `undefined` if PAYE label missing |
| `getAllRegisteredLegislation()` | Composed snapshots for each PAYE year (engine adapter compat) |

---

## Engine bridge

`legislationToStatutoryRuleSet` flattens the composed snapshot into `StatutoryRuleSet` for the locked calculation engines — engines remain unaware of domain versioning.

---

## Resolver gate: PASS
