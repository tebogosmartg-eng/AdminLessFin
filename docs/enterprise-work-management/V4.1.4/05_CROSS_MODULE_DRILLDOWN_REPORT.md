# 05 — Cross-Module Drill-down Report

**Board:** Independent Principal Executive Intelligence Board  
**Version:** 4.1.4  
**Date:** 2026-07-13  

---

## 1. Principle

Decision intelligence requires **preserved drill-down** into owning modules. The dashboard composes; modules decide and mutate.

| From dashboard signal | Must land in | Must not do |
|-----------------------|--------------|-------------|
| Attention / project risk | EWM Project Command Centre | Recalculate cost |
| Time approvals | EWM Time | Calculate payroll |
| Clock exceptions | EWM Clocking | Auto-lock time |
| Unbilled work | Sales / Billing bridge | Recognise revenue |
| Cash / AR / AP | Accounting | Invent balances |
| Recognised revenue / FS profit | Accounting reports | Merge with forecast |
| Contract / pipeline | Commercial / Engagement | Become commercial SoT |
| Portfolio analytics | Work reports | Parallel reporting engine |

---

## 2. Current Drill-down Inventory

| UI control | Destination | Module | Preserved? | Board |
|------------|-------------|--------|------------|-------|
| Header → Resources | `/work/resources` | EWM | Yes | **PASS** |
| Header → Clocking | `/work/clocking` | EWM | Yes | **PASS** |
| Header → Projects | `/work/projects` | EWM | Yes | **PASS** |
| Attention item click | `/work/projects/:id` when `ewmProjectId` | EWM | Partial (idle/overload often lack project) | **PARTIAL** |
| Upcoming Deadlines rows | None | EWM | No navigation | **FAIL** |
| Review time entries | `/work/time` | EWM | Yes | **PASS** |
| KPI tiles | None | — | Dead ends | **FAIL** |
| Expected Gross Profit | None | — | Misleading dead end | **FAIL** |
| Unbilled (in attention) | Project only | Misses Sales | Incomplete | **PARTIAL** |
| Cash / AR / AP | N/A (empty) | Accounting | Broken | **FAIL** |
| Accounting `/` from `/work` | Not linked | Accounting | Forced mental hop | **FAIL** |
| Work reports from home | Not linked | Reporting | Missing | **FAIL** |
| Executive alerts | Not rendered | EWM Alerts | Broken | **FAIL** |

---

## 3. Certified Drill-down Map (Target)

| Story section | Primary drill | Secondary drill | Owner |
|---------------|---------------|-----------------|-------|
| Executive Attention | Owning workflow per item type | Project CC | EWM / Sales / Accounting per type |
| Business Health | Driver → Attention subset | Portfolio Health report | EWM |
| Work Portfolio | Filtered project list | Project CC | EWM |
| Commercial Position | Pipeline/awarded lists | Engagement/commercial | Commercial |
| Operational Performance | Cost by project | Cost facts | EWM |
| Resource Health | Resource detail | Allocations / Clocking | EWM |
| Financial Readiness | Bank / AR / AP views | Invoice document | Accounting / Sales |
| Risks | Risk register | Project | EWM |
| Activity Timeline | Event deep link | Module home | Platform + owners |
| Drill-down Analytics | Work executive reports | Accounting OCC `/` | Reporting + Accounting |

---

## 4. Boundary Verification

| Check | Result |
|-------|--------|
| No duplicated ownership in drill targets | **PASS** — targets map to single owners |
| No dashboard-side accounting calculations on drill | **FAIL today** — profit computed before any drill |
| Operational forecasting distinguished from recognition | **FAIL today** — Expected Gross Profit |
| Cross-module paths preserved for money decisions | **FAIL** — no Accounting/Sales links from `/work` |
| EWM operational drills preserved | **PARTIAL** — project/time/resources/clocking exist |

---

## 5. Decision Latency Impact

| Persona | Extra hops today | Intelligence cost |
|---------|------------------|-------------------|
| FD | `/work` → mental switch → `/` for cash/AR | Breaks 30s money decisions |
| CEO | KPI scan → scroll attention → project → (no client) | No client decision path |
| Ops | Attention → project OR header clocking | Acceptable if Attention promoted |
| Project Director | Attention → Project CC | Best path today |

---

## 6. Additive Fixes (No Widget Proliferation Mandate)

This board does **not** require new widgets. It requires:

1. **Reorder** existing Attention above KPI strip.  
2. **Wire** existing `executiveAlerts` and deadline rows to drills.  
3. **Label + replace** Expected Gross Profit with dual-authority reads (composition).  
4. **Deep-link** unbilled → Sales billing; cash/AR → Accounting routes.  
5. **Link** Portfolio Health / Executive Attention reports from a Drill-down Analytics footer — existing report builders.

---

## 7. Result

# CROSS-MODULE DRILL-DOWN NOT CERTIFIED

EWM-internal navigation is partially preserved. Cross-module decision paths (Accounting, Sales, Analytics reports) are largely absent, and the money narrative violates ownership clarity before any drill occurs.
