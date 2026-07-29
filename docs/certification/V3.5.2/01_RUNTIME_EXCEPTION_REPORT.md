# Runtime Exception Report

**Product:** AdminLess Fin  
**Version:** 3.5.2  
**Board:** Principal Enterprise Runtime Diagnostics Board  
**Date:** 2026-07-12  
**Scope:** Payroll Edge Function HTTP 500 (`POST /functions/v1/payroll`)  
**Constraint:** No functional fix applied; diagnosis only

---

## Verdict

The live Payroll Edge Function returns HTTP 500 on `GENERATE_PAYSLIPS` because it throws:

```text
Error: No payroll_tax_year_config row matches pay date 2026-12-31. Cannot resolve SARS tax year.
```

`APPROVE_RUN` then returns HTTP 500 as a **cascade**:

```text
Error: Generate payslips before approving.
```

---

## Reproduction (live)

| Field | Value |
|-------|--------|
| Project | `zaulhnpohrgqqodvzhxp` |
| Endpoint | `POST https://zaulhnpohrgqqodvzhxp.supabase.co/functions/v1/payroll` |
| Company | `3cbfd4eb-a095-43f3-837a-0b4f1e2c1752` |
| Target run | `8071fc56-caaa-4091-b2cd-e3482c90f749` |
| Pay date | `2026-12-31` |
| Status | `draft` |
| Evidence | `docs/certification/V3.5.2/evidence/payroll-edge-500-repro.json` |

### Observed HTTP responses

| Method | HTTP | Response `error` |
|--------|------|------------------|
| `GET_RUNS` | 200 | — |
| `GET_RUN_DETAIL` | 200 | — |
| `GENERATE_PAYSLIPS` | **500** | `No payroll_tax_year_config row matches pay date 2026-12-31. Cannot resolve SARS tax year.` |
| `APPROVE_RUN` | **500** | `Generate payslips before approving.` |

Additional runs:

| Pay date | Run ID | `GENERATE_PAYSLIPS` |
|----------|--------|---------------------|
| `2026-12-31` | `8071fc56-…` | 500 — no matching tax year row |
| `2026-07-31` | `bd17d9b2-…` | 500 — no matching tax year row |
| `2026-01-31` | `6f1efa9f-…` | 500 — **different** exception after tax-year match (see Root Cause Report §Secondary) |

---

## Exact exception (primary)

| Field | Value |
|-------|--------|
| **Error** | `No payroll_tax_year_config row matches pay date 2026-12-31. Cannot resolve SARS tax year.` |
| **Type** | `Error` (plain; not `PayrollDomainError`) |
| **File** | `supabase/functions/_shared/generatePayslips.ts` |
| **Function** | `loadPayrollRulesContext` |
| **Lines** | **85–88** |
| **Variable** | `taxYearConfig` (result of `resolveTaxYearForDate(payDate, taxYearRows)` is falsy) |
| **Callee that returns undefined** | `resolveTaxYearForDate` in `supabase/functions/_shared/payrollRulesEngine/paye.ts` lines **92–99** |
| **Caller chain** | `payroll/index.ts` `GENERATE_PAYSLIPS` → `generatePayslipsWithRulesEngine` → `loadPayrollRulesContext` |

### Throw site (source)

```85:88:supabase/functions/_shared/generatePayslips.ts
  if (!taxYearConfig) {
    throw new Error(
      `No payroll_tax_year_config row matches pay date ${payDate}. Cannot resolve SARS tax year.`
    );
```

### Why HTTP 500 (not 400)

`payroll/index.ts` `payrollErrorResponse` only maps `PayrollDomainError` to a domain status. Plain `Error` is always serialized as:

```json
{ "stage": "unknown", "code": "INTERNAL_ERROR", "status": 500 }
```

---

## Database proof

Live query of `payroll_tax_year_config`:

| tax_year_label | effective_from | effective_to | is_active |
|----------------|----------------|--------------|-----------|
| `2025/2026` | `2025-03-01` | `2026-02-28` | true |

**Only one active ZA row exists.** Pay dates `2026-07-31` and `2026-12-31` are outside `effective_to`.

Local migration that would seed coverage exists but is **not applied remotely**:

| Migration | Local | Remote |
|-----------|-------|--------|
| `20260707140000_tax_year_2026_2027` | present | **missing** |

That migration inserts `2026/2027` for `2026-03-01` … `2027-02-28`.

---

## Category (exactly one — primary observed failure)

**☑ Missing migration**

(Related: missing legislation row in DB for tax year 2026/2027; root cause is the unapplied seed migration.)

---

## Quality gates

| Gate | Status |
|------|--------|
| Exact exception identified | ✓ |
| Stack / call chain identified | ✓ |
| File / function / line identified | ✓ |
| Original root cause identified | ✓ |
| No speculative fix implemented | ✓ |
