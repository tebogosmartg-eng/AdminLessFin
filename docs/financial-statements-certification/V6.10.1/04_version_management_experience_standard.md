# 4. Version Management Experience Standard

**Version:** 6.10.1

## Principle

Version history remains completely internal.  
The platform automatically determines current, latest, historical, draft, and published versions.

## Accountant never sees

- Current Version / Latest Version / Historical Versions
- Draft Version / Published Version labels as engineering status
- Lineage key (`primary`)
- Rollback controls
- Version numbers (`v1`, `v2`)

## Platform behaviour (unchanged backends)

| Accountant action | Internal decision (examples) |
|---|---|
| Generate (first time) | Create or reuse workspace; create/reuse primary lineage; create Version 1; seal; generate |
| Refresh | Reuse primary lineage; create Version N successor when required; seal; regenerate; validate |
| Frozen / publication-bound | `force_successor` applied silently when needed |

## Duplicate lineage prevention

UNIQUE `(workspace_id, lineage_key)` remains enforced. Experience layer never asks the user to resolve duplicates; platform reuses lineage.

## Pass criteria

Accountants complete Generate / Refresh without learning versioning vocabulary. Existing Snapshot Version Manager behaviour is preserved.
