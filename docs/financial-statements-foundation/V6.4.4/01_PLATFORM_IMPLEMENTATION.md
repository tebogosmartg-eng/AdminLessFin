# 01 — Platform Implementation Summary

**Version:** 6.4.4 Phase C3  

## Migration

`supabase/migrations/20260713220000_efs_v644_disclosure_platform.sql`

## Capabilities

| Entity | Status lifecycle |
|--------|------------------|
| Disclosure Instance | draft → in_progress → complete → superseded |
| Accounting Policy Set | draft → active → superseded |
| Cross Reference | active → superseded |

## Edge methods

`LIST_DISCLOSURE_TEMPLATES`, `LIST_FRAMEWORK_DISCLOSURE_MAPPINGS`,  
`LIST/CREATE_DISCLOSURE_INSTANCE`, `ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK`,  
`UPDATE_DISCLOSURE_SECTION`, `UPDATE_DISCLOSURE_PARAGRAPH`, `UPDATE_DISCLOSURE_TABLE`,  
`TRANSITION_DISCLOSURE_STATUS`, `LINK_DISCLOSURE_WORKING_PAPER`,  
`LIST/CREATE_DISCLOSURE_REFERENCE`,  
`CREATE/LIST_ACCOUNTING_POLICY_SET`, `UPSERT_ACCOUNTING_POLICY`, `TRANSITION_ACCOUNTING_POLICY_SET`,  
`CREATE/LIST_CROSS_REFERENCE`,  
`GET_DISCLOSURE_DASHBOARD`

## Shared helpers

`supabase/functions/_shared/efsDisclosurePlatform/index.ts`

## UI

`DisclosurePanel` inside flag-gated Financial Statements Workspace (no sidebar).

## Ownership boundary

Disclosure Platform owns Notes · Accounting Policies · Disclosure Templates · Cross References · Framework Disclosure Rules.  
It does **not** recalculate statement amounts and does **not** implement Validation.
