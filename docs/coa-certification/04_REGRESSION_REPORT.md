# Chart of Accounts — Regression Report

**Date:** 2026-07-29

## Verdict

**PASS** for CoA scope. Unrelated suites not attributed to this release.

## Executed

| Suite | Result | Evidence |
|-------|--------|----------|
| TypeScript `tsc --noEmit` | PASS (0) | Shell |
| ESLint (touched CoA files) | PASS (0) | Shell |
| Unit tests (full) | **501 passed / 39 files** | `evidence/unit-test-run.txt` |
| Integration (`vitest.integration.config.ts`) | **3 passed / 1 file** | `evidence/integration-test-run.txt` |
| Playwright CoA system accounts (chromium) | **8 passed** | `evidence/playwright-system-accounts.txt` |
| Rename role regression (live API) | PASS | `evidence/rename-role-regression.json` |
| Account-roles unit | PASS | `tests/unit/account-roles.test.ts` |

## Failure classification (during completion)

| Failure | Classification | Resolution |
|---------|----------------|------------|
| readiness/health/policy unit fixtures missing `account_role` / bank subcategory | **Outdated tests** after Claude name→role migration (incomplete client sync) | Updated fixtures + completed role vocabulary / bank role matching |
| Health test syntax after fixture edit | **Introduced** (edit mistake) | Fixed immediately |
| Playwright UI company still Spaceman | **Test harness** (switch via wrong EF / UI switcher) | Fixed to use Company Switcher → settings.SWITCH_COMPANY |
| GENERATE/DELETE system account HTTP 500 envelope | **Pre-existing** platform error mapping | Documented; denial correct via technicalMessage |

## Not run / out of scope attribution

- Full multi-browser Playwright matrix (firefox/webkit/mobile) — chromium CoA cert executed; broader product E2E not required to certify this CoA release.
- Statutory payroll certification — unrelated module; not re-run.

## Accounting surfaces after rename (Spaceman)

Renamed AR / Bank / Sales display names; role/subcategory identity held; invoices, bills, payments, banking, financial-statements returned non-5xx. Names restored.
