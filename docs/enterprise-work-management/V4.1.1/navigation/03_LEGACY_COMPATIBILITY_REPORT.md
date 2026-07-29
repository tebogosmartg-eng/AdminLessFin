# 03 — Legacy Compatibility Report

| Surface | Compatibility |
|---------|----------------|
| `Projects.tsx` / `ProjectDetail.tsx` | Unchanged logic; still at `/projects`, `/projects/:id` |
| `TimesheetForm` + timesheets edge | Unchanged; hosted inside Work Time billable tab |
| `TimeTracking.tsx` | Thin compatibility redirect to `/work/time` |
| Bookmarks `/time-tracking` | Redirect preserve |
| Bookmarks `/projects` | Preserved (Engagements) |
| Payroll / Accounting | Untouched |

Backwards compatible for deep links and billing workflows.
