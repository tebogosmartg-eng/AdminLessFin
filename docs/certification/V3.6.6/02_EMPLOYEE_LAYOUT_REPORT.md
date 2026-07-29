# 02 — Employee Layout Report

**Version:** 3.6.6

## Structure (repeats per employee)

1. **EMPLOYEE INFORMATION** — Number, Name, Surname, Department, Position, Cost Centre, Employment Status, Tax Number, Employment Date, Termination Date  
2. **EARNINGS** — Basic, Overtime, Bonus, Commission, Allowances, Fringe Benefits, Other Earnings, Gross Earnings  
3. **DEDUCTIONS** — PAYE, UIF Employee, Medical Aid, Retirement, Other Deductions  
4. **NET PAY**  
5. **EMPLOYER CONTRIBUTIONS** — UIF Employer, SDL, Employer Pension, Employer Medical, Other Employer Contributions  
6. **COST TO COMPANY**

## Columns

March → February (SA FY) + Annual Total. Month orientation unchanged.

## Isolation rule

No employee shares a section with another. Each employee is a separate working-paper section; PDF starts a new page per employee when practical.

## Note on dates

Employment Date / Termination Date are displayed as `—` when not present on immutable Payroll Facts (facts model unchanged). Tax Number uses `metadata.taxReference`.

## Verdict

**CERTIFIED** — Employee-first layout implemented.
