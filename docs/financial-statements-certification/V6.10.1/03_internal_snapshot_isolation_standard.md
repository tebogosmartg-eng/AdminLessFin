# 3. Internal Snapshot Isolation Standard

**Version:** 6.10.1

## Rule

Reporting Snapshot is an **internal implementation**.  
It must not appear in the accountant Financial Statements experience.

## Isolated from accountant UI

| Internal concept | Accountant surface |
|---|---|
| Reporting Snapshot | Hidden |
| Snapshot Status / Version / Draft | Hidden |
| Lineage / Primary lineage | Hidden |
| Framework Binding (pipeline control) | Hidden |
| Extract / Seal Facts | Hidden |
| Certify / Freeze | Hidden |
| Generate from snapshot | Hidden |
| Content hashes / fingerprints | Hidden |

## Developer / Internal gate

Advanced console appears only when:

```
VITE_EFS_DEVELOPER_TOOLS === true
AND isFinancialStatementsInternalPersona(...)
```

Pipeline buttons further require `VITE_EFS_SNAPSHOT_PIPELINE`.

Default for accountant builds: `VITE_EFS_DEVELOPER_TOOLS` unset/false.

## Silent orchestration

Accountant Generate / Refresh calls `prepareStatements`, which chains existing certified methods:

`CREATE_SNAPSHOT_DRAFT` → `EXTRACT_FACT_SNAPSHOT` → `CERTIFY_SNAPSHOT_VERSION` → `GENERATE_STATEMENTS` → `RUN_VALIDATION`

No API redesign. No Edge Function redesign for this certification.

## Evidence

Grep of `src/pages/financialStatements/experience/` shows zero accountant-visible strings for snapshot / lineage / freeze / certify / seal / pipeline (comments only).

## Pass criteria

An accountant using default flags cannot discover Reporting Snapshots through the product UI.
