# South African Legislation Repository Report

**Product:** AdminLess Fin · **Version:** 3.4.1 · **Date:** 2026-07-12

## Verdict

The South African Legislation Repository is the **sole authoritative source** of statutory truth for AdminLess Fin. Tax-year packages under `versions/` own all SARS constants. The payroll engine remains legislation-agnostic.

## Layout

```
src/statutory/south-africa/
  registry/     # types, registry, resolver, loader, validation, adapter, provenance
  legislation/  # Act catalogs (docs only — no constants)
  versions/     # 2024-2025, 2025-2026, 2026-2027 packages
```

## Package interface

Every year exposes identical `SouthAfricanLegislation`: metadata, taxBrackets, rebates, medicalCredits, uif, sdl, retirement, travel, fringeBenefits, thresholds, allowances, deductions, irp5, emp201, validationRules, sourceDocuments.

Every scalar/table is `Traceable<T>` with legal provenance.

## Annual update (2027/2028)

1. Create `versions/2027-2028/`
2. Place evidence + complete `evidence-manifest.json`
3. Register `RULE_SET_2027_2028` in `registry/registry.ts`

No payroll/accounting/workflow/UI/journal/schema changes.
