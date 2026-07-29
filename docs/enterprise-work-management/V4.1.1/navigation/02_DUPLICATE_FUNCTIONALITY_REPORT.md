# 02 — Duplicate Functionality Report

| Legacy | EWM | Duplicate? | Disposition |
|--------|-----|------------|-------------|
| Projects list/detail (engagement, invoice, GL P&L) | Work Projects / Command Centre | **Partial** — different SoT | Keep Engagements under Work nav; do not delete pages |
| Log Time (timesheets CRUD → billing) | Work Time (EWM entries) | **Overlapping UX** | Migrate timesheet UI into Work Time “Billable timesheets” tab; redirect `/time-tracking` |
| — | Time vs Clocking | **Not duplicates** | Distinct concepts; labels clarify |

No business logic removed from `projects`, `timesheets`, or `ProjectDetail` invoice flows.
