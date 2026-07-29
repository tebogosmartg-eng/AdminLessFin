# 3. Overview Dashboard Standard

**Version:** 6.10.0

## Purpose

The Overview is the accountant's dashboard. It immediately answers what to do next.

## Required fields

| Field | Source (experience layer) |
|---|---|
| Engagement Status | `workspaceStatusLabel(dashboard.workspace.status)` |
| Reporting Framework | Framework name / general information reporting framework |
| Financial Year | Reporting period label / dates |
| Prepared By | Engagement general information |
| Reviewed By | Reviewed / approved by + manager / partner review status |
| Overall Readiness | Derived from guided checklist (`overallReadiness`) |
| Next Recommended Action | First blocking → attention → pending checklist item |
| Outstanding Items | Incomplete checklist labels |
| Recent Activity | Activity feed via `humanizeActivityMessage` |

## Guided checklist (primary)

Displayed with glyphs ✓ / ⚠ / ○ and navigates to the relevant tab.

## Implementation

- `src/pages/financialStatements/experience/EngagementOverview.tsx`
- `src/lib/financialStatements/engagementPreparation.ts`

## Pass criteria

An accountant opening Overview knows engagement status, what is outstanding, and the single next recommended action without consulting Advanced tools.
