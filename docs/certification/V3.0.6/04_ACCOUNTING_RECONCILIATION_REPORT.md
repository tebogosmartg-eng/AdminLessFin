# Accounting Reconciliation Report — V3.0.6

Source run: `b0d74849-106b-4e58-9e0e-05bcbd24489a`

## Observed Payroll Values
- Gross earnings: 10,000
- Employee deductions: 100
- Net pay: 9,900
- Employer contributions: 200
- Payroll cost: 10,200

## Reconciliation Schedules

### Employee Net Pay
`Gross - Employee Deductions = Net`
`10,000 - 100 = 9,900` ?

### Cost to Company
`Gross + Employer Contributions = Payroll Cost`
`10,000 + 200 = 10,200` ?

### Journal Balance
Journal `78d1966f-8557-4fef-ba05-aba19982142a`
- Debits:
  - Wages and Salaries: 10,000
  - Wages and Salaries (employer contrib): 200
  - Total debits: 10,200
- Credits:
  - Bank: 9,900
  - AP (employee deductions): 100
  - AP (employer statutory): 200
  - Total credits: 10,200

`Debits = Credits = 10,200` ?

## Cross-Component Consistency
- Statutory snapshot has employer contribution totals.
- Payroll summary now reports employer contributions = 200.
- Journal now posts employer contribution entries.
- Register/reporting path reflects payroll cost = 10,200.

Status: **VERIFIED FIXED** (blocker 3)
