# 04 — Matrix Reporting Engine Report

**Version:** 3.6.4

## 1. Engines

| Engine | File | Role |
|--------|------|------|
| Matrix | `engine/matrixEngine.ts` | Measures × columns aggregation |
| Pivot | `engine/PivotEngine.ts` | Arbitrary row/column pivots over facts |
| Aggregation | `engine/aggregationEngine.ts` | sum/count/avg/min/max |
| Dimension | `engine/DimensionEngine.ts` | month/quarter/year/dept/CC/branch/group/company/employee/item |
| Measure | `engine/MeasureEngine.ts` | amount/count/average (+ YTD/MTD kinds) |

## 2. Report-as-configuration

`buildPayrollFactPivot(facts, { rowDimension, columnDimension, itemCodes, measure })` — VIP and management matrices are configurations over facts, not bespoke calculators.

## 3. Isolation

Payroll Matrix public API in `payrollMatrixEngine.ts` remains locked; platform matrix engine is shared.

## 4. Verdict

**CERTIFIED** — Reusable enterprise matrix/pivot stack over Payroll Facts.
