# 01 — VIP Discovery Report

**Version:** 3.6.7  
**Method:** Repository search + file read. No assumptions.

## Inventory

| Kind | Location | Status |
|------|----------|--------|
| Page / Component | `src/pages/AuditComplianceReports.tsx` | Present; default export `AuditComplianceReports` |
| Route | `src/router.tsx` L32 import, L130 `<Route path="/audit-compliance-reports" …>` | Registered under `AdminRoute` |
| Builder | `src/reporting/audit/VIP/builder.ts` → `buildVipWorkingPaperFromFacts` | Present |
| Renderer helpers | `src/reporting/audit/VIP/renderer.ts` | Present |
| Validation | `src/reporting/audit/VIP/validation.ts` | Present |
| Branding | `src/reporting/audit/VIP/branding.ts` | Present |
| Export PDF | `src/reporting/audit/VIP/export/pdf.ts` | Present |
| Export Excel | `src/reporting/audit/VIP/export/excel.ts` | Present |
| Export CSV | `src/reporting/audit/VIP/export/csv.ts` | Present |
| Export facade | `src/reporting/audit/VIP/export/index.ts` → `exportVipWorkingPaperAsync` | Present |
| Facade | `src/lib/vipReport.ts` | Present |
| Facts loader | `src/lib/vipReportSources.ts` | Present |
| Registry | `src/reporting/reports/compliance/index.ts` → `VIP_REPORT_ID = 'payroll.compliance.vip'` | Present |
| Nav label | `src/components/SidebarNav.tsx` L125 | `Audit & Compliance Reports` |
| Alias | `src/reporting/audit/PayrollWorkingPaper/index.ts` | Re-exports VIP |

## Strings confirmed in UI page

- Document title / H1: `Enterprise VIP Payroll Working Paper` (`AuditComplianceReports.tsx` L42, L108)
- Card: `Audit Working Paper` (L198)

## Verdict

VIP implementation **exists** across page, route, builder, renderer, validation, branding, and VIP-owned exports.
