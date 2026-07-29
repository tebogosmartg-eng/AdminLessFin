# ADMINLESS FIN V3.1
# Payroll Output Trace Report

## Scope

Pipeline audited end-to-end for payroll output representation consistency:

Employee → Rules Engine → Statutory Engine → Calculation Snapshot → Payslip Generation → Register → Summary → Reports → Journal/GL/TB basis → Bank File → Historical Retrieval.

## Canonical Source of Payroll Output Values

- **Statutory-calculated payroll totals and employer contributions:** `payslips.calculation_snapshot`
- **Canonical employer contribution field:** `calculation_snapshot.total_employer_contributions`
- **Canonical identity/version fields:** `calculation_snapshot.employee_number`, `calculation_snapshot.tax_year`, `calculation_snapshot.rule_version`

## Trace by Destination

1. **Calculation Snapshot**
   - Producer: `supabase/functions/_shared/generatePayslips.ts` + statutory pipeline
   - Contains payroll values including `total_employee_deductions`, `total_employer_contributions`, `tax_year`, `rule_version`.

2. **Payslip HTML/PDF**
   - Builder: `src/lib/payrollDocuments.ts`
   - Includes employee identity, period, tax/rule version block, earnings/deductions/employer contribution sections, statutory summary, net pay, cost to company.

3. **Payroll Register**
   - Source API: `GET_RUN_REGISTER` in `supabase/functions/payroll/index.ts`
   - Employer contributions now sourced from snapshot canonical value.

4. **Payroll Summary**
   - Source API: `GET_RUN_SUMMARY` in `supabase/functions/payroll/index.ts`
   - Employer contributions now sourced from `sumSnapshotEmployerContributions` only.

5. **Payroll Reports**
   - Query path: `src/lib/queries.ts` (`fetchPayrollPeriodReports`)
   - Aggregation path: `src/lib/payrollReports.ts` (`buildPeriodReports`)
   - Canonical employer contribution now carried from snapshot into totals/register/CTC.

6. **Journal / GL / Trial Balance basis**
   - Posting path: `FINALIZE_RUN` in `supabase/functions/payroll/index.ts`
   - Employer contribution journal lines are posted from snapshot totals.
   - Balancing evidence generated in E2E run and reconciliation extract.

7. **Bank File**
   - Builder: `src/lib/payrollDocuments.ts`
   - Uses net pay totals from finalized payslips.

8. **Historical Retrieval**
   - API: `GET_EMPLOYEE_PAYROLL_HISTORY` in `supabase/functions/payroll/index.ts`
   - Includes snapshot fields for tax year/rule version/employer contribution continuity.

## Fresh Runtime Evidence

- E2E command: `npm run certify:e2e`
- Result: `39 PASS / 0 FAIL / 0 NOT_VERIFIED`
- Evidence file: `docs/certification/V3.0.4/evidence/live-e2e-evidence.json`
- Reconciliation extract: `docs/certification/V3.1/evidence/payroll-output-reconciliation.json`
