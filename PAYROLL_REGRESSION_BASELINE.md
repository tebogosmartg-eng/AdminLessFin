# ADMINLESS FIN
# PAYROLL REGRESSION BASELINE
# VERSION 3.3

## Purpose

This document defines mandatory regression scenarios for all future Payroll maintenance releases.
These scenarios are release-gating and cannot be skipped.

## Baseline Scenario Set (Critical)

1. Payroll workflow end-to-end
   - Create run, process, approve, finalize, and generate bank batch.

2. Payslip generation
   - Generate payslip outputs and verify required fields:
     - employee number
     - tax year
     - rule version
     - gross, deductions, net pay, employer contributions, cost to company

3. Journal posting (Posting Engine)
   - Verify payroll finalization creates a `posting_requests` row (module=`payroll`) and balanced journal entries.
   - Verify no direct `journal_entries` inserts from the payroll edge function.
   - Verify approval is required before posting.
   - Verify duplicate finalize is blocked.
   - Verify reversal / reopen via `posting_engine_rollback`.

4. Bank file generation
   - Verify generated bank batch values match finalized net-pay values.

5. Historical retrieval
   - Verify historical records preserve snapshot metadata and financial continuity.

6. Statutory calculations
   - Verify statutory engine outputs for PAYE/UIF/SDL and contribution totals.

7. Accounting reconciliation
   - Verify value consistency across:
     - calculation snapshot
     - payroll register
     - payroll summary
     - posting request / journal
     - GL/TB basis

## Mandatory Commands

- `npm run test`
- `npm run test:integration`
- `npm run certify:statutory`
- `npm run certify:e2e`
- `npx tsx tests/e2e/run-payroll-phase3d-posting-certification.ts`

## Baseline Expected Outcomes

- E2E status: PASS with no FAIL and no NOT_VERIFIED.
- Output consistency: no material variance between snapshot/register/summary/journal/history.
- Journal integrity: balanced true; `posting_requests.module = payroll`.
- Required payroll identity fields remain visible.

## Certified Reference Evidence

- Phase 3D live certification: `docs/certification/V3.3/evidence/phase3d-posting-engine-live.json`
- Certified reference run (V3.1 continuity): `e2627366-641b-4635-8191-61f4b344cf57`
- Evidence:
  - `docs/certification/V3.0.4/evidence/live-e2e-evidence.json`
  - `docs/certification/V3.1/evidence/payroll-output-reconciliation.json`
  - `docs/certification/V3.1/04_OUTPUT_CONSISTENCY_REPORT.md`

## Regression Policy

Any regression in these scenarios is release-blocking for Payroll maintenance releases until resolved.
