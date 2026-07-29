# 4. Guided Workflow Standard

**Version:** 6.10.0

## Principle

The platform guides the accountant. The software determines the workflow automatically from existing dashboard payloads.

## Checklist items (accountant language)

| Item | Complete | Attention / Pending |
|---|---|---|
| Company information complete | Entity fields present | Missing registration / address |
| Reporting framework confirmed | Framework bound or recorded | Confirm framework |
| Financial year confirmed | Reporting period present | Confirm financial year |
| Generate Annual Financial Statements | Statements prepared | Generate AFS |
| Supporting Schedules | No outstanding schedules | N schedules outstanding |
| Resolve validation findings | Clear | Findings / warnings |
| Ready for Manager Review | Manager complete | Awaiting manager |
| Ready for Partner Review | Partner complete | Awaiting partner |
| Ready for Publication | Published / ready | Not yet ready |

## Glyphs

- ✓ complete
- ⚠ attention or blocking
- ○ pending

## Implementation

`buildPreparationChecklist` / `buildAttentionSummary` / `preparationStatusGlyph` in `engagementPreparation.ts`.

## Pass criteria

The checklist alone is sufficient to drive preparation from incomplete information through publication readiness.
