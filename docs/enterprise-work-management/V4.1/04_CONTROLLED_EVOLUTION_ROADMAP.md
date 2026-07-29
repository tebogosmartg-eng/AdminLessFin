# 04 — Controlled Evolution Roadmap (V4.1)

| Phase | Scope | Risk |
|-------|-------|------|
| E0 | Governance addenda (this pack) | LOW |
| E1 | V4.0 P0–P2: schema, work edge, tasks, time workflow, capacity, operational costing | LOW |
| E2 | Executive Operations Dashboard + Project Command Centre | LOW–MED |
| E3 | Profitability composition + Executive Intelligence + work report pack | LOW |
| E4 | Billing bridge: locked EWM → timesheets → existing invoices | LOW |
| E5 | Payroll facts adapter (change-control); temp wage inputs; subbie never→payroll | MED |
| E6 | Work Resource Registry + cost category rollups | MED |
| E7 | Time Capture / Clocking channels | MED–HIGH |

Implementation placement (unchanged from V4.0):

```
src/pages/work/
src/components/work/
src/lib/work/
supabase/functions/work/
supabase/migrations/*_ewm_*.sql
src/lib/boe/          # ADD work.* only
src/reporting/reports/work/
```
