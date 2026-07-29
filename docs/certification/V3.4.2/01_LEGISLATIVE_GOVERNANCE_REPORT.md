# Legislative Governance Report

**Product:** AdminLess Fin · **Version:** 3.4.2 · **Date:** 2026-07-12

## Verdict

Enterprise legislative governance is hardened: country-agnostic registry, domain-isolated year packages, full provenance, document catalogues, and fail-fast `verifyLegislation()`.

## Architecture

```
src/statutory/
  registry/                 # country-agnostic resolve + verify
  countries/
    south-africa/years/…    # ZA packages with legislation/* domains
    namibia/                # registered, packages pending
    botswana/               # registered, packages pending
  south-africa/index.ts     # backward-compat re-exports
  index.ts
```

## Locked surfaces

Payroll Engine, calculations, accounting, workflows, journals — **unchanged**.

## Success path

New country or tax year = create package + documents + register. No engine/UI/accounting changes.
