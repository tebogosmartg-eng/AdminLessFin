# 7. Financial Statements Integration

**Version:** 6.8.0

## Principle

Financial Statements shall consume only approved accounting periods. The integration is read-only and flag-gated; the Financial Statements module itself is unchanged.

## Surface 1 — Readiness verification before generation

`PeriodReadinessNotice` (mounted in the New Engagement wizard, Generate step) calls `GET_PERIOD_READINESS` for the engagement's reporting period and displays:

- **Verified:** "Accounting period verified through Financial Close (…status…). Ready for Financial Statements."
- **Not ready:** the period status plus a direct link to complete the close.
- **No close:** a prompt to open a Financial Close for the period.

## Surface 2 — Accounting change detection

`AccountingChangesBanner` (mounted in the engagement workspace) compares the latest journal activity in the period against the time the trial balance was captured:

- If the period is **not locked** and journals changed after capture, display exactly:

  > **Accounting changes detected. Refresh Financial Statements?**

- Refresh is an **explicit user action** that chains the same certified APIs (new trial balance capture → certify → generate statements → run checks). **Never regenerates automatically.**
- Locked periods are final; no banner appears.

## Contract

| Rule | Enforcement |
|---|---|
| Read-only detection | `GET_PERIOD_READINESS` reads journal timestamps only |
| Never regenerate automatically | Refresh only fires on button click |
| FS module unchanged | Both surfaces are additive, flag-gated components; when `VITE_EFCP_*` flags are off they render nothing |
| No duplicated calculation | Refresh reuses `CREATE_SNAPSHOT_DRAFT` / `EXTRACT_FACT_SNAPSHOT` / `CERTIFY_SNAPSHOT_VERSION` / `GENERATE_STATEMENTS` / `RUN_VALIDATION` |
