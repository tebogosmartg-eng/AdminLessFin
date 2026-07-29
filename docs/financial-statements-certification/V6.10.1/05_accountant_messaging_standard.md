# 5. Accountant Messaging Standard

**Version:** 6.10.1  
**Source of truth:** `src/lib/financialStatements/generationExperience.ts` (`GENERATION_COPY`)

## Canonical messages

| Situation | Message |
|---|---|
| Not prepared | Annual Financial Statements have not yet been prepared. |
| Already prepared + changed | Annual Financial Statements have already been prepared. The accounting information has changed since the last generation. Would you like to refresh the Financial Statements? |
| Up to date | Financial Statements are up to date. |
| Needs refresh (banner) | Financial Statements require refreshing because accounting information has changed. |
| Generate success | Annual Financial Statements prepared successfully |
| Refresh success | Financial Statements refreshed |

## Forbidden messages (accountant surfaces)

- Snapshot exists / Lineage exists / Duplicate lineage
- Create Draft / Snapshot Version / Draft Version
- Extract & seal / Certify / Freeze / Framework Binding
- SQLSTATE / PostgREST / unique constraint details

## Error translation

`accountantPrepareErrorMessage` maps platform failures (including duplicate lineage / snapshot wording) to:

> Financial Statements could not be prepared. Please try again.

Activity feed messages continue through `humanizeActivityMessage`.

## Allowed button labels

Generate Annual Financial Statements · Refresh Financial Statements · View Financial Statements · Download PDF · Download Word · Download Excel · Review Notes · Open Supporting Schedules · Cancel

## Pass criteria

No engineering terminology appears in toasts, banners, empty states, or primary buttons on accountant surfaces.
