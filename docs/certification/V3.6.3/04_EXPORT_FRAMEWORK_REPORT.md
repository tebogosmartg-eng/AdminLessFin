# 04 — Export Framework Report

**Version:** 3.6.3  
**Module:** `src/reporting/export/`

## 1. Formats

| Path | Format |
|------|--------|
| `export/csv` | CSV (Papa Parse) |
| `export/excel` | SpreadsheetML `.xls` |
| `export/pdf` | jsPDF + autotable |
| `export/json` | JSON artifact |

Facade: `exportReportRows` → `ExportArtifact`.

## 2. Payroll compatibility

`src/lib/payrollReportExport.ts` remains the payroll public export API and delegates to the platform facade. Operational CSV via `downloadReportCsv` is unchanged.

Statutory returns export (`src/statutory/returns/exportFramework.ts`) remains separate and locked.

## 3. Verdict

**CERTIFIED** — Shared export framework with payroll export surface preserved.
