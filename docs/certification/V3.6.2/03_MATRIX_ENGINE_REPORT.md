# 03 — Matrix Engine Report

**Version:** 3.6.2  
**Module:** `src/lib/payrollMatrixEngine.ts`

## 1. Responsibilities

| Function | Purpose |
|----------|---------|
| `extractMetricsFromFact` | Map finalized line items → metric bag (keyword classify only) |
| `buildPayrollMatrix` | Aggregate metrics × dimension columns + optional Total |
| `aggregateMetricByDimension` | Single-metric pivot helper |
| `buildMatrixVariance` | MoM variance from an existing matrix |
| `saFinancialYearMonthColumns` | March–February column set for a tax year |
| `matrixToRowObjects` | Export-ready row projection |

## 2. Reusability

Any consumer can render payroll metrics by:

```ts
buildPayrollMatrix(facts, { dimension: 'month' | 'department' | 'cost_centre' | 'company' | 'employee_group' })
```

Management reports, analyses, and future ERP dashboards share this engine.

## 3. Metric catalogue

Basic Salary · Overtime · Bonus · Other Earnings · Gross Pay · PAYE · UIF Employee · UIF Employer · SDL · Pension · Medical Aid · Other Deductions · Employer Contributions · Net Pay · Cost to Company

Employer Contributions prefer `calculation_snapshot.total_employer_contributions` when present (same canonical source as operational register).

## 4. Isolation guarantee

The engine imports **no** statutory payroll engine modules and performs **no** tax bracket / UIF rate / SDL rate math.

## 5. Verdict

**CERTIFIED** — Reusable matrix engine suitable for enterprise management reporting.
