# 01 — Enterprise VIP Architecture Report

**Version:** 3.6.6  
**Product:** AdminLess Fin

## Module layout

```
src/reporting/audit/VIP/   (logical: audit/vip)
  types.ts
  sections.ts
  layout.ts
  validation.ts
  branding.ts
  builder.ts
  renderer.ts
  export/
    pdf.ts
    excel.ts
    csv.ts
    index.ts
  index.ts
```

## Independence

- VIP owns its builder, renderer, validation, branding, and export pipeline.
- Does **not** use Management Matrix renderer (`payrollMatrixEngine` / management pivot).
- Does **not** require operational `exportPayrollReportRows` for VIP downloads.
- Operational `/payroll-reports` continues to use the platform export framework.

## Data flow

```
Finalized Payroll Runs
  → Finalized Snapshots
  → Payroll Facts (immutable)
  → buildVipWorkingPaperFromFacts
  → UI / VIP PDF / VIP Excel / VIP CSV
```

No PAYE / UIF / SDL / Net / CTC derivation in VIP — amounts measured from facts via registry measures and snapshot totals.

## Verdict

**CERTIFIED** — Dedicated audit VIP architecture independent of Management Reporting.
