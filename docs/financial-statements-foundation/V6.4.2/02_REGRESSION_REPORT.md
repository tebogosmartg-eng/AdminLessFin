# 02 — Regression Report (Phase C1)

**Version:** 6.4.2  

| Gate | Result | Evidence |
|------|--------|----------|
| Statement hierarchy immutable | ✅ PASS | `efs_protect_published_structure` triggers |
| Statement nodes framework-neutral | ✅ PASS | Neutral codes (`STMT.*`, `LI.*`); labels overlay via packs |
| Framework Mapping still controls presentation | ✅ PASS | `taxonomy_line_code` bridge; Statement Engine / mapping modules not redesigned |
| No duplicated calculations | ✅ PASS | Structure stores no amounts |
| No live GL reads | ✅ PASS | Structure APIs are catalogue reads only |
| Existing Reports unchanged | ✅ PASS | No C1 edits to Reports ownership |
| Existing Navigation unchanged | ✅ PASS | No sidebar changes in C1 |
| Statement Engine unmodified | ✅ PASS | `_shared/efsStatementEngine/*` not edited in C1 |
| Facts Adapter unmodified | ✅ PASS | Same |
| Snapshot immutability unmodified | ✅ PASS | Phase A triggers retained |
| No WP / Lead / Notes / Validation / Review / Publication bodies | ✅ PASS | Attachment points `open` / `reserved` only |

| Check | Result |
|-------|--------|
| `tsc --noEmit` | PASS |

## Verdict

**Phase C1 regression gates: PASS**
