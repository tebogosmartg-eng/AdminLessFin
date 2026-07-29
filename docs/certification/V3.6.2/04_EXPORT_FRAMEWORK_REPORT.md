# 04 — Export Framework Report

**Version:** 3.6.2  
**Module:** `src/lib/payrollReportExport.ts`

## 1. Supported formats

| Format | Mechanism | Extension |
|--------|-----------|-----------|
| CSV | Papa Parse via `downloadCSV` | `.csv` |
| Excel | SpreadsheetML (Excel-native XML workbook) | `.xls` |
| PDF | jsPDF + autotable | `.pdf` |

Operational CSV downloads continue to use the existing `downloadReportCsv` path when the user selects CSV on operational tabs — preserving prior behaviour.

## 2. Isolation

- Export serializes already-built report row objects only
- No payroll recalculation
- Separate from statutory returns export (`src/statutory/returns/exportFramework.ts`)

## 3. Artifact metadata

```ts
PayrollExportArtifact {
  format, fileName, contentType, rowCount, exportedAt
}
```

## 4. UI

`/payroll-reports` exposes format select: CSV · Excel · PDF for all categories.

## 5. Verdict

**CERTIFIED** — CSV / Excel / PDF export framework for payroll reporting.
