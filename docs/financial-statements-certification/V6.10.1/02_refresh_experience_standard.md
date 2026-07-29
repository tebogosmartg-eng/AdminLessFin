# 2. Refresh Experience Standard

**Version:** 6.10.1

## When refresh is offered

Refresh is offered only when the platform detects that accounting information changed after the last statement preparation (journals after capture; period not locked).

Detection uses the certified Financial Close readiness payload (`latest_journal_at` vs last certify/freeze timestamp). No Statement Engine or Snapshot Engine changes.

## Refresh prompt copy

> Annual Financial Statements have already been prepared.  
> The accounting information has changed since the last generation.  
> Would you like to refresh the Financial Statements?

**Primary:** Refresh Financial Statements  
**Secondary:** Cancel  
**Optional:** View Financial Statements (read current set while deciding)

## After Cancel

The accountant may continue viewing existing statements. Refresh is not forced. The workspace banner may still remind that a refresh is available.

## After Refresh

Platform silently:

1. Reuses or creates snapshot lineage (internal)
2. Creates the next draft version if required (internal)
3. Extracts / certifies / generates / validates via existing APIs

Accountant toast: **Financial Statements refreshed**

## Never

- Auto-refresh without confirmation
- Ask the accountant which version or lineage to create
- Display “Create Draft” or “duplicate lineage” messages

## Pass criteria

Refresh is a single professional decision (“update statements because books changed”), not a pipeline wizard.
