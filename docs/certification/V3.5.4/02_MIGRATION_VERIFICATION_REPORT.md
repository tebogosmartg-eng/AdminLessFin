# Migration Verification Report

**Product:** AdminLess Fin · **Version:** 3.5.4 · **Date:** 2026-07-12

---

## Migration B — `20260707120000_payslip_item_employer_contribution`

| Gate | Result | Evidence |
|------|--------|----------|
| Migration completed | ✓ | `evidence/01-apply-B.json` (empty rows = DDL success) |
| Enum contains `employer_contribution` | ✓ | sortorder **5** in `evidence/01-post-B-enum.json` |
| Existing payslip rows unchanged | ✓ | items fingerprint `a5f9bfc79a11bf3707049dfde7318341` unchanged |
| Existing payroll runs unchanged | ✓ | finalized fingerprint `9a6f5e0930f42d85ac862178a0443111` unchanged |
| Integrity post-B | ✓ | `evidence/01-post-B-integrity.json` ≡ pre |

**Migration B verified — proceed permitted.**

---

## Migration A — `20260707140000_tax_year_2026_2027`

| Gate | Result | Evidence |
|------|--------|----------|
| `2026/2027` row exists | ✓ | `evidence/02-post-A-tax.json` |
| Effective dates | ✓ | `2026-03-01` → `2027-02-28`, `is_active=true` |
| No overlaps | ✓ | adjacency `contiguous` |
| No gaps | ✓ | `prev_to=2026-02-28`, next `2026-03-01` |
| Resolver ≥ 2026-03-01 → `2026/2027` | ✓ | `evidence/02-post-A-resolve.json` |
| Boundary checks | ✓ | `2026-02-28`→`2025/2026`; `2026-03-01`/`2026-07-31`/`2026-12-31`/`2027-02-28`→`2026/2027`; `2027-03-01`→null |
| Integrity post-A | ✓ | fingerprints still ≡ pre (`evidence/02-post-A-integrity.json`) |

**Migration A verified — proceed permitted.**
