# 01 — Payroll Matrix Architecture Report

**Version:** 3.6.2  
**Board:** Independent Principal Enterprise Reporting Architecture

## 1. Objective

Introduce a **Payroll Matrix** report orientation without replacing the employee-centric Payroll Register.

| Axis | Content |
|------|---------|
| Rows | Payroll items (Basic Salary, Overtime, Bonus, PAYE, UIF Employee, UIF Employer, SDL, Pension, Medical Aid, Net Pay, Cost to Company, …) |
| Columns | SA financial year months (March–February) + Total |

## 2. Architectural separation

```
Finalized payroll runs (status ∈ finalized|paid)
        │
        ▼
Finalized payslip facts (headers + payslip_items + calculation_snapshot)
        │
        ├──────────────────────────────┐
        ▼                              ▼
Operational layer                 Management layer
buildPeriodReports()              payrollMatrixEngine +
Payroll Register (LOCKED)         payrollManagementReports
Employee-centric rows             Item × Month / Dept / CC matrix
```

**Invariant:** No payroll calculations occur inside reporting. Keyword classification and aggregation only.

## 3. Data contract

`FinalizedPayrollFact` carries:

- `payDate`, identity, `department`, `costCentre` (employee branch), `employeeGroup` (position), `company`
- Header totals: `grossPay`, `netPay`, `employerContributions` (from snapshot)
- Line items from finalized `payslip_items`

Sources: `fetchPayrollPeriodReports` / `GET_PERIOD_REPORTS` — finalized runs only.

## 4. Non-goals (explicit)

- Does **not** replace Payroll Register
- Does **not** call Statutory Payroll Engine
- Does **not** mutate journals, runs, or snapshots
- Does **not** change EMP201/EMP501/IRP5 modules

## 5. UI surface

`/payroll-reports` → Category **Management** → **Payroll Matrix**

Operational catalogue tabs remain byte-compatible with prior behaviour.

## 6. Verdict

**CERTIFIED** — Payroll Matrix architecture is additive, snapshot-only, and register-preserving.
