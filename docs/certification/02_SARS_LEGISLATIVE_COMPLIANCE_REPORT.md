# 2. SARS Legislative Compliance Report

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05  
**Authority:** Official SARS publications only (no third-party calculators as primary)

---

## Legislative References Used

| Reference | URL / Source | Used For |
|-----------|--------------|----------|
| SARS Rates of Tax for Individuals | https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/ | Tax brackets, rebates 2025/2026 |
| SARS Medical Tax Credit Rates | https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/ | Monthly credits 2025 |
| PAYE-GEN-01-G01 Guide | https://www.sars.gov.za/wp-content/uploads/Ops/Guides/PAYE-GEN-01-G01-... | PAYE methodology |
| Income Tax Act 58 of 1962 | §81 (PAYE), §6A (medical), §11F (retirement), §10(1)(x) (severance) | Engine annotations |
| UI Act 4 of 2001 | — | UIF 1% employee + employer |
| SDL Act 9 of 1999 | — | 1% employer levy |

---

## Verified Against SARS Published Values (2025/2026)

| Parameter | SARS Published | Engine Value | Match |
|-----------|---------------|--------------|-------|
| Primary rebate | R17,235 | R17,235 | ✅ |
| Secondary rebate (65+) | R9,444 | R9,444 | ✅ |
| Tertiary rebate (75+) | R3,145 | R3,145 | ✅ |
| Medical credit — taxpayer | R364/month | R364 | ✅ |
| Medical credit — first dependant | R364/month | R364 | ✅ |
| Medical credit — additional | R246/month | R246 | ✅ |
| UIF rate | 1% | 1% | ✅ |
| SDL rate | 1% | 1% | ✅ |
| UIF monthly ceiling | R17,712 | R17,712 | ✅ |

**Certification cases:** `sars_rebate_primary`, `sars_med_main`, `sars_uif_ceiling` — all passed.

---

## Tax Bracket Verification

Progressive bracket formula verified at 6 income levels against independent SARS formula implementation:

| Annual Income | Engine Tax | Reference Tax | Match |
|---------------|-----------|---------------|-------|
| R95,000 | Certified | Certified | ✅ |
| R237,100 | Certified | Certified | ✅ |
| R300,000 | R59,032 | R59,032 | ✅ |
| R500,000 | R117,507 | R117,507 | ✅ |
| R1,000,000 | Certified | Certified | ✅ |
| R2,000,000 | Certified | Certified | ✅ |

Formula: `base + (income - bracket_from) × rate` per SARS tax tables.

---

## Compliance Status by Engine

| Engine | Compliance Status | Notes |
|--------|------------------|-------|
| PAYE | **VERIFIED** | Brackets, rebates, medical offset per SARS 2025/2026 |
| UIF | **VERIFIED** | Rate and ceiling formula |
| SDL | **VERIFIED** | Rate; exemption threshold R500,000 |
| Medical Credits | **VERIFIED** | SARS 2025 published rates |
| Retirement | **PARTIAL** | §11F limits correct; YTD aggregation not implemented |
| Fringe Benefits | **NOT VERIFIED** | Simplified percentages only |
| Travel Allowance | **NOT VERIFIED** | 80/20 simplification only |
| Bonus Tax | **VERIFIED** | Aggregate method via taxable earnings |
| Leave Encashment | **VERIFIED** | Taxable remuneration model |
| Termination | **PARTIAL** | R500k exemption correct; PAYE method simplified |

---

## Unsupported Scenarios (Documented Assumptions)

1. **Directors' remuneration** — No special PAYE treatment (SARS may require different annualisation)
2. **Company car fringe benefit** — 3.5% simplified vs Seventh Schedule calculated value
3. **Travel allowance** — Business use % model vs SARS fixed-cost tables
4. **Termination lump sums** — Bracket tax on severance balance vs IRP3(a) directive method
5. **Medical expenses credit** — Additional medical expenses credit (§6A(3)) not implemented
6. **Weekly/fortnightly PAYE** — Normalised to monthly at rules engine layer; SARS fortnightly tables not used directly

---

## Legislative Compliance Conclusion

**Core statutory calculations (PAYE, UIF, SDL, medical credits) are compliant with SARS published 2025/2026 values.** Optional engines require explicit user disclosure of simplified models.
