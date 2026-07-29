# 04 — Export Wiring Report

**Version:** 3.6.7

## A. VIP page Download path (connected)

```
AuditComplianceReports.tsx
  Button onClick → handleDownload (L78–98)
    → createVipExportBranding (...)           // VIP branding.ts
    → exportVipWorkingPaperAsync(report, {    // VIP export/index.ts
         format: exportFormat,                // 'pdf' | 'excel' | 'csv'
         fileBaseName: AdminLess-Fin-VIP-Working-Paper-…
         branding
       })
      → exportVipPdfAsync | exportVipExcel | exportVipCsv
      → Generated document download
```

**Not** `exportPayrollReportRows`. **Not** management/operational exporters.

## B. Payroll Reports Download path (does not call VIP)

```
PayrollReports.tsx
  Button onClick → handleDownload (L107+)
    category === 'operational' → downloadReportCsv / exportPayrollReportRows
    category === 'management'  → exportPayrollReportRows (management rows)
    category === 'statutory'   → exportPayrollReportRows (statutory rows)
```

No branch invokes `exportVipWorkingPaper` / `exportVipWorkingPaperAsync`.

## C. VIP pipeline on dedicated page

```
UI (AuditComplianceReports)
  → loadVipFinalizedFacts (vipReportSources)
  → buildVipWorkingPaperFromFacts (builder)
  → validateVipWorkingPaper (validation)
  → renderVipIdentityRows + section tables (renderer helpers + JSX)
  → exportVipWorkingPaperAsync (VIP export)
  → Generated Document
```

**Pipeline status on `/audit-compliance-reports`:** **Connected**

**Pipeline status on `/payroll-reports`:** **Not applicable** (VIP not mounted there)

## Verdict

VIP export wiring is **complete on the VIP page**. Payroll Reports Download is a separate, non-VIP path.
