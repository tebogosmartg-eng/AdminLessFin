# 9. Audit Certification Report (V3.0.3)

**Date:** 2026-07-05  
**Phase:** 8 — Audit  
**Result:** **PASS (statutory engine); PARTIAL (platform)**

---

## Statutory Audit Suite (Observed)

16 audit certification cases — **all passed** in `npm run certify:statutory`:

| Field | Case ID | Status |
|-------|---------|--------|
| employee_number | `audit_has_employee_number` | ✅ |
| company_id | in snapshot | ✅ |
| payroll_run_id | `audit_has_payroll_run` | ✅ |
| command_id | `audit_has_command_id` | ✅ |
| correlation_id | `audit_has_correlation_id` | ✅ |
| rule_version | `audit_has_rule_version` | ✅ |
| calculation_version | `audit_has_calc_version` (3.0.2) | ✅ |
| formula | `audit_formula_present` | ✅ |
| inputs/outputs | `audit_trail_nonempty` | ✅ |
| timestamp | `audit_has_timestamp` | ✅ |
| gross/taxable/net | `audit_has_gross`, etc. | ✅ |
| per-engine trails | `audit_engine_results` | ✅ |

**Storage:** `payslips.calculation_snapshot` via `buildCalculationSnapshot` in `generatePayslips.ts`

---

## Platform Audit Events

- Table: `payroll_audit_events` (migration `20260702142900`)
- RLS: company-scoped select/insert policies
- Events: `run_processed`, etc. via `logPayrollAudit`

---

## Gaps

| Field | Status |
|-------|--------|
| User / Approver on calculation snapshot | Partial (`generatedBy` only) |
| Journal Reference on snapshot | Not in snapshot; on run record |
| Payslip Reference | `auditReference` in pipeline |
| Bank File Reference | In `output_metadata`, not snapshot |

**Phase 8 Verdict:** **PASS** for calculation audit trail; **PARTIAL** for full platform cross-references.
