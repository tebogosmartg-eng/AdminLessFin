# 5. Navigation Standard

**Version:** 6.10.0

## App navigation

Sidebar: **Financial Statements → Annual Financial Statements** → `/financial-statements-workspace`  
(Gated by existing `VITE_EFS_*` flags and access helpers.)

## Engagement sidebar (accountant only)

Defined as `ACCOUNTANT_NAV` in `FinancialStatementsWorkspaceDashboard.tsx`:

1. Overview  
2. Information  
3. Financial Statements  
4. Supporting Schedules  
5. Notes & Disclosures  
6. Validation  
7. Review  
8. Publication  

In-tab navigation uses React Tabs (no URL segment per tab). Existing routes preserved:

- `/financial-statements-workspace`
- `/financial-statements-workspace/:workspaceId`

## Excluded from standard navigation

- Reporting Snapshot panels
- Pipeline controls
- Framework pack binding UI
- Fingerprints / hashes / diagnostics
- Legacy Advanced twin panels

## Pass criteria

A first-time accountant never needs a second navigation model to prepare AFS.
