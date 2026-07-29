# 06 — Root Cause Report

**Version:** 3.6.7

## Observed user problem

On the live **Payroll Reports** screen, only categories **Operational / Management / Statutory** appear. User concludes VIP / Audit & Compliance is missing.

## Root cause (proven)

VIP was integrated as a **separate application surface**, not as a fourth category on `PayrollReports`.

| Expectation | Actual |
|-------------|--------|
| Audit category inside Payroll Reports selector | `ReportCategory` has only 3 values (`payrollManagementReports.ts` L35) |
| Link under Payroll sidebar group | `payrollLinks` omits `/audit-compliance-reports` (`SidebarNav.tsx` L88–95) |
| Visible as “Enterprise VIP Report” on Payroll Reports | VIP title lives on `/audit-compliance-reports` only |

## Where VIP actually is

1. Route `/audit-compliance-reports` (`router.tsx` L130)
2. Sidebar: **Reports → Audit & Compliance Reports** (`SidebarNav.tsx` L125), **admin only**
3. Full VIP pipeline on that page

## Not root causes

| Hypothesis | Evidence against |
|------------|------------------|
| Never implemented | Full `src/reporting/audit/VIP/**` + page exist |
| Dead / disconnected route | Router + AdminRoute + SidebarNav link present |
| Export not wired | `handleDownload` → `exportVipWorkingPaperAsync` |

## Discoverability factors

1. Looking only at `/payroll-reports` category Select  
2. Looking only under **Payroll** nav (no Audit link there)  
3. Non-admin roles never see `adminReportsLinks`

## Verdict

**Discoverability mismatch**, not missing implementation. Integration exists on a dedicated admin Reports entry point.
