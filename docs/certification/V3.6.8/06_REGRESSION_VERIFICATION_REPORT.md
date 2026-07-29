# 06 — Regression Verification Report

**Version:** 3.6.8

## Locked domains

| Domain | Status |
|--------|--------|
| Payroll Engine | Unchanged |
| Payroll Register | Unchanged |
| Payroll Reports page / categories | Unchanged |
| Management Reports | Unchanged |
| Statutory Returns | Unchanged |
| Accounting / Legislation | Unchanged |
| VIP architecture (builder/export) | Unchanged |

## Tests

```bash
npx vitest run tests/unit/vip-report.test.ts \
  tests/unit/reporting-platform.test.ts \
  tests/unit/payroll-matrix-reporting.test.ts
```

**Result:** 24 passed / 0 failed (`evidence/quality-gates.json`).

## Verdict

**PASS**
