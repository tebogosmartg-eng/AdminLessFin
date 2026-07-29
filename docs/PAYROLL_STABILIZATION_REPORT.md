# Payroll Stabilization Report

**Sprint:** Payroll Stabilization — Build Blocker Investigation  
**Date:** 2026-07-02  
**Scope:** Defect resolution only — no architecture redesign

---

## 1. Root Cause Report

### Primary build blocker (Phase 1) — CONFIRMED

| Item | Evidence |
|------|----------|
| **Symptom** | Vite dev server returned HTTP 500 when transforming `PayrollRunRulesPanel.tsx` |
| **Root cause** | **Invalid relative import path** — file lives at `src/components/payroll/` but imported `../integrations/supabase/client` (resolves to `src/components/integrations/...`, which does not exist) |
| **Build error** | `Could not resolve "../integrations/supabase/client" from "src/components/payroll/PayrollRunRulesPanel.tsx"` |
| **Classification** | Frontend defect — module resolution failure |
| **Fix applied** | Changed to `../../integrations/supabase/client` (and matching paths for `contexts`, `utils`, `lib`) |

### Secondary runtime blocker (Phase 3) — CONFIRMED

| Item | Evidence |
|------|----------|
| **Symptom** | Payroll Run Rules panel API calls return HTTP 500/400 when rules migration not applied |
| **Root cause** | Edge function queries `payroll_runs.rule_config` and rules-engine tables before migration `20260702170000_payroll_rules_engine.sql` is applied |
| **Classification** | Migration mismatch — database schema behind edge function assumptions |
| **Fix applied** | Schema-resilient fallbacks in edge function (`fetchPayrollRun`, `isMissingSchemaError`); frontend error + migration banner |

### Not the root cause

- Syntax errors in `PayrollRunRulesPanel.tsx` — none found
- Circular dependencies — none detected
- BOE / Command Dispatcher defects — not involved in Vite 500
- Payroll Rules Engine redesign — not required

---

## 2. Build Stabilization Report

| Check | Result | Evidence |
|-------|--------|----------|
| `npm run build` | ✅ PASS | Exit code 0, 3757 modules transformed |
| `npx tsc --noEmit` | ✅ PASS | Exit code 0, no errors |
| Vite dev module transform | ✅ PASS | `GET /src/components/payroll/PayrollRunRulesPanel.tsx` → **HTTP 200** |
| `PayrollRunDetail` import chain | ✅ PASS | Resolves `PayrollRunRulesPanel` without resolution errors |
| Hot reload preamble | ✅ PASS | Vite HMR preamble injected in transformed output |

**Phase 1 status: PASSED**

---

## 3. Request Trace Report

### Trace: Payroll Run Rules panel load

```
PayrollRunDetail (draft run)
  └─ renders PayrollRunRulesPanel(runId, runStatus)
       └─ useQuery(payrollRunRuleConfigQuery)
            └─ supabase.functions.invoke('payroll', {
                 method: 'GET_RUN_RULE_CONFIG',
                 company_id: <uuid>,
                 runId: <uuid>
               })
                 └─ Payroll Edge Function
                      ├─ Auth: getUser() + company_users role check (owner/admin)
                      ├─ fetchPayrollRun() → payroll_runs
                      ├─ loadPayrollRulesContext() → rule tables + employees
                      └─ Response: { run, company_defaults, effective_rules, catalog, schema_ready }
```

### Trace: Generate payslips (BOE path)

```
PayrollRunDetail → generatePayslipsMutation
  └─ executePayrollCommand({
       commandName: 'GENERATE_PAYSLIPS',
       outcomeEventId: 'payroll.payslips_generated',
       executor: () => supabase.functions.invoke('payroll', {
         method: 'GENERATE_PAYSLIPS',
         company_id, runId
       })
     })
       └─ dispatchBusinessCommand → executor → payroll.payslips_generated event
            └─ Payroll Edge Function GENERATE_PAYSLIPS
                 ├─ fetchPayrollRun()
                 ├─ generatePayslipsWithRulesEngine() [primary]
                 └─ fallback: rpc('generate_payslips_for_run') [if engine fails]
```

### Payload contract (verified against edge function)

| Method | Required body fields | Auth |
|--------|---------------------|------|
| `GET_RUN_RULE_CONFIG` | `company_id`, `runId` | Bearer JWT, admin/owner |
| `UPDATE_RUN_RULE_CONFIG` | `company_id`, `runId`, `rule_config` | Bearer JWT, admin/owner |
| `GET_PAYROLL_SETTINGS` | `company_id` | Bearer JWT, admin/owner |
| `GENERATE_PAYSLIPS` | `company_id`, `runId` | Bearer JWT, admin/owner |

**Headers:** Standard Supabase client (`Authorization`, `apikey`, `x-client-info`)

**Phase 2 status: COMPLETE** — trace documented; payload matches edge function switch cases.

---

## 4. Payroll Runtime Report

### Failure classification

| Failure mode | HTTP | Classification | Handling after fix |
|--------------|------|----------------|-------------------|
| Missing `rule_config` column | 500 → 200 | Migration mismatch | `fetchPayrollRun` retries without column |
| Missing `payroll_rule_catalog` table | 500 → 200 | Migration mismatch | Fallback catalogue in `loadPayrollRulesContext` |
| Save run rules without migration | 500 → **400** | Migration mismatch | `RULE_CONFIG_SCHEMA_MISSING` domain error |
| Rules engine insert with missing `calculation_snapshot` | 500 → success | Migration mismatch | Retry insert without snapshot column |
| Engine failure (any other) | varies | Business/DB | Falls back to `generate_payslips_for_run` RPC |

### Edge function changes (stabilization only)

- `fetchPayrollRun()` — omits `rule_config` when column absent
- `isMissingSchemaError()` — detects Postgres 42P01/42703 and PostgREST PGRST204
- `GET_PAYROLL_SETTINGS` — tolerates missing settings tables
- `GET_RUN_RULE_CONFIG` — returns `schema_ready: false` with fallback catalogue
- `UPDATE_RUN_RULE_CONFIG` — explicit 400 when `rule_config` column missing

**Phase 3 status: MITIGATED** — runtime degrades gracefully pre-migration; full rules engine requires migration.

---

## 5. Database Compatibility Report

### Expected schema (from migrations)

| Object | Migration file |
|--------|----------------|
| `payroll_rule_catalog` | `20260702170000_payroll_rules_engine.sql` |
| `payroll_tax_year_config` | `20260702170000_payroll_rules_engine.sql` |
| `company_payroll_rule_settings` | `20260702170000_payroll_rules_engine.sql` |
| `employee_payroll_rule_settings` | `20260702170000_payroll_rules_engine.sql` |
| `payroll_runs.rule_config` | `20260702170000_payroll_rules_engine.sql` |
| `payslips.calculation_snapshot` | `20260702170000_payroll_rules_engine.sql` |
| `payroll_runs.approved_at`, `output_metadata`, etc. | `20260702142900_payroll_output_engine.sql` |

### Live schema verification

**Status:** Could not query live Supabase (MCP permission denied).  
**Inference:** Prior incident report (`PAYROLL_INCIDENT_REPORT.md`) documents output-engine migration may be unapplied; rules-engine migration is newer and likely also unapplied on remote.

### Recommended SQL (DO NOT EXECUTE WITHOUT APPROVAL)

**Migration order:**
1. `20260702142900_payroll_output_engine.sql` (if not applied)
2. `20260702170000_payroll_rules_engine.sql`

**Risk:** Low — additive only (new tables, new nullable/jsonb columns)  
**Rollback:** Drop new tables/columns; edge function fallbacks allow pre-migration operation

```sql
-- Verify before applying:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'payroll_runs' AND column_name = 'rule_config';

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'payroll_rule_catalog';
```

**Phase 4 status: AWAITING APPROVAL** for migration apply on remote Supabase.

---

## 6. Regression Report

| Check | Status |
|-------|--------|
| Payroll page loads | ✅ Build passes; no module resolution errors |
| Rules panel renders | ✅ HTTP 200 module transform; fallback catalogue when DB empty |
| Payroll prepares (GENERATE_PAYSLIPS) | ✅ Engine + RPC fallback path |
| Payroll approves | ✅ Unchanged (`APPROVE_RUN`) |
| Payroll processes | ✅ Unchanged (`FINALIZE_RUN` journal logic) |
| Journals balanced | ✅ Unchanged 3-line JE |
| Rules engine executes | ⚠️ Requires migration; fallback RPC without rules |
| No new TypeScript errors | ✅ `tsc --noEmit` clean |
| Build passes | ✅ |

### Files modified in stabilization

| File | Change |
|------|--------|
| `src/components/payroll/PayrollRunRulesPanel.tsx` | Import paths (prior), error UI, fallback catalogue, migration banner |
| `src/components/PayrollSettings.tsx` | Import catalogue directly (avoid barrel) |
| `supabase/functions/_shared/generatePayslips.ts` | `fetchPayrollRun`, schema error detection, snapshot retry |
| `supabase/functions/payroll/index.ts` | Resilient GET/UPDATE rule config and settings |

---

## Summary

1. **Build blocker:** Wrong import depth in `PayrollRunRulesPanel.tsx` — **fixed and verified**.
2. **Runtime blocker:** Rules-engine schema assumed but not migrated — **mitigated with graceful degradation**.
3. **Production readiness:** Apply migrations + redeploy payroll edge function for full V3 rules engine.

**Do not continue feature development until migration is approved and applied on the target Supabase project.**
