# Production Deployment Order

**Product:** AdminLess Fin · **Version:** 3.5.3 · **Date:** 2026-07-12  
**Board:** Independent Principal Enterprise Database Governance Board  
**Status:** Procedure certified — **not executed**

---

## Approved sequence (only)

```text
STEP 1  Apply Migration B
        20260707120000_payslip_item_employer_contribution.sql

STEP 2  Verify enum
        SELECT enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'payslip_item_type'
        ORDER BY enumsortorder;
        -- must include employer_contribution

STEP 3  Apply Migration A
        20260707140000_tax_year_2026_2027.sql

STEP 4  Verify tax year seed
        SELECT tax_year_label, effective_from, effective_to, is_active
        FROM payroll_tax_year_config
        WHERE country_code = 'ZA'
        ORDER BY effective_from;
        -- must include 2026/2027 | 2026-03-01 | 2027-02-28 | true

STEP 5  Record migrations as applied in remote history
        (repair / mark applied for these two versions only)

STEP 6  Smoke (post-approval window)
        GENERATE_PAYSLIPS on a draft run with pay_date ≥ 2026-03-01
        Confirm HTTP 200 and payslip_items may include type employer_contribution
```

---

## Explicitly forbidden in this window

- `supabase db push` of the full local migration set  
- Applying other local-only versions (`202607031*`, duplicate `20260705180000*`, `20260707150000`) as part of this fix  
- Dropping or renaming `company_contribution`  
- UPDATE/DELETE of existing `payslips`, `payslip_items`, or finalized `payroll_runs`

---

## Rollback plan

| Migration | Immediate (TX abort) | Post-commit |
|-----------|----------------------|-------------|
| B | Abort transaction before commit | **Do not** rebuild enum. Leave `employer_contribution` unused. Document forward-only |
| A | Abort transaction before commit | `DELETE FROM payroll_tax_year_config WHERE country_code='ZA' AND tax_year_label='2026/2027';` then un-mark migration if needed |

---

## Success criteria

1. Enum contains `employer_contribution`  
2. Tax year `2026/2027` row present and active  
3. Existing payslip item type counts unchanged for earning/deduction  
4. Finalized run count unchanged  
5. Both migration versions recorded on remote
