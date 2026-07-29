# Stack Trace Report

**Product:** AdminLess Fin · **Version:** 3.5.2 · **Date:** 2026-07-12  
**Board:** Principal Enterprise Runtime Diagnostics Board

---

## Note on Edge Runtime stacks

Supabase Edge Function responses do **not** return Deno `Error.stack` in the JSON body. The deployed handler catches all exceptions and returns only `message` via `payrollErrorResponse`.

The stack below is therefore a **proven reconstructed call chain**: exact error message matched byte-for-byte to the throw site, with callers verified from source and live method routing.

---

## Primary stack — `GENERATE_PAYSLIPS`

```text
Error: No payroll_tax_year_config row matches pay date 2026-12-31. Cannot resolve SARS tax year.

  at loadPayrollRulesContext (supabase/functions/_shared/generatePayslips.ts:86:11)
  at generatePayslipsWithRulesEngine (supabase/functions/_shared/generatePayslips.ts:122:15)
  at serve switch case 'GENERATE_PAYSLIPS' (supabase/functions/payroll/index.ts:345:40)
  at serve handler catch → payrollErrorResponse (supabase/functions/payroll/index.ts:1205–1206)
```

### Cause chain

```text
resolveTaxYearForDate(payDate, taxYearRows)  →  undefined
        ↑
        |  payDate = "2026-12-31"
        |  taxYearRows = only mapped rows from DB (single row 2025/2026 → 2026-02-28)
        |
mapTaxYearFromDb(rows)  ←  SELECT * FROM payroll_tax_year_config
                              WHERE country_code='ZA' AND is_active=true
```

`resolveTaxYearForDate` (`paye.ts:92–99`):

```92:99:supabase/functions/_shared/payrollRulesEngine/paye.ts
export function resolveTaxYearForDate(
  payDate: string,
  configs: TaxYearConfig[]
): TaxYearConfig | undefined {
  const date = payDate.slice(0, 10);
  return configs.find(
    (c) => date >= c.effectiveFrom && date <= c.effectiveTo
  );
}
```

---

## Cascade stack — `APPROVE_RUN`

```text
Error: Generate payslips before approving.

  at serve switch case 'APPROVE_RUN' (supabase/functions/payroll/index.ts:472:31)
  at serve handler catch → payrollErrorResponse (supabase/functions/payroll/index.ts:1205–1206)
```

```468:472:supabase/functions/payroll/index.ts
        const { count: payslipCount } = await supabaseAdmin
          .from('payslips')
          .select('id', { count: 'exact', head: true })
          .eq('payroll_run_id', body.runId);
        if (!payslipCount) throw new Error('Generate payslips before approving.');
```

This is **not** an independent root cause. Payslip count is 0 because `GENERATE_PAYSLIPS` failed first.

---

## Secondary stack — proven on in-range pay date (`2026-01-31`)

After tax-year resolution succeeds, persistence fails:

```text
Error: invalid input value for enum payslip_item_type: "employer_contribution"

  at generatePayslipsWithRulesEngine
       supabaseAdmin.from('payslip_items').insert(itemsToInsert)
       (supabase/functions/_shared/generatePayslips.ts:259:70)
  ← items typed from statutory pipeline lines with type: 'employer_contribution'
       (supabase/functions/_shared/statutoryPayrollEngine/pipeline.ts:174)
```

See Root Cause Report §Secondary.
