# Migration Status Report — V3.0.6

## Outstanding Migration(s)
1. `20260707120000_payslip_item_employer_contribution.sql`
   - SQL: `ALTER TYPE payslip_item_type ADD VALUE IF NOT EXISTS 'employer_contribution';`

## Current State
- Application fallback currently active:
  - `supabase/functions/_shared/generatePayslips.ts`
  - filters out `employer_contribution` items before writing `payslip_items`.
- This avoids runtime failure but reduces payslip line-level visibility.

## Push Attempt Outcome
- Command: `supabase db push --linked --yes`
- Result: FAILED (connectivity/auth to pooler)
- Evidence: `terminals/303787.txt`

## Classification
- Required before production: ? (enum alignment to remove fallback)
- Technical debt: ? (runtime fallback due unapplied migration)
- Optional: ?

## Validated Plan
1. Restore DB connectivity/auth (`SUPABASE_DB_PASSWORD` and network reachability).
2. Apply migration to linked project.
3. Remove fallback filter in `generatePayslips.ts`.
4. Redeploy payroll function.
5. Re-run live certification and confirm payslip SDL/employer lines present.

Status: **VERIFIED EVIDENCE ADDED** (not yet fixed)
