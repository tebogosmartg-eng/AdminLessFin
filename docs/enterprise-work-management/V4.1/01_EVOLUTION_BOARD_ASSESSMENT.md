# 01 — Evolution Board Assessment (V4.1)

**Board:** Independent Principal Enterprise Evolution Board  
**Date:** 2026-07-13  
**Verdict:** APPROVED WITH CONTROLLED EVOLUTION  

---

## Board Context

| Layer | Status |
|-------|--------|
| EWM V4.0 Architecture | APPROVED / LOCKED |
| Live pre-EWM surface | Projects + Timesheets + GL `project_id` tagging |
| Frozen modules | Payroll, Accounting, GL, Legislation, Statutory Returns, Reporting, VIP |

Operating principle: treat V4.0 as foundation; recommend only high-value additive evolution.

---

## Assessment Summary

| Area | Finding | Risk |
|------|---------|------|
| Executive Dashboard | Finance home is not a work ops dashboard; need additive Executive Operations Dashboard | LOW–MEDIUM |
| Project Command Centre | `ProjectDetail` is billable engagement UI; need additive command centre | MEDIUM |
| Resource Architecture | V4.0 people-only; need Work Resource Registry for non-people budget consumers | MEDIUM |
| Payroll Integration | No timesheet→payroll bridge; adapter-only under change-control | MEDIUM |
| Accounting Integration | Separation intact; emit operational facts only | LOW |
| Clocking | Manual hours only; Time Capture channel feeds Time Engine | MEDIUM–HIGH |
| Profitability | GL P&L only; compose contract/forecast/burn views | LOW–MEDIUM |
| Executive Intelligence | Finance insights only; deterministic work attention rules | LOW |

---

## Explicitly Rejected

- Redesign of V4.0 hierarchy  
- EWM posting journals  
- Payroll calculation inside EWM  
- Subcontractor → payroll  
- Replacing GL profitability  
- AI decision engines  
- Renaming/moving existing `/projects`, `/time-tracking`, APIs  

---

## Final Verdict

**APPROVED WITH CONTROLLED EVOLUTION**
