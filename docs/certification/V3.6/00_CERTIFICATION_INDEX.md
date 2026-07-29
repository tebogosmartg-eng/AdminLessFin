# AdminLess Fin V3.6 — Statutory Returns Architecture

| # | Report |
|---|--------|
| 01 | [Statutory Returns Architecture Report](./01_STATUTORY_RETURNS_ARCHITECTURE_REPORT.md) |
| 02 | [EMP201 Architecture Report](./02_EMP201_ARCHITECTURE_REPORT.md) |
| 03 | [EMP501 Architecture Report](./03_EMP501_ARCHITECTURE_REPORT.md) |
| 04 | [IRP5 Architecture Report](./04_IRP5_ARCHITECTURE_REPORT.md) |
| 05 | [Validation Framework Report](./05_VALIDATION_FRAMEWORK_REPORT.md) |
| 06 | [Production Readiness Report](./06_PRODUCTION_READINESS_REPORT.md) |

**Mission:** Separate internal payroll reporting from statutory government declarations.

**Locked (unchanged):** Payroll Engine · Payroll Reports · Legislation Repository · Accounting · Journals

**Verdict:** Statutory Returns module introduced as a consumer of finalized payroll only. Architecture supports additional countries and return types without engine, reports, accounting, or legislation changes.
