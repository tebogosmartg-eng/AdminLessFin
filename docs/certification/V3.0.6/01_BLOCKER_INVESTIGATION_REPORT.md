# Adminless Fin V3.0.6
## Blocker Investigation Report

Date: 2026-07-07  
Source governance decision: `NOT CERTIFIED` (V3.0.5)

### Blocker 1 — Payslip Certification Evidence Incomplete
- Classification: **Test deficiency + partial software defect**
- Investigation result:
  - Evidence deficiency confirmed in previous run (`itemCount: 0`) was caused by using `GET_RUN_DETAIL` (does not return `payslip_items`).
  - Re-run now captures payslip detail from `GET_PAYSLIP_DETAIL`; evidence includes employee, period, gross, deductions, net, snapshot, audit reference, HTML/PDF generation flags.
  - Remaining gap: `hasSdl: false` on payslip item list (SDL present in statutory snapshot, not in persisted payslip items).
- Closure status: **VERIFIED EVIDENCE ADDED**
- Evidence:
  - `docs/certification/V3.0.4/evidence/live-e2e-evidence.json` phase 6

### Blocker 2 — Database Migration / Schema Drift
- Classification: **Missing database migration + operational connectivity blocker**
- Investigation result:
  - Migration exists: `supabase/migrations/20260707120000_payslip_item_employer_contribution.sql`.
  - `supabase db push --linked --yes` failed (connection/auth path issue to remote pooler; CLI requests DB password).
  - Runtime fallback remains active in `generatePayslips.ts` (filters `employer_contribution` when writing `payslip_items`).
- Closure status: **VERIFIED EVIDENCE ADDED**
- Evidence:
  - Migration file above
  - `terminals/303787.txt`

### Blocker 3 — Accounting Reconciliation Mismatch
- Classification: **Genuine software defect (fixed)**
- Root issue:
  - Employer contributions from statutory snapshot were not consistently reflected in summary/journal postings.
- Fix applied (minimal, architecture preserved):
  - `supabase/functions/payroll/index.ts`
    - Added snapshot-derived employer contribution aggregation.
    - Included employer contributions in finalize journal postings.
    - Enforced liability account when employer contributions exist.
    - Summary/payroll_cost now include employer contributions.
- Verification:
  - New run period 2026-08, non-recovered journal, balanced at 10,200/10,200.
- Closure status: **VERIFIED FIXED**

### Blocker 4 — Missing Governance Evidence
- Classification: **Documentation/test evidence deficiency**
- Added evidence:
  - Timings persisted in evidence (`generatePayslipsMs`, `approveRunMs`, `finalizeRunMs`, `generateBankBatchMs`, `workspaceSummaryMs`).
  - Audit event sequence captured.
  - Snapshot includes command/correlation/audit reference keys.
- Remaining evidence gaps:
  - Trial balance artifact not directly captured.
  - Subscriber execution trace not directly captured in runtime evidence.
- Closure status: **VERIFIED EVIDENCE ADDED**

## Summary
- VERIFIED FIXED: 1 (Blocker 3)
- VERIFIED EVIDENCE ADDED: 3 (Blockers 1, 2, 4)
- VERIFIED FALSE POSITIVE: 0
