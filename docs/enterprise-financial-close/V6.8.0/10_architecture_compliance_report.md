# 10. Architecture Compliance Report

**Version:** 6.8.0  
**Certification question:** Is the Financial Close Platform an experience + orchestration layer that preserves every frozen component?

## Answer

**YES.**

## Gate evidence

| Gate | Evidence |
|---|---|
| No backend redesign | No existing Edge Function modified; `financial-close` is a new, separate function |
| No Statement Engine redesign | `_shared/efsStatementEngine` untouched |
| No Reporting Snapshot redesign | Snapshot tables/methods untouched; refresh reuses existing methods |
| No General Ledger redesign | GL tables only read (counts/timestamps); never written |
| No Journal redesign | Journal tables only read; posting paths untouched |
| No duplicated calculations | Readiness derives from statuses/counts; no balances computed or stored |
| No duplicated ownership | Accounting owns facts; Validation owns issues; EFS owns statements; Close owns only its checklist/approvals/period status |
| Existing APIs preserved | `financial-statements`, `accounting`, `reports`, `financial-year` dispatchers unchanged |
| Existing database preserved | New `efcp_*` tables only; zero `ALTER` on existing tables |
| Existing migrations preserved | All prior migration files untouched |
| Existing routes preserved | New routes appended; `/financial-statements*`, `/reconciliation` etc. unchanged |
| Existing feature flags preserved | `VITE_EFS_*` untouched; new `VITE_EFCP_*` namespace; backend honours existing `EFCP_SILENT_BACKENDS` convention |
| Financial Statements unchanged | Only additive flag-gated notice/banner components mounted in FS surfaces |
| Experience layer + orchestration only | Close platform coordinates state and reads signals; never mutates accounting or statements |

## Consistency with V6.1.0 / V6.1.1 EFCP architecture certification

The implementation follows the certified logical architecture: close workspace lifecycle, checklist instantiation, readiness evaluation, `close.*` event namespace in Close History, `efcp.*`-style flags (`VITE_EFCP_MODULE`, `VITE_EFCP_WORKSPACE_UI`, `VITE_EFCP_NAV_SIDEBAR`, `VITE_EFCP_ALLOWLIST`), and the suggested `/financial-close` route family. Accounting ownership boundaries defined in V6.1.0 are honoured.

## Compliance verdict

**ARCHITECTURE COMPLIANT — ADDITIVE ORCHESTRATION AND EXPERIENCE LAYER ONLY**
