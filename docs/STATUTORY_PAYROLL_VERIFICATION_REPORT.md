# Statutory Payroll Engine — Verification Report

**Run date:** 2026-07-05  
**Engine version:** 3.0.0  
**Tax year tested:** 2025/2026  
**Result:** 12/12 passed

---

## Verification Matrix

| ID | Check | Expected | Status |
|----|-------|----------|--------|
| bracket_300k | Annual tax on R300,000 (26% bracket) | R59,032 | ✅ |
| bracket_500k | Annual tax on R500,000 (31% bracket) | R117,507 | ✅ |
| rebate_primary | Primary rebate (under 65) | R17,235 | ✅ |
| rebate_secondary | Primary + secondary rebate (65+) | R26,679 | ✅ |
| medical_0_dep | Monthly medical credit — main member | R364 | ✅ |
| medical_2_dep | Monthly medical credit — 2 dependants | R974 | ✅ |
| paye_25k_monthly | Monthly PAYE on R25,000 taxable | R3,119.08 | ✅ |
| uif_15k | UIF 1% on R15,000 (below ceiling) | R150.00 | ✅ |
| uif_ceiling | UIF capped at R17,712 ceiling | R177.12 | ✅ |
| sdl_30k | SDL 1% on R30,000 | R300.00 | ✅ |
| sdl_exemption | SDL exempt ≤ R500k annual remuneration | R0 | ✅ |
| historical_2024_2025 | 2024/2025 rules for June 2024 pay date | 2024/2025 | ✅ |

---

## SARS Alignment Notes

- **Tax brackets:** Progressive bracket table per SARS 2025/2026 published rates
- **Rebates:** Primary R17,235; secondary +R9,444 (65+); tertiary +R3,145 (75+)
- **Medical credits:** R364 main member; R364 first dependant; R246 additional
- **UIF:** 1% employee + 1% employer, monthly ceiling R17,712
- **SDL:** 1% employer levy; exempt if total annual remuneration ≤ R500,000

---

## Quality Gates

| Gate | Status |
|------|--------|
| PAYE matches SARS bracket methodology | ✅ |
| UIF calculations correct | ✅ |
| SDL calculations correct | ✅ |
| Tax brackets applied correctly | ✅ |
| Rebates applied correctly | ✅ |
| Medical tax credits applied correctly | ✅ |
| Historical payroll preserved (versioned rules) | ✅ |
| Versioned tax rules supported | ✅ |
| Audit trail generated | ✅ |
| Build passes | ✅ |
| TypeScript passes | ✅ |
| No workflow/BOE regressions | ✅ |

---

## Run Verification

```bash
npx tsx -e "import { runStatutoryVerification } from './src/lib/statutoryPayrollEngine/verify.ts'; const r = runStatutoryVerification(); console.log(r);"
```
