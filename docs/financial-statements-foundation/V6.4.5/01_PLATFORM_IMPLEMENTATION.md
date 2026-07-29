# 01 — Platform Implementation Summary

**Version:** 6.4.5 Phase D1  

## Migration

`supabase/migrations/20260713230000_efs_v645_validation_platform.sql`

## Engines

| Engine | Scope |
|--------|--------|
| Technical | `TECH.*` rules — structure, xref, WP, attachments, evidence, snapshot, consistency |
| Framework | `FW.*` rules — pack mappings for IFRS / IFRS_SME / GRAP / MCS / IPSAS |

## Result model

| Field | Purpose |
|-------|---------|
| Validation Issue | Defect finding on a Validation Run |
| Severity | `blocking` · `significant` · `advisory` |
| Recommendation | Remediation guidance (no auto-fix) |
| Affected Statement Node | `structure_node_id` |
| Affected Disclosure | `disclosure_instance_id` |
| Affected Working Paper | `working_paper_id` |
| Resolution Status | `open` · `acknowledged` · `remediated` · `waived` (triage only) |

## Edge methods

`LIST_VALIDATION_RULES`, `LIST_FRAMEWORK_VALIDATION_MAPPINGS`,  
`RUN_VALIDATION`, `LIST_VALIDATION_RUNS`, `LIST_VALIDATION_ISSUES`,  
`RESOLVE_VALIDATION_ISSUE`, `GET_VALIDATION_DASHBOARD`

## Shared helpers

`supabase/functions/_shared/efsValidationPlatform/index.ts`

## UI

`ValidationPanel` inside flag-gated Financial Statements Workspace (no sidebar).

## Guarantees encoded

- `mutates_financial_data = false` (CHECK constraint)  
- `live_gl_read = false` (CHECK constraint)  
- `ready_for_review` is readiness signal — **not** approval  
- Completed runs are immutable (issue body sealed; resolution fields only mutable)
