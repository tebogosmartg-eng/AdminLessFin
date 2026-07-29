# Chart of Accounts — Security Report

**Date:** 2026-07-29

## Verdict

**PASS** — System-account identity is enforced at database, API and UI layers.

## Controls

| Layer | Control | Evidence |
|-------|---------|----------|
| Database | `trg_chart_of_accounts_protect_system` BEFORE UPDATE/DELETE | `evidence/db-trigger-cert.json` (9/9) |
| Edge Function | Pre-check on PUT/DELETE for `system_account` | `evidence/api-system-block-detail.json` |
| UI | Delete menu replaced; type select disabled | Playwright UI + `evidence/system-account-ui.json` |
| AuthZ | Admin-only for POST/PUT/DELETE/GENERATE; membership required | Existing edge function gate (unchanged) |

## Immutable vs mutable (system accounts)

| Field / action | Allowed |
|----------------|---------|
| Delete | No |
| `type` | No |
| `account_role` | No |
| `system_account` | No |
| `control_account` | No |
| `name` (rename) | Yes |
| `account_code` | Yes |
| `description` | Yes |
| `is_active` (deactivate) | Yes |

## Bypass analysis

- Service-role updates still hit the BEFORE trigger — cannot clear system flag or delete.
- Edge function uses service role for writes but applies application-level checks first.
- Ordinary (non-system) accounts retain full CRUD.

## Residual security notes

1. Platform maps system-protection `Error` throws to HTTP 500 / `UnknownPlatformError` rather than a typed 409/422. Functional denial is correct; status taxonomy is a platform hardening opportunity (pre-existing pattern).
2. Spaceman certification tenant has **no** `system_account=true` rows (legacy chart). Protection is proven on generator-seeded CERT COA tenants.
