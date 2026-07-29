# 2. Engagement Dashboard Blueprint

**Version:** 6.6.3  
**Surface:** Overview (post-generation landing)

## Purpose

This is an **engagement dashboard**, not a software dashboard.

It answers only:

1. What is outstanding?
2. What is complete?
3. What needs my attention?
4. What is blocking publication?

## Continue Preparation

Primary CTA: **Continue Preparing Annual Financial Statements**

Checklist examples (derived from live engagement state):

- ✓ Company Information Complete
- ✓ Statements Generated
- ✓ Notes Generated
- ⚠ Supporting Schedules Outstanding
- ⚠ Validation Issues
- ○ Awaiting Manager Review
- ○ Awaiting Partner Review
- ○ Ready for Publication

Selecting an item or the primary CTA navigates to the next logical engagement section.

## Supporting widgets (secondary)

- Engagement progress (accountant status labels)
- Validation summary (critical / information counts)
- Review (manager / partner)
- Publication status
- Reporting period, framework, prepared by
- Recent activity (humanised language)

## Implementation

- Blueprint logic: `src/lib/financialStatements/engagementPreparation.ts`
- UI: `src/pages/financialStatements/experience/EngagementOverview.tsx`

## Non-goals

No pipeline diagnostics, snapshot version numbers, content hashes, or module-picker language on this surface.
