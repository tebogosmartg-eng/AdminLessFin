# Chart of Accounts — Migration Report

**Date:** 2026-07-29  
**Project:** zaulhnpohrgqqodvzhxp (Smart Accounting)  
**Release Engineer:** Principal Enterprise Release (Cursor Auto)

## Verdict

**PASS** — Both pending CoA migrations applied successfully in order. No data rewritten. Constraints, index and trigger verified live.

## Migrations applied this release

| Version | File | Remote status |
|---------|------|---------------|
| `20260729130000` | `coa_account_role_vocabulary_expansion.sql` | Applied |
| `20260729140000` | `coa_system_account_protection.sql` | Applied |

Preceding CoA migrations already on remote (Claude, earlier):

- `20260729120000_coa_account_role_metadata.sql`
- `20260729120100_coa_cash_subcategory_legacy_backfill.sql`

## Order & checksum

- Applied via `supabase db push --linked` after `supabase migration list --linked` showed only these two as local-only.
- Post-push list shows local == remote for both versions (see `evidence/migration-list.json`).

## SQL correctness (Phase 1 review)

### Vocabulary expansion
- Widens `chart_of_accounts_account_role_check` additively (NULL or enumerated roles).
- New roles: `current_year_earnings`, `rounding`, `exchange_gain_loss`, `payroll_control`, `bank`, `cash`, `sales`.
- Recreates singleton unique index; adds `current_year_earnings` + `rounding` to singleton set.
- Non-singleton (multiple allowed): bank, cash, sales, payroll_*, depreciation, fixed_asset, FX, etc.
- **Backward compatible:** widening CHECK cannot invalidate existing rows; no DML.

### System account protection
- `BEFORE UPDATE OR DELETE` trigger `trg_chart_of_accounts_protect_system`.
- Blocks: delete; change of `type`, `account_role`, `system_account`, `control_account`.
- Allows: rename, `account_code`, description, reorder, `is_active`.
- Service-role cannot bypass (row-level BEFORE trigger).

## Live verification

| Check | Result |
|-------|--------|
| CHECK contains all 22 roles | Verified via `pg_get_constraintdef` |
| Singleton index present | Verified |
| Trigger enabled (`tgenabled = O`) | Verified |
| Function body matches migration | Verified |
| Trigger behavioural cert (9/9) | `evidence/db-trigger-cert.json` — all `passed: true` |
| New roles assignable via API | `rounding`, `bank`, `sales` assigned successfully |

## Rollback safety

- Vocabulary: drop/recreate narrower CHECK (only if no rows use new roles).
- Protection: `DROP TRIGGER` + `DROP FUNCTION` (additive; no data dependency).
- No destructive column drops; no backfill mutation in these two files.

## Data loss

**None.** Existing Spaceman + generated CoA rows unchanged by migration DDL.
