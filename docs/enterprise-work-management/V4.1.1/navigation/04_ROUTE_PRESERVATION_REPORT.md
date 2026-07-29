# 04 — Route Preservation Report

| Legacy route | Action |
|--------------|--------|
| `/time-tracking` | **Redirect** → `/work/time` (billable tab default via hash/query `?view=billing`) |
| `/projects` | **Preserve** — Engagements |
| `/projects/:id` | **Preserve** — Engagement command/detail + invoicing |
| `/work/*` | Canonical operational experience |
| `/project-profitability` | Preserve (Reports) — GL profitability |

No frozen-module routes changed.
