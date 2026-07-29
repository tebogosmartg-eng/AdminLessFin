# ADMINLESS FIN
# PAYROLL RELEASE MANIFEST
# VERSION 3.3

## Release Identity

- Product: Payroll Module
- Release train: Enterprise Posting Engine integration + baseline freeze
- Version: 3.3
- Release date: 2026-07-22
- Baseline status: Frozen

## Modules Included

- Payroll workflow and run orchestration
- Statutory payroll engine
- Payroll rules engine integration
- Payslip generation (HTML/PDF)
- Payroll register, summary, and reports
- Enterprise Posting Engine journal posting (module=`payroll`)
- Payroll reversal / reopen / adjustment posting
- Bank file generation
- Historical payroll retrieval
- Payroll dashboard and run visibility surfaces
- BOE integration touchpoints used by payroll lifecycle

## Database Migrations (Baseline Set)

- `supabase/migrations/20260702142900_payroll_output_engine.sql`
- `supabase/migrations/20260702170000_payroll_rules_engine.sql`
- `supabase/migrations/20260705180000_statutory_payroll_engine.sql`
- `supabase/migrations/20260722350000_erp_v30d_payroll_module_whitelist.sql`
- `supabase/migrations/20260722360000_erp_v30d_payroll_posting_engine_integration.sql`

## Edge Functions (Baseline Set)

- `supabase/functions/payroll/index.ts`
- `supabase/functions/_shared/generatePayslips.ts`
- `supabase/functions/_shared/statutoryPayrollEngine/*`
- `supabase/functions/_shared/payrollRulesEngine/*`

## Supported Features (Baseline)

- Run creation, processing, approval, and finalization
- Rule-versioned statutory calculations
- Snapshot-based payroll output consistency across all surfaces
- Payslip output with tax year and rule version metadata
- Register and summary output consistency
- Employer contribution roll-up in payroll cost
- Posting Engine journal posting with balancing, dimensions, and idempotency
- Payroll reversal / reopen / adjustment via Posting Engine
- Bank batch generation from finalized net pay
- Historical payroll continuity

## Known Limitations

- Optional earnings/deduction subtypes render only when active in configured rules for the run.
- Screenshots are not produced by the automated certification CLI; evidence is machine-verifiable JSON.
- Granular PAYE/UIF/SDL control-account split posts only when `payroll_account_mappings` roles are configured; otherwise consolidated liability bucket is used (locked V3.2 model).

## Outstanding Technical Debt (Accepted at Baseline)

- Evidence artifact generation is primarily CLI/JSON and not screenshot-native.
- Additional non-critical payroll line-type coverage depends on future rule activation profiles.
- Leave / bonus / commission provision accrual events are mapping-ready but not auto-accrued outside finalize (Phase 3E candidate).

## Baseline Evidence References

- `docs/certification/V3.3/evidence/phase3d-posting-engine-live.json`
- `docs/certification/V3.1/05_E2E_EVIDENCE_PACK.md`
- `docs/certification/V3.1/04_OUTPUT_CONSISTENCY_REPORT.md`
- `docs/certification/V3.1/06_PRODUCTION_READINESS_REPORT.md`
