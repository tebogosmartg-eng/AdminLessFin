# 01 — Root Cause Analysis

**Pack:** Financial Statements Emergency Production Recovery  
**Version:** 6.5.2  
**Method:** Live probes + CLI inventory — no speculation

---

## Symptoms (browser)

```
Access to fetch …/functions/v1/financial-statements blocked by CORS policy
Response to preflight request doesn't pass access control check
POST … net::ERR_FAILED
```

---

## Primary root cause

**`financial-statements` was not deployed to the Supabase project.**

### Evidence

| Probe | Result |
|-------|--------|
| `supabase functions list` | No slug `financial-statements` |
| `OPTIONS /functions/v1/financial-statements` | **HTTP 404** |
| Control: `OPTIONS /functions/v1/reports` | **HTTP 200** with full CORS |
| Gateway 404 | Partial CORS only → browser fails preflight access-control check |

Causal chain:

```
Function absent
  → OPTIONS 404 (gateway)
  → Preflight fails
  → Browser blocks POST
  → Surfaces as CORS / net::ERR_FAILED
```

---

## Secondary root cause (blocked recovery)

**Deployable source had a syntax error that prevented bundling.**

```
serve(withEnterprisePlatform("financial-statements", "tenant", async (req, _ctx) => {
  …
});   // WRONG — closes withEnterprisePlatform then terminates; serve( unclosed
```

Deploy error (attempt 1):

```
Failed to bundle the function
Expected ',', got ';' at index.ts:4040
```

Certified pattern (e.g. `reports/index.ts`):

```
serve(withEnterprisePlatform(..., async (...) => {
  …
}))
```

---

## Ruled out

| Hypothesis | Evidence | Verdict |
|------------|----------|---------|
| Missing `ENTERPRISE_CORS_HEADERS` | Present via `_shared/enterpriseEdgePlatform.ts`; reports OK | Ruled out |
| OPTIONS after auth | `withEnterprisePlatform` returns `optionsResponse` before handler | Ruled out |
| Frontend invoke miswired | `api.ts` uses standard `functions.invoke` + `{ method, company_id }` | Ruled out |
| Business / Statement Engine defect | No engine change required for CORS 404 | Ruled out |

---

## Post-fix validation summary

| Check | Result |
|-------|--------|
| Function ACTIVE | ✅ |
| OPTIONS HTTP 200 | ✅ |
| CORS Origin / Headers / Methods | ✅ |
| Unauthenticated POST + CORS | ✅ (AUTHENTICATION_FAILED, CORS intact) |
| Malformed / unknown / missing company probes | ✅ CORS on error path (auth-first) |
