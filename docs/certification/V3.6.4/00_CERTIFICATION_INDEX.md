# AdminLess Fin V3.6.4 — Enterprise Payroll Facts Architecture

| # | Report |
|---|--------|
| 01 | [Payroll Facts Architecture Report](./01_PAYROLL_FACTS_ARCHITECTURE_REPORT.md) |
| 02 | [Payroll Fact Model Report](./02_PAYROLL_FACT_MODEL_REPORT.md) |
| 03 | [Payroll Item Registry Report](./03_PAYROLL_ITEM_REGISTRY_REPORT.md) |
| 04 | [Matrix Reporting Engine Report](./04_MATRIX_REPORTING_ENGINE_REPORT.md) |
| 05 | [VIP Report Architecture Report](./05_VIP_REPORT_ARCHITECTURE_REPORT.md) |
| 06 | [Reporting Independence Report](./06_REPORTING_INDEPENDENCE_REPORT.md) |
| 07 | [Regression Verification Report](./07_REGRESSION_VERIFICATION_REPORT.md) |
| 08 | [Production Readiness Report](./08_PRODUCTION_READINESS_REPORT.md) |

**Mission:** Elevate Payroll Reporting to enterprise ERP architecture. Payroll Engine produces facts; everything else consumes immutable Payroll Facts only. Payslips are presentation documents — never reporting, statutory, or accounting sources.

**Architecture:**

```
Payroll Engine → Finalized Snapshot → Payroll Facts
  → Operational Reports
  → Management Reports
  → Audit Reports (VIP)
  → Statutory Returns
  → Accounting Reconciliation (unchanged consumers of finalized payroll)
  → BI / Analytics
```

**Locked (unchanged):** Payroll Engine · Payroll calculations · Payroll Register behaviour/layout · Accounting · Journals · Statutory return generators (logic) · Legislation Repository

**Verdict:** Payroll Facts are the single reporting source of truth. VIP and all downstream report UIs load via `loadPayrollFacts`.
