# 03 — Generic Matrix Engine Report

**Version:** 3.6.3  
**Module:** `src/reporting/engine/matrixEngine.ts`

## 1. Capabilities

`buildMatrix({ data, measures, columns, filters, includeTotalColumn, … })` accepts:

- **Rows (measures):** id, label, value extractor, aggregation (`sum`/`count`/`avg`/`min`/`max`)
- **Columns:** key resolver + optional fixed order
- **Filters:** predicates via `filterEngine`
- **Grouping:** via `groupingEngine`
- **Aggregation:** via `aggregationEngine`

Supporting:

- `matrixToRows`
- `buildColumnVariance` (sequence variance from cells only)

## 2. Payroll adapter

`src/lib/payrollMatrixEngine.ts` retains the V3.6.2 public API and delegates aggregation to `buildMatrix`. Outputs for Payroll Matrix / variance remain stable (covered by existing + platform tests).

## 3. Cross-module reuse

Any module can supply arbitrary fact records:

```ts
buildMatrix({
  data: facts,
  measures: [{ id: 'revenue', label: 'Revenue', value: r => r.revenue }],
  columns: { key: r => r.region },
});
```

## 4. Verdict

**CERTIFIED** — Matrix engine is domain-agnostic and reusable across modules.
