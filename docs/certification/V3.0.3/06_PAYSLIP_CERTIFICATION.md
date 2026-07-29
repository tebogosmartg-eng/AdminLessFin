# 6. Payslip Certification Report (V3.0.3)

**Date:** 2026-07-05  
**Phase:** 5 — Payslip  
**Result:** **PARTIAL FAIL**

---

## Field Matrix

| Field | Stored (`calculation_snapshot`) | Rendered (PDF/HTML) | Status |
|-------|------------------------------|---------------------|--------|
| Employee Number | ✅ | ✅ | PASS |
| Employee Name | ✅ | ✅ | PASS |
| Department | ✅ | ✅ | PASS |
| Company | ✅ | ✅ | PASS |
| Pay Period | ✅ | ✅ | PASS |
| Gross | ✅ | ✅ | PASS |
| Allowances | ✅ | ✅ (earnings table) | PASS |
| Benefits | ✅ | partial | PARTIAL |
| Retirement | ✅ | in deductions if line item | PARTIAL |
| Medical | ✅ | in deductions if line item | PARTIAL |
| PAYE | ✅ | ✅ statutory summary | PASS |
| UIF | ✅ | ✅ | PASS |
| SDL | ✅ | ✅ | PASS |
| Net Salary | ✅ | ✅ | PASS |
| Employer Contributions | ✅ | ✅ | PASS |
| **YTD** | partial in engine | **❌** | **FAIL** |
| **Tax Year** | ✅ `tax_year` in snapshot | **❌** | **FAIL** |
| **Rule Version** | ✅ `rule_version` | **❌** | **FAIL** |
| **Calculation Version** | ✅ `3.0.2` in snapshot | **❌** | **FAIL** |
| Audit Reference | ✅ | ✅ | PASS |
| Company Branding | — | ✅ brand bar, logo | PASS |
| PDF Generation | — | ✅ `generatePayslipPdf` | PASS (not runtime tested) |
| HTML Rendering | — | ✅ `buildPayslipHtml` | PASS |
| Download/Print | — | ✅ UI buttons | NOT VERIFIED |
| Historical Retrieval | — | ✅ `GET_PAYSLIP_DETAIL` | NOT VERIFIED |
| Mathematical consistency | ✅ | ✅ totals match items | PASS (code) |

**Source:** `src/lib/payrollDocuments.ts`, `src/components/PayslipDetailDialog.tsx`

---

## Phase 5 Verdict

**PARTIAL FAIL** — mandatory rendered fields YTD, Tax Year, Rule Version, Calculation Version absent from payslip output despite being stored in `calculation_snapshot`.
