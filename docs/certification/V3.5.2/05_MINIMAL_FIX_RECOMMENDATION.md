# Minimal Fix Recommendation

**Product:** AdminLess Fin · **Version:** 3.5.2 · **Date:** 2026-07-12  
**Board:** Principal Enterprise Runtime Diagnostics Board  
**Status:** RECOMMENDATION ONLY — **do not implement until approved**

---

## Primary fix (unblocks GENERATE_PAYSLIPS for pay dates ≥ 2026-03-01)

1. Apply the already-authored migration to remote:

   - `supabase/migrations/20260707140000_tax_year_2026_2027.sql`

2. Verify:

   ```sql
   SELECT tax_year_label, effective_from, effective_to, is_active
   FROM payroll_tax_year_config
   WHERE country_code = 'ZA'
   ORDER BY effective_from;
   ```

   Expected: row `2026/2027` covering `2026-03-01` … `2027-02-28`.

3. Re-run `GENERATE_PAYSLIPS` on run `8071fc56-…` (pay date `2026-12-31`).

**Do not** weaken `resolveTaxYearForDate` or reintroduce silent tax-year fallback.

---

## Required follow-on fix (proven secondary blocker)

After tax-year seed is applied, generation still fails on payslip persistence until:

- `supabase/migrations/20260707120000_payslip_item_employer_contribution.sql`

is applied (adds enum value `employer_contribution` to `payslip_item_type`).

Verify:

```sql
SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'payslip_item_type'
ORDER BY e.enumsortorder;
```

Must include `employer_contribution`.

---

## Migration hygiene

`supabase migration list --linked` shows multiple local migrations not on remote (including `20260707120000`, `20260707140000`, and others). Apply the payroll-blocking ones in chronological order; resolve any remote-only `20260708071540` drift before a blanket `db push`.

---

## Optional (non-blocking) hardening

Map the existing tax-year miss and payslip precondition throws to `PayrollDomainError` with HTTP 400/409 so BOE can distinguish domain failure from true internals. **Not required to clear the root cause.**

---

## Explicitly out of scope for this fix

- Payroll calculation redesign  
- Legislation repository redesign  
- Silent fallbacks  
- Patching APPROVE_RUN independently (cascade only)
