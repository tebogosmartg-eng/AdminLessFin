# ADMINLESS FIN — VERSION 16.1
# ENTERPRISE ENVIRONMENT CERTIFICATION REPORT

**Board:** Independent Principal Enterprise Release Board  
**Certification time:** 2026-07-21T13:23:27.458Z  
**Connected project:** `zaulhnpohrgqqodvzhxp` (Smart Accounting, eu-west-1, ACTIVE_HEALTHY)  
**API URL:** `https://zaulhnpohrgqqodvzhxp.supabase.co`  
**Evidence:**
- `docs/financial-statements-certification/V16.1/evidence/environment-certification-evidence.json`
- `docs/financial-statements-certification/V16.1/evidence/environment-inventory-detail.json`

**Constraint:** No application code modified during this certification.

---

## 1. Live database inventory

### Project

| Field | Value |
|-------|-------|
| Ref | `zaulhnpohrgqqodvzhxp` |
| Name | Smart Accounting |
| Status | ACTIVE_HEALTHY |
| Postgres | 17.6.1.038 |
| Linked CLI | yes |

### EFS tables probed via PostgREST (authenticated)

| Table | Present |
|-------|---------|
| `public.efs_engagement_general_information` | YES (HTTP 200) |
| `public.efs_reporting_workspaces` | YES |
| `public.efs_reporting_periods` | YES |
| `public.efs_reporting_entities` | YES |
| `public.efs_framework_packs` | YES |
| `public.efs_framework_bindings` | YES |
| `public.efs_snapshot_versions` | YES |
| `public.efs_statement_instances` | YES |
| `public.efs_publication_packs` | YES |
| `public.efs_publication_records` | YES |
| `public.efs_publication_artifacts` | YES |
| `public.efs_working_papers` | YES |
| `public.efs_validation_runs` | YES |
| `public.efs_disclosure_nodes` | YES |
| `public.efs_canonical_trial_balances` | YES |
| **`public.efs_company_master_data`** | **NO — PGRST205** |
| `public.efs_statement_lines` | NO — PGRST205 (name may differ in live schema) |
| `public.efs_review_packs` | NO — PGRST205 (name may differ) |
| `public.efs_note_instances` | NO — PGRST205 (name may differ) |
| `public.efs_activity_log` | NO — PGRST205 (name may differ) |

### Critical V16.1 object

```json
{
  "code": "PGRST205",
  "message": "Could not find the table 'public.efs_company_master_data' in the schema cache",
  "hint": "Perhaps you meant the table 'public.company_users'"
}
```

**Fact:** `public.efs_company_master_data` does not exist in the live PostgREST schema.

### Indexes / constraints / RPCs (V16.1 master data)

Cannot exist without the parent table. Expected (repository):

| Object | Expected |
|--------|----------|
| Index | `idx_efs_company_master_data_company` |
| Constraints | PK, `UNIQUE(company_id)`, FK → `companies(id)` |
| RLS policies | `efs_company_master_data_select`, `efs_company_master_data_mutate` |
| RPC | none required for master data |

### Edge Functions (remote inventory)

`financial-statements` is **ACTIVE**, **version 20**, last updated **2026-07-21 11:13:06Z**.

Other platform functions present (customers, payroll, financial-close, etc.) — full list in CLI `functions list` output.

---

## 2. Migration inventory

### Local repository (exists)

| Migration file | Present in repo |
|----------------|-----------------|
| `20260721120000_efs_v161_company_master_data.sql` | YES |
| `20260721130000_efs_v161_legacy_master_data_migration.sql` | YES |

### Applied to remote database

| Migration | Executed remotely | Evidence |
|-----------|-------------------|----------|
| `20260721120000_efs_v161_company_master_data.sql` | **NO** | Table created by this migration is absent (PGRST205) |
| `20260721130000_efs_v161_legacy_master_data_migration.sql` | **NO** | Depends on table; column `legacy_migration_completed_at` unreachable |

### Migration history CLI

`supabase migration list --linked` could not complete: database login role connection timed out (`SUPABASE_DB_PASSWORD` required).  
Absence of the table is still definitive proof the CREATE TABLE migration has not been successfully applied.

---

## 3. Schema comparison (expected vs live)

### Expected (from `20260721120000_efs_v161_company_master_data.sql`)

- Table `efs_company_master_data`
- Columns: `id`, `company_id`, `company_profile`, `addresses`, `tax_registrations`, `directors`, `governance`, `officers`, `principal_bankers`, `created_at`, `updated_at`
- Plus `legacy_migration_completed_at` from second migration
- Index + unique + FK + RLS

### Live

| Expected | Live | Drift |
|----------|------|-------|
| Table `efs_company_master_data` | Missing | **MISSING** |
| All required columns | N/A | **MISSING** |
| Index `idx_efs_company_master_data_company` | N/A | **MISSING** |
| Unique / FK / RLS | N/A | **MISSING** |

---

## 4. Deployment consistency / drift

| Layer | Local (repository) | Remote (production) | Drift |
|-------|--------------------|---------------------|-------|
| Schema `efs_company_master_data` | Defined in migrations | **Absent** | **YES** |
| Migrations V16.1 | Present on disk | **Not applied** | **YES** |
| Edge method `VERIFY_V161_DEPLOYMENT` | Present in source | **Unknown method** (HTTP 500) | **YES** |
| Edge `GET_COMPANY_MASTER_DATA` | Asserts schema; no fabricate | **HTTP 200 + empty `addresses: {}`** (fabricates) | **YES** |
| Edge function version | Source includes deployment verification | Deployed v20 @ 2026-07-21 11:13:06Z **without** VERIFY method | **YES** |

### Deployed edge evidence (verbatim)

```text
VERIFY_V161_DEPLOYMENT → technicalMessage: "Unknown method: VERIFY_V161_DEPLOYMENT"
GET_COMPANY_MASTER_DATA → HTTP 200, addresses: {}
```

**Conclusion:** Remote edge still runs a pre–deployment-verification build that masks missing schema. Local source and remote runtime are out of sync.

---

## 5. Missing objects (V16.1 certification scope)

1. Table `public.efs_company_master_data`
2. All columns of that table (including `legacy_migration_completed_at`)
3. Index `idx_efs_company_master_data_company`
4. Constraints PK / UNIQUE(company_id) / FK to `companies`
5. RLS policies for the table
6. Deployed edge support for `VERIFY_V161_DEPLOYMENT`
7. Deployed edge behaviour that refuses fabricated master data

---

## 6. Required deployment actions

1. Set `SUPABASE_DB_PASSWORD` (or use SQL Editor) and apply:
   - `supabase/migrations/20260721120000_efs_v161_company_master_data.sql`
   - `supabase/migrations/20260721130000_efs_v161_legacy_master_data_migration.sql`
2. Confirm:
   ```http
   GET /rest/v1/efs_company_master_data?select=company_id&limit=1
   ```
   returns HTTP 200 (not PGRST205).
3. Redeploy edge function `financial-statements` from current repository (includes `VERIFY_V161_DEPLOYMENT` and schema assertions).
4. Confirm:
   - `VERIFY_V161_DEPLOYMENT` → `readiness: PASS` (after migrations)
   - `GET_COMPANY_MASTER_DATA` does **not** return fabricated empty modules when schema was missing (must error until table exists; after apply, may return empty modules only with table present)
5. Re-run this certification; expect **CERTIFIED** only when schema + edge align.

---

## Certification decision

| Criterion | Result |
|-----------|--------|
| Database inventory | FAIL — critical V16.1 table absent |
| Migration inventory | FAIL — V16.1 migrations not applied |
| Schema comparison | FAIL — missing table/columns/indexes/constraints |
| Deployment drift | FAIL — schema + edge version drift |
| Environment readiness | **NOT READY** |

# NOT CERTIFIED

Objective basis: live PostgREST returns **PGRST205** for `public.efs_company_master_data`; deployed `financial-statements` lacks `VERIFY_V161_DEPLOYMENT` and still returns fabricated empty master data.

---

VERSION 16.1  
ENTERPRISE ENVIRONMENT CERTIFICATION COMPLETE
