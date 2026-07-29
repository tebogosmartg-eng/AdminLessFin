# 02 — Payroll Fact Model Report

**Version:** 3.6.4

## 1. Canonical model

`PayrollFact` (immutable / `Object.freeze`):

| Field | Role |
|-------|------|
| companyId, payrollRunId, employeeId | Identity keys |
| employeeNumber, employeeName, surname | Employee header |
| department, position, costCentre, employmentStatus | Org dimensions |
| payDate, financialYear, taxYear | Time / FY |
| payrollItems[] | Classified lines (registry codes) |
| totals | gross / deductions / net / employer / CTC |
| metadata | run status, payslipId, tax refs, periods |
| snapshotChecksum | FNV-1a integrity of snapshot payload |
| engineResults[] | Snapshot statutory engine slices (read-only) |

## 2. Immutability

Mapper freezes fact, items, totals, metadata, engineResults. Validator asserts freeze + finalized/paid run status.

## 3. Provenance

Facts are **derived in memory** from finalized `calculation_snapshot` + persisted line items. No duplicated payroll store. No engine recalculation.

## 4. Verdict

**CERTIFIED** — Canonical immutable PayrollFact is the only reporting source model.
