# 03 — Payroll Item Registry Report

**Version:** 3.6.4  
**Module:** `src/reporting/facts/PayrollItemRegistry.ts`

## 1. Purpose

Reports must not hardcode payroll rows. The registry defines:

`code · description · category · displayOrder · reportGroup · isEarning · isDeduction · isEmployerContribution · matchKeywords · engineIds? · synthetic?`

## 2. Seeded items

Basic Salary, Overtime, Bonus, Commission, Travel/Housing/Allowances, Fringe Benefits, Retirement Contributions, Medical Aid, PAYE, UIF Employee/Employer, SDL, Net Pay, Cost To Company.

## 3. Extensibility

`registerPayrollItem(def)` adds/updates items. VIP consumes `VIP_ITEM_CODES` from the registry. New items do not require VIP/matrix code edits beyond optional inclusion in a consumer’s item-code list.

## 4. Verdict

**CERTIFIED** — Dynamic Payroll Item Registry drives report components.
