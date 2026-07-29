# V4.1.5 — Emergency Production Recovery Report

**Board:** Independent Principal Platform Recovery Engineer  
**Date:** 2026-07-13  
**Project:** `zaulhnpohrgqqodvzhxp` (Smart Accounting)  
**Scope:** Restore Enterprise Work Management runtime only  
**Final status:** **PRODUCTION READY**

---

## 1. Root Cause Analysis

### Exact failure point

The browser CORS / `net::ERR_FAILED` symptom was caused by the **`work` Edge Function not being deployed** to production.

| Probe | Pre-recovery result |
|-------|---------------------|
| `supabase functions list` | `work` absent (46 other functions present) |
| `OPTIONS /functions/v1/work` | **HTTP 404** `{"code":"NOT_FOUND","message":"Requested function was not found"}` |
| Gateway CORS on 404 | `Access-Control-Allow-Headers: authorization, x-client-info, apikey` — **missing `content-type`** |
| Browser preflight | Requests `content-type` → preflight fails CORS check |
| Control: `OPTIONS /functions/v1/projects` | **HTTP 200** with full CORS including `content-type` |

### Why it looked like a CORS bug

Supabase gateway 404 responses for missing functions include `Access-Control-Allow-Origin: *` but omit `content-type` from allow-headers. The browser therefore reports a CORS preflight failure instead of a clear “function not found” error. The application code in `supabase/functions/work/index.ts` already handled OPTIONS correctly; it simply never ran in production.

### Secondary production gap (would have blocked pages after CORS fix)

| Probe | Pre-recovery result |
|-------|---------------------|
| `ewm_%` tables in `public` | **0 tables** |
| PostgREST `ewm_projects` | HTTP 404 |
| Migration `20260713120000_ewm_v41_enterprise_work_management` | Not applied |
| V4.1 certificate note | Explicitly required: “Deploy edge function `work`” + apply migration |

---

## 2. Evidence

### Pre-recovery (gateway)

```
OPTIONS https://zaulhnpohrgqqodvzhxp.supabase.co/functions/v1/work
HTTP/1.1 404 Not Found
sb-error-code: NOT_FOUND
access-control-allow-headers: authorization, x-client-info, apikey
{"code":"NOT_FOUND","message":"Requested function was not found"}
```

### Post-recovery (function)

```
OPTIONS https://zaulhnpohrgqqodvzhxp.supabase.co/functions/v1/work
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
access-control-allow-headers: authorization, x-client-info, apikey, content-type
access-control-allow-methods: POST, OPTIONS
x-deno-execution-id: <present>
```

### Deploy

- Command: `supabase functions deploy work --project-ref zaulhnpohrgqqodvzhxp --no-verify-jwt --use-api`
- Result: Deployed Functions — slug `work`, status **ACTIVE**, version **1**
- `verify_jwt=false` matches peer APIs (`projects`, `payroll`, …) that perform in-handler auth (required so OPTIONS preflight is not rejected at the gateway)

### Schema

- Applied: `supabase/migrations/20260713120000_ewm_v41_enterprise_work_management.sql`
- Tables created: **23** `ewm_*` relations
- Catalogue seed: **16** `ewm_resource_types`
- Migration history: `20260713120000` / `ewm_v41_enterprise_work_management`
- REST: `ewm_projects`, `ewm_resource_types`, `ewm_time_entries`, `ewm_clock_sessions` → HTTP 200

### Live request matrix (post-fix)

| Case | HTTP | CORS | Body |
|------|------|------|------|
| OPTIONS | 200 | ✓ Origin/Headers/Methods | empty |
| POST unauthenticated | 400 | ✓ | `User not authenticated.` |
| POST invalid JWT | 400 | ✓ | `User not authenticated.` |
| POST authenticated `GET_EXECUTIVE_DASHBOARD` | 200 | ✓ | dashboard JSON |
| POST invalid company | 400 | ✓ | `Permission denied.` |
| POST unknown method | 400 | ✓ | `Unknown method: …` |
| POST missing method | 400 | ✓ | `Method is required.` |
| `LIST_EWM_PROJECTS` | 200 | ✓ | `[]` |
| `LIST_WORK_RESOURCES` | 200 | ✓ | `[]` |
| `LIST_TIME_ENTRIES` | 200 | ✓ | `[]` |
| `LIST_CLOCK_SESSIONS` | 200 | ✓ | `[]` |
| `LIST_RESOURCE_TYPES` | 200 | ✓ | 16 types |

### Frontend contract

All Work pages call `invokeWork(companyId, method, payload)` → `supabase.functions.invoke('work', { body: { method, company_id, ... } })` in `src/lib/work/api.ts`. Contract matches backend `{ method, company_id }` routing. No frontend change required.

---

## 3. Fixes Applied

| Change | Reason | Risk |
|--------|--------|------|
| Deployed `work` with `--no-verify-jwt` | Function was missing; gateway JWT gate would block OPTIONS | Low — matches platform pattern; auth remains in-handler |
| Applied EWM migration `20260713120000` | Tables required for all Work methods | Low — additive `CREATE IF NOT EXISTS`; frozen modules untouched |
| Removed empty duplicate migration `20260713113340_…sql` (0 bytes) | Prevent false migration history / push confusion | None |
| Hardened CORS in `supabase/functions/work/index.ts` | Explicit `Allow-Methods`, OPTIONS status 200, method guard, safe JSON parse, safe error message | Low — no business logic change |
| Catch path always returns CORS JSON | Auth/validation/DB failures must not drop CORS | Low |

### Code touchpoints

- `supabase/functions/work/index.ts` — lines 9–13 (CORS), 85–115 (OPTIONS-first + validation), catch block (safe message)
- No changes to Payroll, Accounting, Reporting, Navigation, Domain Model, or KPI catalogue code

---

## 4. Regression Verification

| Surface | Result |
|---------|--------|
| Executive Dashboard method `GET_EXECUTIVE_DASHBOARD` | ✓ HTTP 200 |
| Projects `LIST_EWM_PROJECTS` | ✓ HTTP 200 |
| Resources `LIST_WORK_RESOURCES` / `LIST_RESOURCE_TYPES` | ✓ HTTP 200 |
| Time `LIST_TIME_ENTRIES` | ✓ HTTP 200 |
| Clocking `LIST_CLOCK_SESSIONS` | ✓ HTTP 200 |
| `OPTIONS payroll` | ✓ 200 (unchanged v24) |
| `OPTIONS accounting` | ✓ 200 (unchanged v6) |
| `OPTIONS projects` | ✓ 200 (unchanged v8) |
| Payroll / Accounting / journal-entries versions | Unchanged |
| Architecture / navigation / KPI docs | Untouched |

---

## 5. Production Readiness Checklist

| Gate | Status |
|------|--------|
| Edge Function healthy (`work` ACTIVE v1) | ✓ |
| OPTIONS returns HTTP 200 | ✓ |
| CORS compliant (Origin / Headers / Methods on all paths) | ✓ |
| Auth compliant (JWT + `company_users` membership) | ✓ |
| Multi-company safe (invalid company → Permission denied) | ✓ |
| Payroll unaffected | ✓ |
| Accounting unaffected | ✓ |
| Navigation unaffected | ✓ |
| EWM schema present | ✓ |

---

## FINAL STATUS

**PRODUCTION READY**

Root cause identified (undeployed `work` function → gateway 404 misreported as CORS), corrected (deploy + schema + CORS hardening), verified with live OPTIONS/auth/method matrix, and confirmed non-regressive against frozen modules.
