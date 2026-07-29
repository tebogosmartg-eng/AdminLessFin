# V6.6.1 Regression Assessment — Engagement-Based Experience

## Scope

Experience-layer transformation only. Architecture frozen through V6.4.x / V6.5.x platforms.

## Untouched surfaces (must remain valid)

| Surface | Status |
|---|---|
| Accounting RPCs (`get_balances_as_of_date`, `get_period_activity`, `get_cash_flow_statement`) | Untouched |
| Journal Engine / General Ledger / Chart of Accounts | Untouched |
| Statement Engine (`efsStatementEngine`) | Untouched |
| Reporting Snapshot create/extract/certify/freeze | Untouched (still invoked by orchestrator) |
| Statement Structure / Attachment Points | Untouched |
| Working Paper Platform | Untouched |
| Disclosure Platform | Untouched |
| Validation Engine | Untouched |
| Review Workflow | Untouched |
| Publication Platform | Untouched |
| Existing migrations V6.4.0–V6.4.7 | Untouched |
| Existing dispatcher methods | Untouched (no edits to prior cases) |
| Legacy route `/financial-statements` (live GL reports) | Untouched |
| Feature flags `VITE_EFS_*` / `EFS_MODULE` / `EFS_PUBLICATION` | Untouched |
| Routes `/financial-statements-workspace` (+ `:workspaceId`) | Preserved |

## Additive changes only

1. Migration `20260717164216_efs_v661_engagement_general_information.sql`
   - New table `efs_engagement_general_information`
   - RLS mirrors existing EFS company-member pattern
2. Dispatcher cases appended (no existing case modified):
   - `GET_ENGAGEMENT_GENERAL_INFORMATION`
   - `UPSERT_ENGAGEMENT_GENERAL_INFORMATION`

## Experience-layer changes

- Client orchestrator: `src/lib/financialStatements/orchestrator.ts`
- Presentation labels: `src/lib/financialStatements/presentation.ts`
- Wizard: `src/pages/financialStatements/NewEngagementWizard.tsx`
- Engagement tabs under `src/pages/financialStatements/experience/`
- Home + dashboard reworked to engagement UX; internal console retained as Advanced
- Sidebar collapsed to single "Annual Financial Statements" entry

## Risk notes

- Orchestrator is client-side and resume-safe; failures leave workspace in a recoverable state via Advanced pipeline or re-running Generate.
- General Information table must be applied before Step 1 persistence works in remote environments.
- Certification harness drift documented under V6.6.0 remains out of scope for this experience release.
