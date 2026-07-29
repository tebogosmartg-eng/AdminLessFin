# Failure Sequence Report

**Product:** AdminLess Fin · **Version:** 3.5.2 · **Date:** 2026-07-12  
**Board:** Principal Enterprise Runtime Diagnostics Board  
**Run:** `8071fc56-caaa-4091-b2cd-e3482c90f749` · Pay date `2026-12-31`

---

## End-to-end sequence

```text
BOE STARTED
  ↓
BOE VALIDATED
  ↓
BOE EXECUTING
  ↓
POST /functions/v1/payroll  { method: GENERATE_PAYSLIPS, runId, company_id }
  ↓
[1] Authentication ....................... PASS  (user JWT accepted)
  ↓
[2] Command routing ...................... PASS  (switch → GENERATE_PAYSLIPS)
  ↓
[3] Payroll loading ...................... PASS  (fetchPayrollRun → draft run loaded)
  ↓
[4] Employee / rules / tax-year loading .. PASS queries
      • payroll_rule_catalog
      • company_payroll_rule_settings
      • employee_payroll_rule_settings
      • payroll_tax_year_config (ZA, active) → 1 row (ends 2026-02-28)
      • employees
  ↓
[5] Legislation / tax-year resolution .... FAIL
      resolveTaxYearForDate("2026-12-31", rows) → undefined
      throw at generatePayslips.ts:86
  ↓
[6] Calculation pipeline ................. NOT REACHED
[7] Payslip generation / persistence ..... NOT REACHED
[8] Journal posting ...................... N/A (not part of GENERATE_PAYSLIPS)
[9] Audit (payslips_generated) ........... NOT REACHED
[10] Response ............................ HTTP 500 INTERNAL_ERROR
  ↓
BOE FAILED
```

**Last successful step:** completion of parallel DB loads inside `loadPayrollRulesContext` (catalog, settings, employees, tax-year rows returned).  
**First failing step:** tax-year date match (`resolveTaxYearForDate`).

---

## APPROVE_RUN sequence (same run)

```text
POST /functions/v1/payroll  { method: APPROVE_RUN, runId, company_id }
  ↓
[1] Authentication ....................... PASS
[2] Command routing ...................... PASS
[3] Payroll loading ...................... PASS  (run loaded, not finalized)
[4] Payslip count check .................. FAIL  (count = 0)
      throw at payroll/index.ts:472
  ↓
Response ................................. HTTP 500
```

---

## Instrumentation conclusion (Phase 2)

Without code changes, live method probing established the cutover point:

| Step | Status on failing run |
|------|------------------------|
| Auth | OK |
| Routing | OK |
| Payroll load | OK |
| Employee load | OK (query succeeded) |
| Legislation / tax-year resolve | **EXCEPTION** |
| Calculation | not reached |
| Persistence | not reached |
| Audit | not reached |
| Success response | not reached |

---

## Evidence artifacts

| File | Contents |
|------|----------|
| `docs/certification/V3.5.2/evidence/payroll-edge-500-repro.json` | Full HTTP bodies for GET_RUNS / GET_RUN_DETAIL / GENERATE_PAYSLIPS / APPROVE_RUN |
| `docs/certification/V3.5.2/evidence/generate-payslips-multi-run.json` | Dec / Jul / Jan pay-date comparison |
