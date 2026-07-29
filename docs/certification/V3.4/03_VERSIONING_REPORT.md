# Versioning Report

**Product:** AdminLess Fin · **Version:** 3.4 · **Date:** 2026-07-12

---

## Principle

Every legislative domain maintains **independent** versions. The framework never assumes all domains change every tax year.

---

## Registered versions (V3.4)

For each domain, versions `2024-2025`, `2025-2026`, `2026-2027` are registered with independent effective windows:

| Version folder | Effective |
|----------------|-----------|
| 2024-2025 | 2024-03-01 → 2025-02-28 |
| 2025-2026 | 2025-03-01 → 2026-02-28 |
| 2026-2027 | 2026-03-01 → 2027-02-28 |

### Independent change examples already encoded

| Domain | 2024/25 → 2025/26 | 2025/26 → 2026/27 |
|--------|-------------------|-------------------|
| PAYE | Unchanged brackets/rebates | Budget 2026 brackets + rebates |
| Medical | Unchanged | Updated §6A credits |
| UIF / SDL / Travel / … | Unchanged rates | Unchanged rates |

Unchanged domains still have their own version folders for isolation, but a future year may omit a domain version until that Act changes — resolution then fails fast until the domain is extended or a new version is registered.

---

## Adding SARS 2027/2028 (PAYE only example)

1. Create `legislation/paye/versions/2027-2028/`
2. Register `PAYE_2027_2028` in `legislationRegistry.ts`
3. Extend or add versions for **every other domain** that must cover 2027/2028 pay dates (or extend `effectiveTo` on the prior domain version)

No Payroll Engine code changes.

---

## Versioning gate: PASS
