# Registry Report

**Product:** AdminLess Fin · **Version:** 3.4 · **Date:** 2026-07-12

---

## Purpose

`registry/legislationRegistry.ts` is the **only** place that owns and exposes legislative versions.

---

## Responsibilities

| Function | Role |
|----------|------|
| `LEGISLATION_REGISTRY` | Map of domain → readonly version arrays |
| `getDomainVersions(domain)` | Read versions for one domain |
| `findVersionForDate(versions, payDate)` | Pure date match helper (used by resolver) |
| Named `PAYE_*`, `UIF_*`, … exports | Explicit registration symbols |

---

## Registration checklist (new version)

1. Create version folder under the domain.
2. Export `DOMAIN_YYYY_YYYY` implementing the domain contract.
3. Append to the domain’s `*_VERSIONS` array.
4. Re-export from `legislationRegistry.ts` if a named export is required for docs/CI.

No other component may invent or hardcode versions.

---

## Registry gate: PASS
