# 1. Directors PAYE Compliance Report

**Engine:** `engines/directorsPayeEngine.ts`  
**Legislation:** Income Tax Act §83; PAYE-GEN-01-G01

## Implemented Methods

| Type | Formula | Certification |
|------|---------|---------------|
| `monthly_fixed` | Standard monthly remuneration | `director_monthly_fixed` ✅ |
| `annual_fee` | Full fee as deemed taxable (annual equivalent) | `director_annual_fee` ✅ |
| `monthly_variable` | `(payment / months) × 12 / 12` | Implemented |
| `connected_person` | Standard monthly with audit flag | Implemented |

## PAYE Integration

Directors engine adjusts `taxableEarnings` before PAYE. `payeMode: director_annual_fee` calculates full annual tax in payment month per SARS annual equivalent method.

**Status:** VERIFIED
