# 02 — Branding Framework Report

**Version:** 3.6.5  
**Module:** `src/reporting/export/branding.ts`  
**Product:** AdminLess Fin

## 1. Principle

The **export framework owns branding**. Individual reports supply data + metadata only. Reports must not duplicate logo/header/footer/page-number logic.

## 2. Contract

`ReportExportBranding`:

| Field | Purpose |
|-------|---------|
| `product` | Defaults to `BRAND.product` (`AdminLess Fin`) |
| `companyName` | Tenant company |
| `companyLogoUrl` | Optional company logo (PDF best-effort embed) |
| `reportTitle` | Report title |
| `financialYear` | FY label |
| `period` | Period string |
| `generatedBy` | User display name / email |
| `generatedAt` | ISO timestamp (default now) |
| `reportId` | Stable export id via `buildReportId` |
| `footer` | Defaults to `AdminLess Fin — System Generated Report` |

## 3. Ownership map

| Concern | Owner |
|---------|--------|
| Product name / default footer | Export branding + `src/config/brand.ts` |
| PDF header / footer / page numbers | `src/reporting/export/pdf` |
| Excel heading / freeze / print | `src/reporting/export/excel` |
| CSV metadata preamble | `src/reporting/export/csv` |
| Report-specific data / sections | Report modules (e.g. VIP) |

## 4. Enforcement

Browser exports through `exportReportRows` / `exportPayrollReportRows` **require** branding for CSV, Excel, and PDF. Unit/Node payload checks may omit branding only when not running in a document context.

## 5. Verdict

**CERTIFIED** — AdminLess Fin branding is centralized in the export framework.
