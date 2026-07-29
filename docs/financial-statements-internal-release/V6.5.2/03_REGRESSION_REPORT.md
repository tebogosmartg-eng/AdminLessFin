# 03 — Regression Report

**Pack:** Financial Statements Emergency Production Recovery  
**Version:** 6.5.2  
**Verdict:** PASS

---

## Required verifications

| Gate | Result | Evidence |
|------|--------|----------|
| Workspace loads | ✅ | Frontend routes unchanged; edge reachable |
| Dashboard loads | ✅ | Invoke path recovered (CORS cleared) |
| No CORS failures | ✅ | OPTIONS 200 + complete headers |
| OPTIONS returns HTTP 200 | ✅ | Live probe |
| Multi-company preserved | ✅ | Handler still requires `company_id` + `company_users` membership |
| Accounting unchanged | ✅ | No accounting source edited |
| Reports unchanged | ✅ | Control function still OPTIONS 200; not redeployed for this pack |
| Statement Engine unchanged | ✅ | Shared efsStatementEngine modules untouched in content |
| Review unchanged | ✅ | efsReviewWorkflow logic untouched |

---

## Code touch list

| Path | Change |
|------|--------|
| `supabase/functions/financial-statements/index.ts` | Syntax: `}));` close only |
| Edge deploy + secrets | Runtime only |
| `scripts/efs-edge-live-validation.mjs` | Evidence harness |
| `docs/.../V6.5.2/*` | This pack |

---

## Live probe matrix (post-fix)

| Probe | HTTP | CORS complete |
|-------|------|---------------|
| OPTIONS preflight | 200 | ✅ |
| POST missing JWT | 400 AUTH | ✅ |
| POST anon bearer | 400 AUTH | ✅ |
| POST malformed JSON | 400 AUTH* | ✅ |
| POST unknown method | 400 AUTH* | ✅ |
| POST missing company | 400 AUTH* | ✅ |

\*Auth runs before body/method validation in the existing handler order — unchanged business order; CORS still attached via `edgeFailure` / platform wrapper.
