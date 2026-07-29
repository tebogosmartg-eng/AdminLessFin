# 04 — Architecture Compliance Report (Phase A)

**Version:** 6.4.0  
**Board:** Independent Principal Enterprise Implementation Board  

---

## Locked rules

| Rule | Compliance |
|------|------------|
| Do NOT redesign Accounting | ✅ |
| Do NOT redesign Reports | ✅ |
| Do NOT redesign Assets | ✅ |
| Do NOT move Accounting Reports | ✅ (not in Phase A scope; left as-is) |
| Do NOT duplicate accounting calculations | ✅ extract stores facts; no PAYE/VAT recompute |
| FS consumes Reporting Snapshots only | ✅ (consumers not yet built; seal path established) |
| Operational Reports use live balances | ✅ unchanged |
| No statement preparation in Phase A | ✅ |
| Navigation unchanged until authorised | ✅ |

---

## Immutability model

| Object | Rule |
|--------|------|
| `efs_fact_snapshots` | UPDATE/DELETE trigger raises `EFS_IMMUTABLE` |
| `efs_snapshot_versions` (certified+) | Content hash / extract / source refs immutable; freeze cannot regress to draft |
| New extracts after freeze | Require successor Snapshot Version (`force_successor`) |

---

## Framework catalogue (platform)

Seeded: IFRS, IFRS_SME, GRAP, MCS, IPSAS — version `2026.1` packs (structure packs only; statement definitions Phase B).

---

## Anti-pattern audit

| Forbidden pattern | Present? |
|-------------------|----------|
| Second GL in EFS tables | No — balances only inside sealed `dataset` jsonb on Fact Snapshot |
| Live GL publish path | No |
| Sidebar FS statutory item | No |
| WP / Lead tables | No (Phase C) |
| Statement instance tables | No (Phase B) |

---

## Verdict

**Architecture compliance: PASS for Phase A Foundation.**
