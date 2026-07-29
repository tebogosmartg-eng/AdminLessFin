# 1. Financial Statements Generation UX Standard

**Version:** 6.10.1  
**Audience:** Accountants preparing Annual Financial Statements

## Principle

The accountant prepares Annual Financial Statements.  
The platform owns generation, regeneration, versioning, and snapshot lineage.  
The accountant never chooses internal operations.

## Empty state (no statements)

**Display**

> Annual Financial Statements have not yet been prepared.

**Primary action**

- Generate Annual Financial Statements

No secondary engineering actions.

## Prepared state (statements exist)

Never present a second “generation” flow as the default UI.

Instead:

| Condition | UX |
|---|---|
| Accounting unchanged | “Financial Statements are up to date.” + view statements |
| Accounting changed | Refresh prompt (see Refresh Experience Standard) |

## Allowed accountant actions

- Generate Annual Financial Statements
- Refresh Financial Statements
- View Financial Statements
- Download PDF
- Download Word
- Download Excel
- Review Notes
- Open Supporting Schedules

## Forbidden actions on accountant surfaces

Create Draft, Extract Facts, Seal, Certify, Freeze, Bind Framework, Generate from Snapshot, New draft version, Lineage controls.

## Smart automation

`resolveGenerationMode({ hasStatements, accountingChanged })` returns:

- `generate_required`
- `refresh_required`
- `up_to_date`

The accountant never selects these modes manually.

## Pass criteria

A first-time accountant can prepare statements using only the Generate action, without learning AdminLess Fin internals.
