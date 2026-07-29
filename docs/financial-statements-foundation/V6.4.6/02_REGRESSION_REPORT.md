# 02 — Regression Report (Phase D2)

**Version:** 6.4.6  

| Gate | Result |
|------|--------|
| Review never changes accounting balances | ✅ PASS — CHECK + no Accounting/GL/statement amount writes |
| Review consumes Validation Results | ✅ PASS — `validation_run_id` gate via `requireValidationReady` |
| Review consumes Working Papers | ✅ PASS — fingerprint + note/query linkages |
| Review consumes Disclosures | ✅ PASS — fingerprint + linkages |
| Review consumes Statement Instances | ✅ PASS — fingerprint statements content hashes |
| Immutable review history | ✅ PASS — UPDATE/DELETE denied on `efs_pack_review_history` |
| Digital sign-offs | ✅ PASS — immutable `efs_pack_review_signoffs` + signature_hash |
| Multi-company | ✅ PASS — `company_id` + RLS |
| Existing Accounting unchanged | ✅ PASS |
| Existing Navigation unchanged | ✅ PASS — nav still false |
| No Publication / XBRL / AI | ✅ PASS |

| Check | Result |
|-------|--------|
| `tsc --noEmit` | PASS |
| C2 artefact review methods retained | RETAINED (`ADD_REVIEW_NOTE` WP path) |
| D1 Validation retained | RETAINED |

## Verdict

**Phase D2 regression gates: PASS**
