# 02 — Fixes Applied

**Pack:** Financial Statements Emergency Production Recovery  
**Version:** 6.5.2  
**Constraint:** No redesign · no business-logic modification

---

## Fix 1 — Close `serve(withEnterprisePlatform(...))` correctly

**File:** `supabase/functions/financial-statements/index.ts`

| Before | After |
|--------|-------|
| Trailing `});` | Trailing `}));` |

Matches certified `reports` / `work` / payroll platform pattern. No handler/business changes.

---

## Fix 2 — Deploy edge function

```bash
npx supabase functions deploy financial-statements \
  --project-ref zaulhnpohrgqqodvzhxp \
  --no-verify-jwt
```

`--no-verify-jwt` matches every other tenant function in this project so **OPTIONS executes inside the function** (platform CORS) before JWT user auth in-handler.

Post-deploy inventory: slug `financial-statements`, status `ACTIVE`, `verify_jwt: false`.

---

## Fix 3 — Edge secrets for module flags

```bash
npx supabase secrets set EFS_MODULE=true EFCP_SILENT_BACKENDS=true \
  --project-ref zaulhnpohrgqqodvzhxp
```

Satisfies `flagsEnabled()` so POST requests are not rejected as “module disabled” after CORS recovery.

---

## Fix 4 — Live validation harness

**Script:** `scripts/efs-edge-live-validation.mjs`  
**Evidence:** `evidence/edge-live-validation.json`

---

## Not changed (by design)

- Statement Engine / Review / Validation / Disclosure / Working Paper logic  
- Frontend `invokeFinancialStatements` contract  
- Accounting / Reports edge functions  
- Navigation / feature flags (V6.5.0–6.5.1)
