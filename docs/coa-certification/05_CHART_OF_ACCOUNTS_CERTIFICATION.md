# Chart of Accounts Certification

**Date:** 2026-07-29  
**Scope:** Claude CoA architectural enhancements — apply, deploy, verify, complete client role integration  
**Tenant evidence:** Spaceman `3cbfd4eb-…`, CERT COA `0a2ff5bb-…`

## Executive verdict

**CERTIFIED FOR PRODUCTION** with residual risks listed below.

Claude’s migrations and edge-function defense-in-depth are live. Client `accountRoles` vocabulary now matches the DB CHECK. System accounts are protected at DB, API and UI. Accounting identity survives display-name renames.

## Phase summary

| Phase | Result |
|-------|--------|
| 1 Review | No objective defects in Claude SQL / edge PUT-DELETE guards |
| 2 Migrations | Applied + verified |
| 3 Edge deploy | Deployed + endpoint smoke |
| 4 System accounts | DB 9/9, API 7/7, UI 1/1 |
| 5 Roles + rename | Vocabulary assignable; rename regression PASS |
| 6 Regression | tsc/eslint/unit/integration/Playwright CoA PASS |
| 7 Client completion | ACCOUNT_ROLES expanded; engines + fixtures restored |
| 8 Certification | This binder |

## Role coverage (canonical identity)

| Business role | Canonical `account_role` / identity | Verified |
|---------------|-------------------------------------|----------|
| Accounts Receivable | `trade_receivable` | Live Spaceman + rename |
| Accounts Payable | `trade_payable` | Live roles present |
| Sales | `sales` (assignable; template code 4010) | CHECK + API assign |
| Inventory | `inventory_asset` | Generated CoA |
| VAT Control / Output / Input | `vat_control` / `output_vat` / `input_vat` | Live |
| Cash / Bank | `cash` / `bank` **or** subcategory `Cash and Cash Equivalents` | Rename + engines |
| Payroll Control / Clearing | `payroll_control` / `payroll_clearing` | CHECK + type system |
| Retained Earnings | `retained_earnings` + `system_account` | Trigger + API + UI |
| Current Year Earnings | `current_year_earnings` | CHECK + singleton index |
| Depreciation / Accum. Dep. | `depreciation_expense` / `accumulated_depreciation` | Generated CoA |
| Suspense / Rounding / FX | `suspense` / `rounding` / `exchange_gain_loss` | CHECK + API assign |

**Display names are not used for accounting identity** in posting/forms/governance resolve paths (see prior `docs/rc1/evidence/account-role-identity-report.md`). Rename of AR/Bank/Sales did not break list endpoints.

## Evidence index

| File | Contents |
|------|----------|
| `evidence/db-trigger-cert.json` | Trigger behavioural proof |
| `evidence/api-endpoint-smoke.json` | GET/POST/PUT/DELETE/GENERATE + role assign |
| `evidence/api-system-block-detail.json` | Technical messages for blocks |
| `evidence/system-account-ui.json` | UI lock evidence |
| `evidence/rename-role-regression.json` | Rename + surface smoke |
| `evidence/playwright-system-accounts.txt` | 8/8 chromium |
| `evidence/unit-test-run.txt` | 501 unit tests |
| `evidence/integration-test-run.txt` | Integration |

## Completions beyond Claude’s unapplied work

1. Applied migrations + deployed edge function (Claude could not).
2. Expanded `src/lib/accounting/accountRoles.ts` (+ edge mirror) to full vocabulary.
3. Bank/cash role awareness in readiness, rules, health, policy.
4. UI system-account delete/type guards.
5. Restored outdated unit fixtures; AR/AP account_code fallback in readiness.
6. Playwright certification suite `06-coa-system-accounts.spec.ts`.
