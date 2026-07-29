# Payroll E2E Verification Report

**Product:** AdminLess Fin · **Version:** 3.5.4 · **Date:** 2026-07-12  
**Evidence:** `evidence/03-payroll-e2e.json`  
**Run:** `4474253a-9dbf-4ac6-8f13-ef758d995f03` · pay_date `2026-07-31`

---

## Results

| Requirement | Status | Runtime evidence |
|-------------|--------|------------------|
| Generate Payslips | ✓ PASS | HTTP 200 · `generated: 2` · engine `statutory_payroll_engine_v3` |
| Approve Run | ✓ PASS | HTTP 200 · `approved_at: 2026-07-12T16:47:15.745+00:00` |
| Generate Journal | ✓ PASS | HTTP 200 · FINALIZE_RUN · status `finalized` |
| Generate Bank File | ✓ PASS | HTTP 200 · batch `generated` · 2 employees · total `38590.53` |
| Payroll Reports | ✓ PASS | GET_RUN_SUMMARY + GET_PERIOD_REPORTS HTTP 200 |
| Historical Retrieval | ✓ PASS | GET_RUN_DETAIL on prior finalized run HTTP 200 |
| No HTTP 500 | ✓ PASS | All critical calls 200 |
| Employer contributions persist | ✓ PASS | `payslip_items.type=employer_contribution` · UIF Employer `177.12` · SDL `354.6` |
| 2026/2027 legislation resolves | ✓ PASS | snapshot `tax_year: "2026/2027"` · `rule_version: "2026.2.0"` |
| Payslips generated | ✓ PASS | count 2 |
| Journal balances | ✓ PASS | debit `10000` = credit `10000` |
| Payroll Summary correct | ✓ PASS | summary returned with gross/net/employer fields |
| Trial Balance (hist journals) | ✓ PASS | 2 historical journals balanced |

**Payroll E2E: PASS**
