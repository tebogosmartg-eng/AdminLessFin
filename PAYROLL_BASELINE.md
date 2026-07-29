# ADMINLESS FIN
# PAYROLL BASELINE
# VERSION 3.3

## Baseline Purpose

This document establishes the permanent Payroll Release Candidate baseline.
The module is frozen at this architecture and behavior profile.
No functionality redesign or enhancement is permitted under baseline freeze.

## Baseline Effective Date

- Release status date: 2026-07-22
- Baseline evidence set: `docs/certification/V3.3/*`
- Certified reference: Phase 3D Posting Engine live certification (`docs/certification/V3.3/evidence/phase3d-posting-engine-live.json`)
- Prior certified reference run: `e2627366-641b-4635-8191-61f4b344cf57` (V3.1/V3.2 continuity)

## Frozen Architecture Scope

The following components are locked for maintenance-mode operation:

- Workflow
  - Payroll run lifecycle: create -> process -> approve -> finalize -> bank batch.
- BOE integration
  - Existing BOE orchestration and lifecycle interaction points are frozen.
- Commands
  - Payroll command handlers in `supabase/functions/payroll/index.ts` are baseline locked.
- Events
  - Existing payroll event emission and audit event sequence are frozen.
- Subscribers
  - Existing subscriber contracts and subscribers remain fixed.
- Statutory Engine
  - Statutory payroll engine calculation pipeline and versioned rule registry are frozen.
- Employee Number Engine
  - Employee identity and employee-number continuity behavior are frozen.
- Journal integration (V3.3)
  - Payroll NEVER writes `journal_entries` / `journal_entry_items` directly.
  - All accounting events flow: Payroll → `finalize_payroll_run_atomic` / adjustment RPCs → Enterprise Posting Engine → Journal Engine → GL.
  - Locked consolidated wages / bank / liability balancing model is preserved.
  - Reversals and reopen use `posting_engine_rollback`.
- Payslip generation
  - HTML/PDF payslip structure and calculation-snapshot sourced values are frozen.
- Bank file generation
  - Bank batch generation flow and net-pay driven output are frozen.

## Canonical Data Baseline

- Canonical payroll output source: `payslips.calculation_snapshot`
- Canonical employer contribution: `calculation_snapshot.total_employer_contributions`
- Canonical identity/version fields:
  - `calculation_snapshot.employee_number`
  - `calculation_snapshot.tax_year`
  - `calculation_snapshot.rule_version`
- Canonical GL traceability:
  - `payroll_runs.posting_request_id`
  - `payroll_runs.journal_entry_id`
  - `posting_requests` module = `payroll`

## Locked Trace Path

Employee -> Rules Engine -> Statutory Engine -> Calculation Snapshot -> Payslip generation -> Payroll register -> Payroll summary -> Payroll reports -> Posting Engine → Journal/GL/TB basis -> Bank file -> Historical retrieval.

## Baseline Integrity Reference

For baseline reconciliation and freeze verification:

- `docs/certification/V3.3/evidence/phase3d-posting-engine-live.json`
- `docs/certification/V3.1/01_PAYROLL_OUTPUT_TRACE_REPORT.md`
- `docs/certification/V3.1/04_OUTPUT_CONSISTENCY_REPORT.md`
- `docs/certification/V3.1/evidence/payroll-output-reconciliation.json`
- `docs/certification/V3.1/06_PRODUCTION_READINESS_REPORT.md`

## Allowed Changes After Freeze

- Bug fixes
- Performance improvements
- Security updates
- Statutory legislative updates

No architectural redesign.
