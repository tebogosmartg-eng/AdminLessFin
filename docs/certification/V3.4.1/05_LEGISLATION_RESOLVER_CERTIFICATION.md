# Legislation Resolver Certification

**Product:** AdminLess Fin · **Version:** 3.4.1 · **Date:** 2026-07-12

## API

```ts
resolveSouthAfricanLegislation(payDate | { payDate } | { taxYear })
```

## Behaviours certified

| Behaviour | Result |
|-----------|--------|
| Resolve by ISO pay date | PASS |
| Resolve by tax year label | PASS |
| Overlap detection throws | PASS |
| No match throws `LegislationResolutionError` | PASS |
| No default / previous-year fallback | PASS |
| Startup `assertLegislationRepositoryValid` | PASS |
| Date continuity (no gaps/overlaps) | PASS |
| Checksum verification | PASS |

## Resolver gate: PASS
