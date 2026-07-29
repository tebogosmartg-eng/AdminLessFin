# 04 — Executive Action Matrix

**Board:** Independent Principal Executive Intelligence Board  
**Version:** 4.1.4  
**Date:** 2026-07-13  

Maps decision questions → actions → owning module → current enablement.  
**Rule:** Dashboard surfaces actions; owning workflows execute them. No dashboard auto-approve, auto-invoice, or journal post.

---

## 1. Action Matrix

| ID | Decision question | Intended executive action | Owning workflow | Primary data owner | Consumer personas | Surfaced on `/work` today? | Drill / CTA today |
|----|-------------------|---------------------------|-----------------|--------------------|-------------------|----------------------------|-------------------|
| A1 | What requires my attention today? | Open top attention item; acknowledge alert | Attention → Alert Rules / Project / Time | EWM Analytics / Alerts | All | **PARTIAL** | Project nav if `ewmProjectId`; alerts not shown |
| A2 | Which work is at risk? | Intervene on budget/schedule risk | Project Command Centre | EWM Costing / Milestones | Ops, Project, MD | **PARTIAL** | Attention → `/work/projects/:id` |
| A3 | Where are we making money? | Protect / expand winning work | Project economics + commercial | EWM Forecast + Commercial + Accounting read | CEO, FD, Owner | **NO** | — |
| A4 | Where are we losing money? | Stop bleed / reforecast / escalate | Project CC + forecast + Accounting P&L read | EWM + Accounting | CEO, FD, Project | **NO** | Misleading Expected Gross Profit |
| A5 | Which clients need attention? | Call / commercial follow-up | Client / Engagement | EWM + CRM/client | CEO, MD, Owner | **NO** | — |
| A6 | Which teams are overloaded? | Reallocate / defer work | Resources / Allocations | EWM Capacity | Ops, Project | **PARTIAL** | Attention overallocation (weak identity) |
| A7 | Which teams have capacity? | Assign idle capacity | Resources / Planning | EWM Capacity | Ops, Project | **PARTIAL** | Idle in attention; Capacity Remaining KPI |
| A8 | Which invoices should be issued? | Create / submit invoice from billable | Sales / Billing bridge | EWM billable signal → Sales | FD, Owner, MD | **PARTIAL** | Unbilled in attention only; no Issue Invoice CTA |
| A9 | Which payments are outstanding? | Collect AR / chase AP | Accounting / Sales AR-AP | Accounting / Sales | FD, Owner | **NO** | Stubs; must leave to `/` |
| A10 | Which payroll approvals are outstanding? | Approve / reject time | EWM Time → Payroll adapter | EWM Time (Payroll calc authority untouched) | Ops, FD, Owner | **YES** | “Review time entries” → `/work/time` |

---

## 2. Action Placement Rule

| Rule | Required | Current |
|------|----------|---------|
| Primary actions appear in **Executive Attention** first | Yes | No — KPI wall first |
| Each attention row has a **decision verb** | Yes | Implicit click only |
| Actions never mutate GL/Payroll math on the dashboard | Yes | **PASS** for payroll path |
| Financial actions deep-link to Accounting/Sales | Yes | **FAIL** — not linked |
| Commercial billing actions deep-link to Sales | Yes | **FAIL** — unbilled lacks CTA |

---

## 3. Persona × Action Coverage

| Persona | Must-have actions (≤30s) | Coverage |
|---------|--------------------------|----------|
| **CEO** | A1, A3, A4, A5, A9 | **Weak** (A1 partial only) |
| **Managing Director** | A1, A2, A5, A8 | **Weak** |
| **Operations Director** | A1, A2, A6, A7, A10 | **Moderate** |
| **Financial Director** | A3, A4, A8, A9, A10 | **Unsafe** (A10 only reliable; A3/A4 polluted) |
| **Project Director** | A1, A2, A6, A7 | **Moderate** |
| **Business Owner** | A1, A3–A5, A8–A10 | **Weak** |

---

## 4. Safe Action Catalogue (Additive Composition)

Allowed without new engines or frozen-module changes:

| Verb | Target | Notes |
|------|--------|-------|
| Review | `/work/time` | Already present |
| Open project | `/work/projects/:id` | Already present |
| Open clocking | `/work/clocking` | Header only — promote into Attention for missing clock-outs |
| Acknowledge alert | Alert Rules API | Wire existing `executiveAlerts` |
| Issue invoice | Sales billing route with project context | From unbilled attention items |
| View cash / AR | Accounting read routes | Financial Readiness section |
| View portfolio report | Work reports | Drill-down Analytics |

Forbidden from dashboard chrome:

- Approve-all time  
- Post journals  
- Calculate PAYE / net pay  
- Invent Accounting profit  

---

## 5. Result

# EXECUTIVE ACTION MATRIX — TARGET CERTIFIED; RUNTIME NOT CERTIFIED

The matrix of decisions and owning actions is defined. Runtime `/work` enables **A10 fully**, **A1/A2/A6/A7/A8 partially**, and **A3/A4/A5/A9 not at all** — with an authority defect on money actions.
