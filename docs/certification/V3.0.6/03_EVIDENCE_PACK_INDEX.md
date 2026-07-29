# Evidence Pack Index — V3.0.6

## Primary Runtime Evidence
- `docs/certification/V3.0.4/evidence/live-e2e-evidence.json`
  - Run timestamp: 2026-07-07T07:47:13.143Z
  - Decision: CERTIFIED FOR PRODUCTION (test-run result)
  - Run ID: `b0d74849-106b-4e58-9e0e-05bcbd24489a`

## Migration Evidence
- `supabase/migrations/20260707120000_payslip_item_employer_contribution.sql`

## Migration Failure Evidence
- `terminals/303787.txt`
  - db push failed to connect to pooler
  - CLI guidance references `SUPABASE_DB_PASSWORD`

## Code Fix Evidence
- `supabase/functions/payroll/index.ts`
  - snapshot employer contribution aggregation
  - finalize journal employer contribution entries

## Payslip Evidence Additions
- `tests/e2e/run-payroll-live-certification.ts`
  - phase 6 now calls `GET_PAYSLIP_DETAIL`
  - captures htmlGenerated/pdfGenerated and detailed payslip field evidence

## Performance Evidence
- `live-e2e-evidence.json` top-level `timings` object:
  - generatePayslipsMs: 782
  - approveRunMs: 590
  - finalizeRunMs: 830
  - generateBankBatchMs: 531
  - workspaceSummaryMs: 567
