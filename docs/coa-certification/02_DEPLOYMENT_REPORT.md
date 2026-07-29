# Chart of Accounts — Deployment Report

**Date:** 2026-07-29  
**Project:** zaulhnpohrgqqodvzhxp

## Verdict

**PASS** — `chart-of-accounts` Edge Function deployed and exercised against live tenant.

## Deployments

| Asset | Command | Result |
|-------|---------|--------|
| DB migrations | `supabase db push --linked` | Success |
| Edge Function `chart-of-accounts` | `supabase functions deploy chart-of-accounts --project-ref zaulhnpohrgqqodvzhxp` | Deployed (twice: initial + after accountRoles sync) |

Dashboard: https://supabase.com/dashboard/project/zaulhnpohrgqqodvzhxp/functions

## Endpoint verification

Evidence: `evidence/api-endpoint-smoke.json`, `evidence/api-system-block-detail.json`

| Method | Status | Notes |
|--------|--------|-------|
| GET | 200 | Returns balances + `account_role` / `system_account` metadata merge |
| LIST_TEMPLATES | 200 | Catalog available |
| POST | 200 | Disposable cert account created |
| PUT | 200 | Rename + new-role assignment |
| DELETE | 200 | Disposable account removed |
| GENERATE | 409 | Correct conflict when chart already generator-sourced |

## System-account API (defense-in-depth)

| Action | HTTP | technicalMessage |
|--------|------|------------------|
| DELETE system account | ≥400 | `System account "Retained Earnings" cannot be deleted...` |
| Change type | ≥400 | `This is a system account. Its type cannot be changed...` |
| Rename | 200 | Allowed |
| Deactivate | 200 | Allowed |

Note: Platform error envelope maps thrown `Error` to category `UnknownPlatformError` (HTTP 500) for identity violations. Access is denied; message is correct in `technicalMessage`. Pre-existing platform error mapping — not a CoA logic defect.

## Frontend build

`npm run build` — success (required for Playwright `vite preview` certification).
