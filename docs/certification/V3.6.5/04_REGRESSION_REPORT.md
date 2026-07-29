# 04 — Regression Report

**Version:** 3.6.5  
**Product:** AdminLess Fin

## 1. Scope locked

| Domain | Status |
|--------|--------|
| Payroll Engine | Unchanged |
| Payroll Facts model / mapper / validator | Unchanged |
| Payroll Register semantics | Unchanged (asserted) |
| Management Payroll Matrix month contract | Unchanged (asserted) |
| Accounting | Unchanged |
| Statutory Returns | Unchanged |

## 2. Test evidence

Command:

```bash
npx vitest run tests/unit/vip-report.test.ts \
  tests/unit/reporting-platform.test.ts \
  tests/unit/payroll-matrix-reporting.test.ts
```

Result: **26 passed / 0 failed** (see `evidence/quality-gates.json`).

## 3. VIP assertions added

- Employee sections (identity once; items without identity columns)
- Multi-employee section count
- `Payroll Item` label (not Component)
- Annual totals Mar+Apr aggregation
- Branded Excel Working Paper + Detail + FreezePanes + AutoFilter
- Branded CSV preamble with AdminLess Fin + Report ID
- Registry meta `layout: employee-first-working-paper`

## 4. Verdict

**PASS** — Correction introduces no regression to locked payroll domains.
