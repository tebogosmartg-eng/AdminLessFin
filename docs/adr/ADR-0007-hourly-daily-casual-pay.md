# ADR-0007 — Hourly, Daily-Paid and Casual Workers, Overtime and Time Data

| Field | Value |
|---|---|
| Status | **Proposed** (built as Phase 4 of the payroll plan; owner to accept) |
| Date | 2026-10-10 |
| Related | [ADR-0006 — Leave](ADR-0006-payroll-leave-management.md), [ADR-0005 — SARS filing](ADR-0005-sars-payroll-filing-exports.md) |
| Law | BCEA ss 9, 10, 16, 18, 35; National Minimum Wage Act; UI Act s3 / UIC Act s4; Fourth Schedule and SARS Guide for Employers iro Employees' Tax (2027) |

---

## Context

Payroll paid only salaries. Hourly, daily-paid and casual workers, overtime and the approved hours in Work Management could not be paid. We compared how SA payroll products model these workers: SimplePay, PaySpace, Sage 300 People, SAP SuccessFactors ECP and Oracle HCM.
- **Pay basis:** all of them make it an employee attribute (salaried, hourly or daily).
- **Pay frequency:** none runs a daily frequency. SARS publishes only weekly, fortnightly, monthly and annual tax tables.
- **Time:** daily-paid and casual staff sit on weekly runs, with hours or days captured per period.
- **Premiums:** each is a separate earning line.

## Decision

1. **Pay basis on the employee.**
   - `pay_basis` is salaried, hourly or daily. Hourly and daily employees have a `pay_rate` per hour or per day.
   - `salary_period` stays the pay frequency. There is no daily frequency: daily-paid workers go on weekly or fortnightly runs.
   - "Casual" is the employment type. It sets neither the pay nor the tax by itself.
2. **A timesheet per run** (`payroll_timesheets`):
   - It holds ordinary hours (hourly) or days (daily), overtime hours, Sunday hours, public holiday hours worked, and public holidays paid but not worked. Public holidays falling on working days are suggested.
   - Hours can be typed in, or imported from approved and locked Work Management entries (`ewm_payroll_input_facts`).
   - Imported hours are consumed by the run that finalises them, so they are paid once, and released if the run is reversed or reopened.
   - Timesheets can be changed only on draft runs, and only the payroll function writes them.
3. **Pay, under BCEA s35, for an hourly wage *h*:**
   - **Salaried:** *h* = the weekly wage ÷ ordinary weekly hours (45 when not captured); monthly pay = 4⅓ × weekly.
   - **Day length:** the weekly hours ÷ working days, at most 9 hours (7.5 hours on a 6-day week).
   - **Ordinary time:** hourly workers are paid hours × rate; daily workers are paid days × rate.
   - **Overtime:** *h* × 1.5, under IRP5 code 3607.
   - **Sunday work:** *h* × 2, or × 1.5 for an employee who ordinarily works Sundays.
   - **Public holiday worked:** *h* × 2.
   - **Public holiday not worked:** the daily wage, for hourly and daily-paid workers. A salary already covers it.
   - Salaried employees get only the premiums.
   - All of these are remuneration: they attract PAYE, UIF and SDL, and are taxed with the period's pay.
4. **Checks**, shown as run warnings, not blocks:
   - overtime over 10 hours a week (s10);
   - ordinary hours over 45 a week (s9);
   - an hourly wage below the National Minimum Wage (R30.23 from 1 March 2026);
   - no rate, or no hours, for an hourly or daily-paid employee.
5. **UIF:** none for an employee working fewer than 24 hours in the calendar month.
   - **Hourly and daily-paid:** the hours on this and earlier finalised payslips in the month count.
   - **Salaried:** the weekly hours × 52 ÷ 12 count.
6. **Employees' tax:** `tax_method` is either `tables` (standard employment) or `non_standard`.
   - Non-standard employment is a flat 25% of remuneration, with no rebates or medical credits, as in the SARS Guide for Employers.
   - A director's PAYE mode still wins.
   - The deemed-standard declaration date is recorded for casuals. The tax method stays a choice the user makes; the system does not set it automatically.
7. **Security:** `ewm_payroll_input_facts` was writable by any company member through the API. Because payroll now pays those hours, only the work function may write them.

## Not in scope (known simplifications)

- **Per-day rules:**
  - the Sunday floor of a full ordinary day (s16(2));
  - the 4-hour minimum shift pay (s9A);
  - the 12-hour day;
  - the public-holiday "greater of" rule for a short shift (2× is used).
  These need per-day time entries, not period totals.
- **13-week average pay for leave and public holidays** when pay fluctuates (s35(4)).
- **Night work allowance (s17):** the Act sets no rate. It can be paid as an allowance run input.
- **Overtime limits above the BCEA earnings threshold** (R269,600.90 from 1 May 2026): the s9–s18 protections fall away above it, but the warnings are still shown.
- **UIF across a month's weekly runs:** earlier weeks are not recalculated when a later week takes the month past 24 hours.
- **BCEA leave for employees under 24 hours a month** (s6): leave still accrues for them.
- **Tax directives** (Phase 6) and piecework.
