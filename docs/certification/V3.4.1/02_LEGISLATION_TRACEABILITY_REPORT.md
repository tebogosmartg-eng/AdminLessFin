# Legislation Traceability Report

**Product:** AdminLess Fin · **Version:** 3.4.1 · **Date:** 2026-07-12

## Principle

No statutory value exists without evidence. Each constant is `Traceable` with `sourceDocument`, `page`, `section`, `effectiveDate`, `legalAuthority`.

## Reverse lookup

```ts
lookupProvenance('rebates.primary', RULE_SET_2026_2027)
// → value 17820 → Budget Tax Guide 2026 → page 2 → effective 2026-03-01 → ruleVersion 2026.2.0
```

Also: `lookupProvenanceForPayDate(path, payDate)`.

## Example chain (2026/2027 primary rebate)

| Step | Value |
|------|-------|
| Constant | Primary rebate |
| Value | 17820 |
| Source | Budget Tax Guide 2026 |
| Page | 2 |
| Authority | National Treasury / SARS |
| Effective | 2026-03-01 |
| Rule version | 2026.2.0 |

## Traceability gate: PASS
