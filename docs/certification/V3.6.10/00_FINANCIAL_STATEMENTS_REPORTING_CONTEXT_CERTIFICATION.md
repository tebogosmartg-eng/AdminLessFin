# Financial Statements Reporting Context Certification

**Board:** Chief ERP Architect / Principal Financial Reporting Engineer  
**Product:** AdminLess Fin  
**Date:** 2026-07-29  
**Status:** CERTIFIED  
**Prerequisite:** Financial Calendar Architecture (certified)

---

## 1. Root cause

Settings → Financials shows the **live** Enterprise Financial Calendar (`financial_years` via `ReportingPeriodContext`).

The Annual Financial Statements workspace displayed **frozen** `efs_reporting_periods.label` / `end_date` (legacy GRAP-style values such as `Financial Year 2025/26` and `2026-03-31`).

Those snapshots were created before (or outside) calendar binding and were never rewritten when Settings materialised the current year (e.g. 1 Mar 2026 → 28 Feb 2027). Cover titles used `reportingPeriodCoverTitle(end_date)` against that stale end date → `FOR THE YEAR ENDED 31 MARCH 2026`.

**AFS was not reading ReportingPeriodContext for FY identity.**

---

## 2. Legacy Financial Year sources removed / demoted

| Source | Classification | Action |
|--------|----------------|--------|
| `efs_reporting_periods.label` as display SoT | ✗ Legacy | Synced to `financial_years.year_code`; UI never falls back to slash labels |
| Orphan periods (null `financial_year_id`, no date match) | ✗ Legacy | Open workspaces auto-bound to active open FY on dashboard/list load |
| Bound periods with drift | ⚠ Compatibility | `syncReportingPeriodFromFinancialYear` rewrites label/dates from calendar |
| Sealed/published engagements | ✓ Historical | Not auto-rebound; UI badges “Historical engagement” |
| `ReportingPeriodContext` / `financial_years` | ✓ Canonical | Sole FY authority for labels and date bounds |

---

## 3. Files modified

- `src/lib/financialStatements/calendarYearBinding.ts` — resolve/format from calendar
- `src/lib/enterpriseMasterData/calendar.ts` — active year = contains-today / newest open
- `supabase/functions/financial-statements/index.ts` — reconcile on LIST + GET dashboard; sync on create
- `src/lib/financialStatements/api.ts` — period type fields
- `src/lib/financialStatements/document/documentModel.ts`
- `src/lib/financialStatements/publication/canonicalDocumentView.ts`
- `src/lib/financialStatements/corporateInformation/sources.ts`
- `src/pages/financialStatements/FinancialStatementsWorkspaceHome.tsx`
- `src/pages/financialStatements/FinancialStatementsWorkspaceDashboard.tsx`
- `src/pages/financialStatements/experience/EngagementOverview.tsx`
- `src/pages/financialStatements/experience/EngagementDocumentWorkspace.tsx`
- `src/pages/financialStatements/document/DocumentEditor.tsx`
- `src/components/FinancialYearSettings.tsx` — invalidate AFS queries on FY change
- `tests/unit/afs-calendar-year-binding.test.ts`
- `docs/certification/V3.6.10/*`

---

## 4. Components migrated to ReportingPeriodContext / calendar

| Surface | Before | After |
|---------|--------|-------|
| Workspace home FY column | calendar match else **frozen label** | `formatCalendarYearDisplay` / unbound notice |
| Dashboard subtitle | `reportingPeriod.label` | `resolveEngagementReportingPeriod` |
| Overview FY widget | frozen label | calendar yearCode + date range |
| Statements tab caption | frozen label | `fy.displayLabel` |
| Document header | `model.period.label` | calendar resolver |
| Cover / PDF | end_date (stale) | end_date after calendar sync |
| Corporate info reporting period | `m.period.label` | period_key / date range |
| Properties / editor | label | period_key preferred |

---

## 5. Before vs After dependency diagram

**Before**
```
Settings → financial_years → ReportingPeriodContext   (unused by AFS UI)
Engagement → efs_reporting_periods.label/end_date → Dashboard / Cover / PDF
```

**After**
```
Settings → financial_years → ReportingPeriodContext
                │
                ▼
     efs_reporting_periods.financial_year_id  (snapshot kept in sync)
                │
                ▼
   resolveEngagementReportingPeriod / edge reconcile
                │
                ▼
   Home · Dashboard · Overview · Document · Cover · PDF · Publication
```

---

## 6. Build status

- Unit tests: `afs-calendar-year-binding.test.ts` — **5/5 passed**
- `npm run build` (vite) — **succeeded** (2026-07-29)
- Redeploy edge function: `financial-statements` (**required** for auto-reconcile of frozen periods)

---

## 7. Proof — every FS screen consumes canonical calendar

| Screen | Proof |
|--------|-------|
| Engagement list | Resolves via `financialYears` from `useReportingPeriod` |
| Workspace header | `resolveEngagementReportingPeriod` |
| Overview FY widget | same |
| Statements caption | `fy.displayLabel` |
| Document workspace | same + model period_key from synced dashboard |
| Cover / FOR THE YEAR ENDED | `reportingPeriodCoverTitle(calendar end_date)` |
| PDF / publication meta | `canonicalDocumentView` uses period_key + end_date |
| Settings change | Invalidates `financial_years`, `efs_dashboard`, `efs_workspaces`, `efs_doc_model` |

Historical sealed engagements keep their linked FY and show a **Historical engagement** badge when it differs from the active calendar year.

---

## Final Certification

**FINANCIAL STATEMENTS REPORTING CONTEXT CERTIFIED**
