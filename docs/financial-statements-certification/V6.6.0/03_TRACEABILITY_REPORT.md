# 03 — Traceability Report (V6.6.0)

**Scope:** Statutory reporting chain from Accounting through Publication  
**Run date:** 2026-07-14

## Summary

Live traceability verification was **not executed** (E2E credentials missing). The architecture traceability chain is **code- and schema-verified** below.

## Canonical traceability chain

```
Accounting (live GL — seal time only)
  ↓ EXTRACT_FACT_SNAPSHOT
efs_fact_snapshots (immutable dataset + content_hash + source_rpc_refs)
  ↓ GENERATE_STATEMENTS
efs_statement_instances (lines, fact_snapshot_id, content_hash, provenance)
  ↓ GET_STATEMENT_STRUCTURE
efs_structure_nodes (node_code, node_kind, path)
  ↓ attachment
efs_working_papers / efs_lead_schedules / efs_supporting_evidence
  ↓ ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK
efs_disclosure_instances → efs_cross_references
  ↓ RUN_VALIDATION
efs_validation_issues (links to structure_node, disclosure, WP, statement)
  ↓ Review Workflow
efs_pack_review_signoffs (pack_fingerprint + signature_hash)
  ↓ Publication (deferred)
[Not implemented]
```

## Schema sources

| Layer | Migration |
|-------|-----------|
| Foundation / snapshots | `20260713203152_efs_v640_financial_statements_foundation.sql` |
| Statement engine | `20260713204113_efs_v641_statement_engine.sql` |
| Statement structure | `20260713210000_efs_v642_statement_structure.sql` |
| Working papers | `20260713211000_efs_v643_working_paper_platform.sql` |
| Disclosures | `20260713220000_efs_v644_disclosure_platform.sql` |
| Validation | `20260713230000_efs_v645_validation_platform.sql` |
| Review workflow | `20260713240000_efs_v646_review_workflow.sql` |

## Statement amount → snapshot trace

| Statement line | Source |
|----------------|--------|
| `sfp.total_assets` | Sealed fact buckets via `classifyFactsToTaxonomy()` |
| `perf.result` | Revenue − expenses from sealed period activity |
| `cf.net_change` | Cash flow buckets or RPC fallback at seal time |
| `eq.period_result` | Links to performance result in equity roll-forward |

Engine: `supabase/functions/_shared/efsStatementEngine/statementEngine.ts`

**Hard rule:** `runStatementEngine()` requires sealed facts with `content_hash`. Post-generation, statements never read live GL.

Each `efs_statement_instances` row stores:

- `fact_snapshot_id` — FK to sealed facts
- `content_hash` — deterministic hash of generated lines
- `provenance` — `{ live_gl: false, fact_snapshot_id, content_hash }`

## Disclosure → structure trace

Disclosures attach via:

- `structure_node_id` on `efs_disclosure_instances`
- `efs_framework_disclosure_mappings` — framework pack → disclosure codes
- `CREATE_CROSS_REFERENCE` — disclosure → structure node / working paper

Platform: `supabase/functions/_shared/efsDisclosurePlatform/index.ts`

## Working paper → statement node trace

Working papers require `structure_node_id` at creation (`CREATE_WORKING_PAPER`). Attachment points on `efs_attachment_points` define socket kinds: `working_paper`, `lead_schedule`, `supporting_evidence`, `note_placeholder`, `validation_result`, `cross_reference`.

Platform: `supabase/functions/_shared/efsWorkingPaperPlatform/index.ts`

## Review → pack fingerprint trace

On manager/partner approve (`RECORD_REVIEW_DECISION`):

- `buildPackFingerprint()` hashes statements + disclosures + WPs + validation run
- Immutable row in `efs_pack_review_signoffs` with `signature_hash` (SHA-256)

Platform: `supabase/functions/_shared/efsReviewWorkflow/index.ts`

## Live traceability evidence

When `npm run certify:efs` runs with credentials, the harness writes populated traceability keys to:

`docs/financial-statements-certification/V6.6.0/evidence/e2e-certification-evidence.json`

Current run: **empty traceability object** (no authenticated engagement).

## Verification checklist

| Link | Architecture | Live verified |
|------|--------------|---------------|
| Statement amount → Fact Snapshot | ✅ | ❌ |
| Disclosure → Structure node | ✅ | ❌ |
| Working Paper → Structure node | ✅ | ❌ |
| Validation issue → affected entity | ✅ | ❌ |
| Sign-off → pack fingerprint | ✅ | ❌ |
| Publication → sealed pack | ❌ (not implemented) | ❌ |

## Verdict

**Architectural traceability: PASS (design-time)**  
**End-to-end traceability on live engagement: NOT VERIFIED**
