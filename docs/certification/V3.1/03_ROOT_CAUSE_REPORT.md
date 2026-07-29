# ADMINLESS FIN V3.1
# Root Cause Report

## Verified Root Cause

The first divergence occurred at payslip item persistence:

- `supabase/functions/_shared/generatePayslips.ts` filters out line items with `type === 'employer_contribution'` before inserting into `payslip_items`.
- Downstream consumers that depended on `payslip_items` could under-represent employer contributions.

## Why this created output inconsistency

- Statutory engine correctly calculates employer UIF/SDL and persists totals in `calculation_snapshot`.
- Some output paths consumed item rows instead of snapshot totals.
- Result: inconsistent employer contribution values across outputs.

## Minimal compliant fix applied

- Preserved locked architecture.
- Did not change statutory calculations, BOE, command/event/subscriber model, or accounting architecture.
- Standardized output consumers to snapshot canonical source:
  - `calculation_snapshot.total_employer_contributions`

## Files changed to resolve root cause

- `supabase/functions/payroll/index.ts`
- `src/lib/queries.ts`
- `src/lib/payrollReports.ts`
- `src/pages/PayrollReports.tsx`
- `tests/unit/payroll-employer-contribution-consistency.test.ts`
