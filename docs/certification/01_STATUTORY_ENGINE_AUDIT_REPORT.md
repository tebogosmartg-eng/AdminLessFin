# 1. Statutory Engine Audit Report

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05  
**Engine version:** 3.0.0  
**Method:** Static code audit + automated certification execution

---

## Executive Summary

Ten statutory engines were audited. Core engines (PAYE, UIF, SDL, Medical Tax Credits) implement data-driven formulas aligned with SARS published rates for 2025/2026. Optional engines (Fringe Benefits, Travel Allowance, Termination) implement **simplified legislative models** documented as assumptions.

One legislative defect was identified and corrected during certification: **age 75+ rebate stacking** (secondary rebate was not applied when tertiary applied).

---

## Engine Audit Matrix

### PAYE Engine (`engines/payeEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Calculate monthly PAYE from taxable earnings |
| **Inputs** | `monthlyTaxableIncome`, `annualMedicalCredits`, `age`, `ytdTaxableIncome`, `ytdPayePaid`, `ruleSet.brackets/rebates` |
| **Outputs** | `employeeAmount` (monthly PAYE), breakdown (annual tax, rebate, credits, liability) |
| **Formula** | Annualise → bracket tax → subtract rebates → subtract medical credits → divide by 12 (or YTD projection) |
| **Dependencies** | `calculateAnnualTax`, `resolveRebate`, medical engine |
| **Tax years** | All versioned rule sets via `ruleSet` |
| **Rule source** | `payroll_tax_year_config` / `registry/taxYears.ts` |
| **Edge cases** | Zero income ✅, YTD adjustment ✅, age rebates ✅ (fixed 75+) |
| **Audit output** | 4–5 steps per calculation |

### UIF Engine (`engines/uifEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Employee and employer UIF contributions |
| **Inputs** | `grossEarnings`, `uifRate`, `uifCeilingMonthly` |
| **Outputs** | `employeeAmount` / `employerAmount` |
| **Formula** | `min(gross, ceiling) × rate` |
| **Dependencies** | None |
| **Tax years** | Rate/ceiling from rule set |
| **Rule source** | UI Act; ceiling R17,712 in rule set |
| **Edge cases** | Below/at/above ceiling — all certified ✅ |
| **Audit output** | 2 steps |

### SDL Engine (`engines/sdlEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Employer skills development levy |
| **Inputs** | `grossEarnings`, `sdlRate`, `companyAnnualRemuneration` |
| **Outputs** | `employerAmount` |
| **Formula** | `gross × 1%` if company annual > R500,000 |
| **Dependencies** | `companyAnnualRemuneration` must be supplied for exemption |
| **Edge cases** | Exempt at R500,000 ✅, liable at R500,001 ✅ |
| **Audit output** | 1–2 steps |

### Medical Tax Credit Engine (`engines/medicalTaxCreditEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Monthly medical scheme fee tax credits |
| **Inputs** | `medicalDependants`, `ruleSet.medicalCredits` |
| **Outputs** | `breakdown.monthlyCredit` (offsets PAYE, not a deduction) |
| **Formula** | main + first + (additional × (n-1)) |
| **Rule source** | SARS Medical Tax Credit Rates 2025: R364/R364/R246 |
| **Edge cases** | 0, 1, 3 dependants certified ✅ |
| **Audit output** | 1 step |

### Retirement Deduction Engine (`engines/retirementDeductionEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Section 11F deductible retirement contributions |
| **Inputs** | `retirementContributions`, `grossEarnings` |
| **Outputs** | `taxableAdjustment` (negative), `employeeAmount` (contribution) |
| **Formula** | `min(contribution, min(27.5% × annual, R350k) / 12)` |
| **Edge cases** | Below/above limit certified ✅ |
| **Assumption** | Does not aggregate YTD retirement across tax year |

### Fringe Benefit Engine (`engines/fringeBenefitEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Taxable value of fringe benefits |
| **Formula** | `monthlyValue × taxablePercent` (company car default 3.5%) |
| **Assumption** | **Simplified** — does not implement full Seventh Schedule vehicle formula |

### Travel Allowance Engine (`engines/travelAllowanceEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Taxable portion of travel allowance |
| **Formula** | `allowance × (1 - businessUsePercent)` |
| **Assumption** | **Simplified** — does not implement SARS fixed cost / km logbook method |

### Bonus Tax Engine (`engines/bonusTaxEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Add bonus to taxable earnings for PAYE |
| **Formula** | `taxableAdjustment = bonus.amount` |
| **Note** | PAYE engine applies marginal rate on combined income |

### Leave Encashment Engine (`engines/leaveEncashmentEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Taxable leave encashment |
| **Formula** | `days × dailyRate` added to taxable earnings |
| **Certified** | ✅ |

### Termination Tax Engine (`engines/terminationTaxEngine.ts`)

| Attribute | Finding |
|-----------|---------|
| **Purpose** | Severance exemption and PAYE on taxable portion |
| **Formula** | R500k lifetime exemption; `bracket_tax(taxable) - rebate` on balance |
| **Assumption** | **Simplified** — does not implement SARS lump-sum directive tables; rebate re-applied on severance-only amount |

---

## Defect Identified and Corrected

| ID | Engine | Issue | Fix |
|----|--------|-------|-----|
| CERT-001 | `resolveRebate()` | Age 75+ received tertiary only, not secondary+tertiary | Changed to cumulative: 65+ secondary, 75+ tertiary |

**Evidence:** `paye_age_75` certification case failed before fix (expected R2,070, actual R2,857); passes after fix.

---

## Audit Conclusion

Core statutory engines are structurally sound with single responsibility, audit trails, and versioned rule support. Optional engines require documented simplifications before full legislative certification.
