# 03 — Navigation Integration Report

**Version:** 3.6.7

## Navigation sources inspected

| Source | File | VIP link? |
|--------|------|-----------|
| Primary sidebar | `src/components/SidebarNav.tsx` | **YES** (admin Reports group) |
| Layout host | `src/components/Layout.tsx` L8, L34, L59 renders `SidebarNav` | Hosts sidebar |
| Payroll nav group | `SidebarNav.tsx` `payrollLinks` L88–95 | **NO** |
| Payroll Reports category selector | `src/pages/PayrollReports.tsx` + `ReportCategory` | **NO** |
| Dashboard payroll card | `src/pages/Dashboard.tsx` → `/payroll-reports` | **NO** (points to Payroll Reports only) |
| Payroll Command Centre | `PayrollCommandCentre.tsx` → `/payroll-reports` | **NO** |

## Reachable path (proven)

```
SidebarNav
  → Reports NavGroup (L201–207)
  → adminReportsLinks (L123–126) when isAdmin
  → { to: '/audit-compliance-reports', label: 'Audit & Compliance Reports' }  // L125
  → router /audit-compliance-reports
  → AuditComplianceReports
  → Enterprise VIP Payroll Working Paper
```

**Condition:** `role === 'owner' || role === 'admin'` (`SidebarNav.tsx` L58, L123).

## Broken expected chain (user mental model)

```
Sidebar → Payroll → Reports → Audit & Compliance → VIP
```

| Step | Result | Responsible file |
|------|--------|------------------|
| Sidebar → Payroll | OK (`payrollLinks`, admin-only) | `SidebarNav.tsx` L165–172 |
| Payroll → Payroll Reports | OK (`/payroll-reports` in `payrollLinks` L93) | `SidebarNav.tsx` |
| Payroll Reports → Audit & Compliance category | **BREAKS** | `PayrollReports.tsx` + `payrollManagementReports.ts` |
| Payroll group → Audit & Compliance link | **ABSENT** | `SidebarNav.tsx` `payrollLinks` L88–95 |

### Exact selector omission

**File:** `src/lib/payrollManagementReports.ts` L35  
`export type ReportCategory = 'operational' | 'management' | 'statutory';`

**File:** `src/pages/PayrollReports.tsx` L49–51  
`CATEGORY_LABELS` only maps those three keys; Select at L289–299 iterates `Object.keys(CATEGORY_LABELS)`.

No `audit` / `compliance` value exists. VIP was never registered as a fourth category on this page by design of V3.6.6 (separate page).

## Verdict

Navigation **is integrated** under **Reports → Audit & Compliance Reports** (admin).  
It is **not** listed under the **Payroll** group and **not** in the Payroll Reports category selector — which explains “only Operational / Management / Statutory” when viewing `/payroll-reports`.
