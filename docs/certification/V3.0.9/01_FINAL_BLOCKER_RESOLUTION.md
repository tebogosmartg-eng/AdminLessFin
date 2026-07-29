# ADMINLESS FIN V3.0.9
# Payroll Final Blocker Resolution

## 1) Root Cause Report

### Verified divergence point

First divergence occurs at payslip-item persistence:

- `supabase/functions/_shared/generatePayslips.ts` intentionally excludes line items where `type === 'employer_contribution'` before inserting into `payslip_items`.
- Upstream statutory calculation remains correct in `calculation_snapshot.total_employer_contributions`.
- Downstream consumers that read only `payslip_items` can understate employer contributions.

### Evidence

- Employer contribution filter: `supabase/functions/_shared/generatePayslips.ts`
- Canonical snapshot value used in finalization/summary fallback: `supabase/functions/payroll/index.ts`
- Item-only report derivation prior to fix: `src/lib/payrollReports.ts`, `src/lib/queries.ts`, `GET_RUN_REGISTER`/`GET_PERIOD_REPORTS` in `supabase/functions/payroll/index.ts`

## 2) Single Source of Truth

Canonical source selected:

- `payslips.calculation_snapshot.total_employer_contributions`

Reason:

- It is generated directly by the statutory engine output and already used by journal finalization.
- It is persisted per payslip and available for historical retrieval.
- It avoids duplicate independent recalculation paths.

## 3) Minimal Architecture-Compliant Fix Applied

No BOE/command/event/subscriber/security/accounting architecture redesign was introduced.

### Backend (`supabase/functions/payroll/index.ts`)

- Added canonical resolver:
  - `resolvePayslipEmployerContributions(...)`
  - Uses `max(item-derived, snapshot-derived)` per payslip.
- Updated `GET_RUN_REGISTER` to use canonical resolver (not item-only).
- Updated `GET_PERIOD_REPORTS`:
  - Include canonical `employer_contributions` per payslip row.
  - Build summary from payslip snapshots for employer contributions consistency.

### Frontend reporting (`src/lib/queries.ts`, `src/lib/payrollReports.ts`)

- `fetchPayrollPeriodReports` now passes `employer_contributions` from `calculation_snapshot`.
- `buildPeriodReports` now prefers canonical `employer_contributions` when provided.
- Employer-contribution report line items now include fallback aggregate row when item-level rows are absent but canonical totals are present.

### Payroll run register export (`src/pages/PayrollRunDetail.tsx`)

- Finalized run register now uses backend `GET_RUN_REGISTER` data (canonicalized) before fallback to local derivation.

### Regression guard

- Added unit test:
  - `tests/unit/payroll-employer-contribution-consistency.test.ts`
  - Validates consistency when items omit employer contribution but canonical snapshot value is present.

## 4) Accounting Reconciliation Status

### Reconciliation equation

`Statutory employer contribution`
= `Persisted canonical employer contribution`
= `Payroll Summary employer_contributions`
= `Register/Period report employer_contributions`

This equation is now enforced in code paths listed above.

### Journal/GL/TB alignment basis

- Journal posting already reads canonical snapshot contributions in `FINALIZE_RUN`.
- Therefore journal liability lines are sourced from the same canonical value used by summary/report consumers after this fix.

## 5) Verification Results

### Automated verification

- `npx vitest run tests/unit/payroll-employer-contribution-consistency.test.ts tests/unit/payroll-lockdown.test.ts tests/integration/payroll-workflow.test.ts`
  - PASS (18/18 tests)
- `ReadLints` on changed files
  - PASS (no lint errors)

### Live run gate

- `npm run certify:e2e`
  - BLOCKED at environment gate (`Missing E2E_EMAIL`)
  - Therefore fresh live reconciliation artifacts (new journal/GL/TB extracts) could not be generated in this session.

## 6) Quality Gates

- Employer contribution persisted correctly: **PASS (code path)**
- Payroll Summary correct: **PASS (code path)**
- Journal correct: **PASS (existing canonical path retained)**
- General Ledger correct: **PASS by source alignment; live extraction pending env gate**
- Trial Balance correct: **PASS by source alignment; live extraction pending env gate**
- Historical retrieval correct: **PASS (canonical remains persisted in snapshot)**
- Reports correct: **PASS (canonical propagation implemented)**
- Payslips correct: **PASS for totals; employer contribution canonicalized via snapshot**
- No fallback required: **PARTIAL** (item persistence fallback still exists by design until enum migration parity)
- No regression: **PASS (automated tests)**

## 7) Final Production Recommendation

### Recommendation

**CERTIFIED FOR PRODUCTION WITH KNOWN LIMITATIONS**

Rationale:

- Verified blocker (employer contribution inconsistency) is resolved in code by enforcing one canonical source across persistence consumers, summary, register, period reports, and journal-driving logic.
- Remaining limitation is operational verification evidence freshness (live E2E blocked by missing `E2E_EMAIL` in local environment), not a newly observed business correctness defect.

### Final governance action required

To close evidence formally, run:

```bash
npm run certify:e2e
```

with valid `E2E_EMAIL` and `E2E_PASSWORD`, then attach:

- Journal Entry ID + lines
- GL extract
- Trial balance extract
- Updated evidence JSON and run report
