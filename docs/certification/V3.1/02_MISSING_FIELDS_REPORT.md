# ADMINLESS FIN V3.1
# Missing Fields Report

## Result

No blocking calculated payroll fields are missing from certified payroll outputs after V3.1 fixes.

## Fields explicitly verified in outputs

- Employee number
- Employee name
- Department
- Payroll period
- Tax year
- Rule version
- Gross earnings
- Total employee deductions
- Net salary
- Employer contributions (total)
- Cost to company
- PAYE / UIF / SDL representation

## Previously missing/inconsistent fields and resolution

1. **Employer contributions inconsistent across register/summary/reports**
   - Cause: item-only derivation in output consumers while persistence omitted employer contribution item rows.
   - Fix: enforce snapshot canonical source in:
     - `supabase/functions/payroll/index.ts`
     - `src/lib/queries.ts`
     - `src/lib/payrollReports.ts`

2. **Payroll reports register grid omitted explicit SDL/Employer columns**
   - Fix: added SDL and Employer columns in `src/pages/PayrollReports.tsx`.

3. **Historical retrieval lacked snapshot metadata visibility**
   - Fix: `GET_EMPLOYEE_PAYROLL_HISTORY` now selects `calculation_snapshot` and employee embed in `supabase/functions/payroll/index.ts`.

## Non-blocking note

Some optional earnings/deduction subtypes (overtime, commission, bonus, travel, fringe, leave encashment, etc.) are displayed only when present in line items/rules for the run; in the certified run these were not active and therefore correctly not rendered as non-zero values.
