# 5. Audit Trail Certification Report

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05  
**Spec:** `src/lib/statutoryPayrollEngine/audit.ts`

---

## Required Fields Assessment

| Required Field | Present in Snapshot | Present in Step Trail | Status |
|----------------|--------------------|-----------------------|--------|
| Tax Year | `tax_year` | `inputs.taxYear` | ✅ |
| Rule Version | `rule_version` | `inputs.ruleVersion` | ✅ |
| Calculation Version | `engine_version` (3.0.0) | `inputs.engineVersion` | ✅ |
| Gross Earnings | `gross_earnings` | pipeline_totals step | ✅ |
| Taxable Earnings | `taxable_earnings` | — | ✅ |
| Net Pay | `net_pay` | pipeline_totals step | ✅ |
| Formula References | — | `formula` on every step | ✅ |
| Intermediate Values | — | `intermediate` object | ✅ |
| Statutory Adjustments | `engine_results[].breakdown` | Per-engine steps | ✅ |
| Rebates | PAYE `rebate` step | ✅ | ✅ |
| Thresholds | UIF ceiling, SDL exemption steps | ✅ | ✅ |
| Deductions | `engine_results[].employee_amount` | ✅ | ✅ |
| Contributions | `engine_results[].employer_amount` | ✅ | ✅ |
| **Employee Number** | **Not present** | **Not present** | ❌ GAP |

---

## Certification Tests (9 cases — all passed)

| Test ID | Result |
|---------|--------|
| audit_has_tax_year | ✅ |
| audit_has_rule_version | ✅ |
| audit_has_engine_version | ✅ |
| audit_has_gross | ✅ |
| audit_has_taxable | ✅ |
| audit_has_net_pay | ✅ |
| audit_trail_nonempty (>5 steps) | ✅ |
| audit_engine_results (per-engine trails) | ✅ |
| audit_formula_present (all steps) | ✅ |

**Typical audit step count per employee:** 19 steps (full pipeline with PAYE, UIF, SDL).

---

## Sample Audit Step

```json
{
  "step": "bracket_tax",
  "formula": "base + (income - bracket_from) × rate",
  "inputs": {
    "taxYear": "2025/2026",
    "ruleVersion": "2025.1.0",
    "annualTaxableIncome": 300000,
    "bracketFrom": 237100,
    "bracketRate": 0.26,
    "engineId": "paye",
    "engineVersion": "3.0.0"
  },
  "intermediate": { "bracketBase": 42678 },
  "result": 59032
}
```

---

## Suitability Assessment

| Use Case | Suitable | Notes |
|----------|----------|-------|
| Payroll Review | ✅ | Full breakdown available |
| External Audit | ✅ | Formula + inputs per step |
| Employee Queries | ⚠️ | Missing employee number/name in snapshot |
| AI Explanation | ✅ | Structured steps with formulas |
| Troubleshooting | ✅ | Per-engine breakdown |

---

## Audit Trail Conclusion

**CONDITIONALLY COMPLETE** — All mathematical steps, formulas, versions, and totals are exposed. Employee identifier is stored on payslip record but **not embedded in calculation_snapshot** (gap for employee-facing audit queries).
