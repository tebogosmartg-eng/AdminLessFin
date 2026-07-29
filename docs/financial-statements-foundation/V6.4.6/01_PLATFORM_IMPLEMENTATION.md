# 01 — Platform Implementation Summary

**Version:** 6.4.6 Phase D2  

## Migration

`supabase/migrations/20260713240000_efs_v646_review_workflow.sql`

## Tables

| Platform | Tables |
|----------|--------|
| Review Workflow | `efs_pack_reviews` (stage spine) |
| Review Assignment | `efs_pack_review_assignments` |
| Notes / Queries / Responses | `efs_pack_review_notes`, `efs_pack_review_queries`, `efs_pack_review_responses` |
| Decisions | `efs_pack_review_decisions` (approve / reject / request_changes / escalate) |
| Digital Sign-off | `efs_pack_review_signoffs` (immutable) |
| Review History | `efs_pack_review_history` (append-only) |

## Edge methods

`GET_OR_CREATE_PACK_REVIEW`, `ASSIGN_PACK_REVIEWER`, `LIST_PACK_REVIEW_ASSIGNMENTS`,  
`SUBMIT_FOR_VALIDATION_COMPLETE`, `START_MANAGER_REVIEW`, `START_PARTNER_REVIEW`,  
`RECORD_REVIEW_DECISION`, `RESUBMIT_AFTER_CORRECTIONS`, `MARK_PUBLICATION_READY`,  
`ADD_PACK_REVIEW_NOTE`, `RAISE_REVIEW_QUERY`, `RESPOND_REVIEW_QUERY`,  
`LIST_PACK_REVIEW_NOTES`, `LIST_REVIEW_QUERIES`, `LIST_REVIEW_DECISIONS`,  
`LIST_REVIEW_SIGNOFFS`, `LIST_PACK_REVIEW_HISTORY`, `GET_REVIEW_DASHBOARD`

## Shared helpers

`supabase/functions/_shared/efsReviewWorkflow/index.ts`

## UI

`ReviewWorkflowPanel` inside flag-gated Financial Statements Workspace (no sidebar).

## Guarantees

- `mutates_accounting = false` (CHECK)  
- `publication_executed = false` (CHECK) — Publication not implemented  
- Distinct from C2 artefact-level `efs_review_notes` / `efs_reviewer_assignments`
