# ADMINLESS FIN V3.1
# Output Consistency Report

## Reconciliation Set

Certified run: `e2627366-641b-4635-8191-61f4b344cf57`  
Journal entry: `78d1966f-8557-4fef-ba05-aba19982142a`

Evidence source:

- `docs/certification/V3.1/evidence/payroll-output-reconciliation.json`
- `docs/certification/V3.0.4/evidence/live-e2e-evidence.json`

## Key equality checks

- Snapshot `total_employer_contributions` = **200**
- Payroll summary `employer_contributions` = **200**
- Register `employer_contributions` = **200**
- Journal employer liability/expense postings include **200** employer contribution accrual
- Payroll cost = gross (10000) + employer contributions (200) = **10200**

## Journal integrity

- Total debits: **10200**
- Total credits: **10200**
- Balanced: **true**

## Historical retrieval continuity

- Net pay preserved: **9900**
- Tax year preserved: **2025/2026**
- Rule version preserved: **2025.2.0**
- Employer contribution preserved in snapshot history: **200**

## Quality gates outcome

- Employee Number visible: PASS
- PAYE/UIF/SDL visible in output set: PASS
- Employer contributions visible and consistent: PASS
- Cost to Company visible and consistent: PASS
- Net salary consistent: PASS
- Journal/report/payslip/historical alignment: PASS
- Single source of truth preserved (snapshot): PASS
- Fallback logic removed from canonical path: PASS
