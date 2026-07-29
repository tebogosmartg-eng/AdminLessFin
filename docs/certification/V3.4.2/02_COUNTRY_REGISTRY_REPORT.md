# Country Registry Report

**Product:** AdminLess Fin · **Version:** 3.4.2 · **Date:** 2026-07-12

## Registry

| Code | Slug | Packages |
|------|------|----------|
| ZA | south-africa | 2024/2025, 2025/2026, 2026/2027 |
| NA | namibia | 0 (stub) |
| BW | botswana | 0 (stub) |

## Resolution

```ts
resolveLegislation({ countryCode: 'ZA', payDate: '2025-06-15' })
```

Unresolved country/date/year → `LegislationResolutionError` (no fallback).

## Country registry gate: PASS
