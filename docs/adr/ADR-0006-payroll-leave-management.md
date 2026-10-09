# ADR-0006 — Payroll Leave Management (BCEA)

| Field | Value |
|---|---|
| Status | **Proposed** (built as Phase 3 of the payroll plan; owner to accept) |
| Date | 2026-10-09 |
| Related | [ADR-0002 — Payroll Export Certification](ADR-0002-payroll-export-certification-architecture-freeze.md), [ADR-0005 — SARS Payroll Filing](ADR-0005-sars-payroll-filing-exports.md) |
| Law | Basic Conditions of Employment Act 75 of 1997, sections 20–27, 35 and 40 |

---

## Context

Payroll had no leave. Leave pay on termination existed only as an amount typed into a run (IRP5 3605). Unpaid leave could not reduce pay, and the payslip's leave section was never filled.

## Decision

1. **Balances are worked out, not stored.**
   - A balance is a pure function of the employee record and the leave register, as at any date. The rules live in `src/lib/payrollRulesEngine/leave.ts`, with an identical server copy.
   - **Annual leave:** 3 weeks of working days a year (15 days on a 5-day week), or more by contract. It accrues daily from the start date. Unused leave carries over; forfeiture is recorded, never automatic.
   - **Sick leave:** 6 weeks of working days per 36-month cycle. In the first 6 months the employee earns 1 day per 26 days worked, and those days count against the cycle.
   - **Family responsibility leave:** 3 days a year, for employees with more than 4 months' service who work at least 4 days a week. It does not carry over.
   - **Maternity, parental, unpaid and custom leave:** no balance.
   - **Working days:** weekends and public holidays are not leave days. The employee's working week is used: Monday–Friday, or 6 or 7 days.
2. **The register is evidence.**
   - `employee_leave_entries` holds leave taken, opening balances taken on from a previous system, adjustments and forfeiture (both with a reason), and payouts.
   - An entry is never changed or deleted, only cancelled with a reason; a database trigger enforces this.
   - Only the payroll function writes to the register; owners and admins read it.
3. **Unpaid leave reduces the basic salary.**
   - The pay is cut by the unpaid working days over the working days employed in the period: basic salary × the remaining share.
   - The employment fraction is unchanged, so the pay periods worked on the IRP5 (3210) are unchanged. PAYE remains the year-to-date calculation.
   - Unpaid leave cannot be recorded or cancelled inside a finalised pay period.
4. **Leave paid out on termination.**
   - A run warns when a leaver has annual leave owing (BCEA s40).
   - One action adds leave pay as a run input: the balance at the end date × the BCEA s35 daily rate. The daily rate is the monthly salary ÷ (4.333 × days a week); for weekly pay ÷ days a week, and for fortnightly pay ÷ (2 × days a week).
   - The leave pay is taxed as before (IRP5 3605).
   - Finalising the run records the payout in the register, once per employee and run. Reversing or reopening the run cancels that payout.
5. **Payslip.** Each payslip snapshot keeps the annual, sick and family responsibility balances as at the period end, plus the unpaid days in the period. They are printed on the payslip.

## Not in scope

- **Employee leave requests and approvals.** These come with self-service (Phase 7); entries are recorded by owners and admins as approved.
- **Sick-note rules.** BCEA s23 medical certificates for more than 2 consecutive days are not tracked.
- **Leave provision journals** (IAS 19) are not posted.
- **Hourly accrual** (1 hour for every 17 hours worked) comes with hourly workers (Phase 4).
- **Annual leave forfeiture policies** (e.g. after 6 months) are not applied automatically.

## Consequences

- Changing an employee's start date, working days or contractual leave changes the balance as from the start date, because balances are recomputed. That is intended: the register holds what happened; the rules give the entitlement.
- ADR-0002 is unaffected. Bank rows and payslip serialisers are unchanged apart from the leave balances line on the payslip.
