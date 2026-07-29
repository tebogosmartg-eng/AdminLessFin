# Root Cause Report

**Product:** AdminLess Fin · **Version:** 3.5.2 · **Date:** 2026-07-12  
**Board:** Principal Enterprise Runtime Diagnostics Board

---

## Primary root cause (observed BOE failure)

### Classification

**☑ Missing migration**

### Statement

Remote database `payroll_tax_year_config` has **no active row covering pay dates on/after 2026-03-01**.  
Local migration `20260707140000_tax_year_2026_2027.sql` seeds `2026/2027` (`2026-03-01` → `2027-02-28`) but is **not applied on remote** (`supabase migration list --linked` shows Local present / Remote empty).

`GENERATE_PAYSLIPS` correctly refuses silent tax-year fallback and throws when `resolveTaxYearForDate` returns `undefined`.

### Trace

```text
Caller:  payroll/index.ts  case 'GENERATE_PAYSLIPS'  (L345)
   ↓
Callee:  generatePayslipsWithRulesEngine  (generatePayslips.ts:116)
   ↓
Callee:  loadPayrollRulesContext  (generatePayslips.ts:48)
   ↓
Query:   payroll_tax_year_config  (ZA, is_active=true)  → 1 row only (2025/2026 … 2026-02-28)
   ↓
Callee:  resolveTaxYearForDate("2026-12-31", taxYearRows)  → undefined  (paye.ts:92)
   ↓
Exception: throw new Error(`No payroll_tax_year_config row matches pay date …`)  (generatePayslips.ts:86)
   ↓
Root Cause: migration 20260707140000_tax_year_2026_2027 not applied on remote DB
```

### Legislation / tax-year detail

| Field | Value |
|-------|--------|
| Tax Year needed | `2026/2027` |
| Pay date (failing run) | `2026-12-31` |
| Registry / DB lookup | `SELECT * FROM payroll_tax_year_config WHERE country_code='ZA' AND is_active=true` |
| Resolver output | `undefined` (no row with `effective_from ≤ pay_date ≤ effective_to`) |
| Migration | `supabase/migrations/20260707140000_tax_year_2026_2027.sql` — **unapplied** |

### Why this matches frontend evidence

```text
BOE STARTED → VALIDATED → EXECUTING → POST /functions/v1/payroll → HTTP 500 → BOE FAILED
```

Auth, membership, and command routing succeed (`GET_RUNS` / `GET_RUN_DETAIL` = 200). Failure is inside payslip generation before persistence of payslips.

---

## Cascade root cause — `APPROVE_RUN`

| Field | Value |
|-------|--------|
| Exception | `Generate payslips before approving.` |
| File / Line | `supabase/functions/payroll/index.ts:472` |
| Cause | Zero payslips for the run because generation failed |
| Category | Same primary failure (not independent) |

---

## Secondary proven failure (latent after tax-year fix)

### Classification

**Constraint violation** (Postgres enum) — also **Missing migration**

When pay date **is** inside `2025/2026` (`2026-01-31`), generation proceeds past tax-year resolution and fails at payslip item insert:

```text
invalid input value for enum payslip_item_type: "employer_contribution"
```

| Field | Value |
|-------|--------|
| File | `supabase/functions/_shared/generatePayslips.ts` |
| Function | `generatePayslipsWithRulesEngine` |
| Line | **259** (`payslip_items` insert) |
| Rejected field | `payslip_items.type = "employer_contribution"` |
| DB enum values (live) | `earning`, `deduction`, `company_contribution`, `reimbursement` |
| Code emits | `employer_contribution` (pipeline.ts:174; rules.ts UIF/SDL employer lines) |
| Unapplied migration | `20260707120000_payslip_item_employer_contribution.sql` (`ALTER TYPE … ADD VALUE 'employer_contribution'`) |

### Object before insert (pattern)

```json
{
  "payslip_id": "<uuid>",
  "description": "<UIF Employer | SDL | …>",
  "type": "employer_contribution",
  "amount": <number>
}
```

Postgres rejects `type` because the enum label does not exist on remote.

---

## Latent local deploy risk (not the live 500)

Local edge barrel `supabase/functions/_shared/statutory/index.ts` imports `./countries/south-africa.ts`, but only directory `countries/south-africa/` exists. `deno check` also reports related extension issues. **Live** function still executes handlers (returns structured app errors), so this is **not** the proven current HTTP 500. It would block a future redeploy of the current local tree if left uncorrected.

---

## What is NOT the primary cause

| Ruled out | Evidence |
|-----------|----------|
| Authentication | Sign-in + `GET_RUNS` 200 |
| RLS | Service-role path used after auth; error is application throw, not RLS denial |
| Null reference / undefined property | Explicit `throw new Error(...)` with constructed message |
| Deno import failure on live | Handler runs; JSON error body returned |
| Network | HTTP 500 with application JSON body |
