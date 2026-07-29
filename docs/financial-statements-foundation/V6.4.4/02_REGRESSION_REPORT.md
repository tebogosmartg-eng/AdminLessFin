# 02 — Regression Report (Phase C3)

**Version:** 6.4.4  

| Gate | Result |
|------|--------|
| Every disclosure attaches to certified Statement Structure | ✅ PASS — trigger `efs_assert_disclosure_attachment` + `note_placeholder` API |
| Disclosures link to Working Papers where applicable | ✅ PASS — `working_paper_id` + `efs_disclosure_content_references` |
| Framework packs determine required disclosures | ✅ PASS — `efs_framework_disclosure_mappings` + `ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK` |
| No duplicated statement content | ✅ PASS — disclosures store narrative/table presentation only; Statement Instances unchanged |
| No duplicated calculations | ✅ PASS — no calc engine; tables store `rows_json`/`columns_json` only; optional snapshot_version_id reference |
| Accounting untouched | ✅ PASS — no Accounting schema/engine edits |
| Statement Engine untouched | ✅ PASS — `efsStatementEngine/*` not modified |
| Navigation unchanged | ✅ PASS — `shouldShowFinancialStatementsNav()` returns false; no sidebar FS item |
| Feature flags remain OFF by default | ✅ PASS |
| No Validation / Review Workflow / Publication / XBRL / AI | ✅ PASS |

| Check | Result |
|-------|--------|
| `tsc --noEmit` | PASS |
| C1 structure immutability triggers | RETAINED |
| C2 WP / Lead attachment triggers | RETAINED |

## Verdict

**Phase C3 regression gates: PASS**
