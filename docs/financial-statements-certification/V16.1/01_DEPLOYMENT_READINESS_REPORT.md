# ADMINLESS FIN — VERSION 16.1
# ENTERPRISE DEPLOYMENT READINESS REPORT

**Board:** Independent Principal Enterprise Release Board  
**Verified at:** 2026-07-21 (local certification run)  
**Project:** zaulhnpohrgqqodvzhxp (Smart Accounting)

---

## Deployment readiness

| Criterion | Status |
|-----------|--------|
| Database schema status | **FAIL** — `public.efs_company_master_data` absent (PGRST205) |
| Migration status | **NOT APPLIED** |
| Edge Function version | `16.1.0-deployment-verification` (source); deploy required |
| Required tables | **FAIL** |
| Required columns | **FAIL** (parent table missing) |
| Required indexes | **FAIL** (parent table missing) |
| Deployment readiness | **FAIL / BLOCKED** |

---

## Required table

| Object | Status |
|--------|--------|
| `public.efs_company_master_data` | FAIL — not in PostgREST schema cache |

## Required columns

| Column | Status |
|--------|--------|
| id, company_id, company_profile, addresses, tax_registrations, directors, governance, officers, principal_bankers, created_at, updated_at | FAIL |
| legacy_migration_completed_at | FAIL |

## Required indexes

| Index | Status |
|-------|--------|
| `idx_efs_company_master_data_company` | FAIL |

## Required constraints

| Constraint | Status |
|------------|--------|
| PK / UNIQUE(company_id) / FK companies | FAIL |

## Required RPCs

| RPC | Status |
|-----|--------|
| (none — PostgREST table API) | PASS |

## Required Edge Function methods

| Method | Status |
|--------|--------|
| GET_COMPANY_MASTER_DATA | Implemented — throws deployment error when schema missing |
| UPSERT_COMPANY_MASTER_DATA_MODULE | Implemented — throws deployment error when schema missing |
| GET_ENGAGEMENT_GENERAL_INFORMATION | Implemented — asserts schema before hydration |
| VERIFY_V161_DEPLOYMENT | Implemented — returns readiness report |

## Required migrations

1. `20260721120000_efs_v161_company_master_data.sql`
2. `20260721130000_efs_v161_legacy_master_data_migration.sql`

---

## Silent fallback removal

| Location | Previous behaviour | New behaviour |
|----------|-------------------|---------------|
| `GET_COMPANY_MASTER_DATA` + `isMissingRelationError` | Returned `emptyMasterDataRow()` | Throws `V161DeploymentError` (503) |
| `ensureLegacyMasterDataMigration` | Returned null on missing table | Asserts schema; never swallows PGRST205 |
| `upsertMasterDataFromEngagementPayload` | Returned null on missing table | Asserts schema; throws on error |
| Client `getCompanyMasterData` | `data \|\| emptyCompanyMasterData()` | Propagates edge error; no fabricate |

`emptyMasterDataRow()` remains **only** as insert scaffolding after schema verification succeeds.

---

## Certification decision

**NOT READY / BLOCKED**

Apply the two V16.1 migrations to the remote database, redeploy `financial-statements`, then re-run `VERIFY_V161_DEPLOYMENT`.

VERSION 16.1  
ENTERPRISE DEPLOYMENT VERIFICATION COMPLETE (implementation)  
DEPLOYMENT READINESS: **FAIL** until migrations applied
