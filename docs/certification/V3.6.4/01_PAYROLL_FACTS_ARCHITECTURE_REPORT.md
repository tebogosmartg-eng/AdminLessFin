# 01 — Payroll Facts Architecture Report

**Version:** 3.6.4  
**Board:** Independent Principal Enterprise ERP Architecture

## 1. Principle

Payroll Engine produces facts. Everything else consumes facts. Never consume payslips for reporting. Never recalculate payroll. Never duplicate calculations.

## 2. Domain layout

```
src/reporting/
  facts/
    PayrollFact.ts
    PayrollFactSource.ts
    PayrollFactRepository.ts
    PayrollFactMapper.ts
    PayrollFactValidator.ts
    PayrollItemRegistry.ts
    adapters.ts
  engine/
    matrixEngine.ts          (MatrixEngine)
    PivotEngine.ts
    aggregationEngine.ts     (AggregationEngine)
    DimensionEngine.ts
    MeasureEngine.ts
  operational/               PayrollRegister, PayslipRegister, EmployeeCost
  management/                PayrollMatrix, Monthly/Dept/CC/Variance Analysis
  audit/                     VIP, PayrollWorkingPaper, PayrollReconciliation
  statutory/                 EMP201, EMP501, IRP5 adapters
  exporters/                 csv, excel, pdf facades
```

## 3. Single load path

`loadPayrollFacts(query)` → finalized edge reads → map → freeze → validate → consumers.

UI consumers:

| Surface | Loader |
|---------|--------|
| Payroll Reports | `loadPayrollFacts` → operational/management adapters |
| Audit & Compliance (VIP) | `loadPayrollFacts` via `loadVipFinalizedFacts` |
| Statutory Returns | `loadFinalizedPayrollSources` → facts → statutory adapter |

## 4. Verdict

**CERTIFIED** — Enterprise facts architecture implemented without modifying locked engines.
