# 01 — Executive Dashboard Certification Report

**Board:** Independent Principal Executive Experience Board  
**Version:** 4.1.3  
**Date:** 2026-07-13  
**Subject:** Executive Operations Dashboard (`/work`)  
**Upstream:** Navigation CERTIFIED · Domain Model CERTIFIED · Dashboard Rules CERTIFIED (V4.1.2)

---

## 1. Mandate

Certify whether the Executive Dashboard can serve as the **primary operational cockpit** for every organisation using AdminLess Fin — answering the executive 30-second questionnaire without redesigning EWM or modifying frozen Payroll/Accounting modules.

---

## 2. Composition Under Review

| Layer | Artefact | Finding |
|-------|----------|---------|
| Route | `/work` → `WorkExecutiveDashboard` | Present; nav label “Executive Dashboard” |
| Composition API | `GET_EXECUTIVE_DASHBOARD` | Live multi-table aggregation; company-scoped |
| Attention | Client `buildAttentionQueue` | Deterministic; severity ordered |
| Sibling surface | Accounting `/` “Operations Command Centre” | Separate product home — **not** composed into `/work` |
| Drill-down | `/work/projects/:id` Project Command Centre | Present |

**Board ruling:** Two “command centres” coexist. Certification of the **Executive** cockpit requires `/work` to compose **read models** from EWM + Accounting + Sales authorities with mandatory labels — not to replace Accounting’s financial home.

---

## 3. Thirty-Second Executive Questionnaire

| # | Business question | Answered in ≤30s on `/work` today? | Evidence |
|---|-------------------|--------------------------------------|----------|
| 1 | What work is active? | **YES** | KPI Total Active Work |
| 2 | What revenue is secured? | **PARTIAL** | Awarded Contract Value (EWM snapshot; no Commercial authority label) |
| 3 | What revenue has been earned? | **NO** | Recognised Revenue (Accounting) not composed |
| 4 | What are total operational costs? | **YES** | Costs Incurred / Operational Burn from `ewm_cost_rollups` |
| 5 | What is forecast profit? | **NO / NON-CONFORMING** | “Expected Gross Profit” = contract − costs; forbidden ambiguous Profit (V4.1.2 §3) |
| 6 | Which work is at risk? | **PARTIAL** | Attention queue (budget ≥85%, deadlines ≤14d); no Risk Register widget |
| 7 | Which clients require attention? | **NO** | No client-level aggregation |
| 8 | Who is overloaded? | **PARTIAL** | In attention via capacity snapshots; no Capacity Heatmap / named Resource Utilisation panel beyond KPI % |
| 9 | Who is available? | **PARTIAL** | Idle resources in attention; Capacity Remaining hours KPI |
| 10 | What payroll is due? | **PARTIAL** | Pending time approvals only — not Payroll run / payslip due (correct authority boundary, incomplete executive signal) |
| 11 | What invoices remain outstanding? | **NO** | `outstandingSupplierInvoices` / `cashFlowRisks` hardcoded `[]`; AR not composed |
| 12 | Which projects/contracts/engagements are losing money? | **NO** | No loss-making portfolio tile; no Accounting P&L read alongside ops margin |
| 13 | What requires my attention today? | **PARTIAL** | Attention queue present; `executiveAlerts` returned but **not rendered**; no AI Readiness Zone |

**Score:** 2 full YES · 6 PARTIAL · 5 NO → **fails primary command-centre bar**.

---

## 4. Named Widget Certification

| Widget | UI status | Board ruling |
|--------|-----------|--------------|
| Business Health | Missing | **NOT CERTIFIED** — required portfolio health rollup |
| Commercial Pipeline | KPI only | **CONDITIONAL** — needs Commercial label + drill to pipeline list |
| Active Work | Present (KPI) | **CONDITIONAL** — needs drill to filtered project list |
| Operational Cost Summary | Partial (dual KPI same number) | **CONDITIONAL** — consolidate + authority label |
| Forecast Profitability | Non-conforming tile | **REJECTED** until Forecast Margin (EWM) + Profit (Accounting) dual-labelled |
| Cash Position | Missing on `/work` | **NOT CERTIFIED** — must be read-only Accounting composition |
| Resource Utilisation | KPI only | **CONDITIONAL** |
| Capacity Heatmap | Missing | **NOT CERTIFIED** |
| Clocking Status | Missing on exec dash | **NOT CERTIFIED** — page exists at `/work/clocking` only |
| Pending Approvals | Present | **CONDITIONAL** — extend ageing; keep Payroll as calc authority |
| Executive Alerts | API only | **NOT CERTIFIED** — must render `ewm_budget_alerts` |
| Risk Register Summary | Missing | **NOT CERTIFIED** |
| Upcoming Milestones | Present | **CONDITIONAL** — wire drill to project |
| Recent Activity | Missing on `/work` | **NOT CERTIFIED** — compose BOE/activity read model |
| AI Readiness Zone | Design only (allowed) | **DESIGN CERTIFIED** — non-mutating advisory hooks only |

---

## 5. Authority & Calculation Audit

| Finding | Severity | Rule violated |
|---------|----------|---------------|
| Tile “Expected Gross Profit” without authority qualifier | **Critical** | V4.1.2 Forbidden widget; V4.1.1 Profitability dual-label |
| `expectedGrossProfit = awardedContractValue − costsIncurred` computed in dashboard API | **Critical** | Dashboards must consume rollups/forecasts — not invent profit math |
| Cash / AP / AR stubs empty | **High** | 30-second questions 11–12 unanswered |
| `ewm_analytics_facts` unused | **Medium** | Performance / widget isolation |
| Single React Query skeleton for entire page | **Medium** | Widget fail-independence rule |
| Dual dashboards (`/` vs `/work`) without composition contract | **Medium** | Executive must not hunt across homes for cash vs work |

**Positive:** Payroll calculation not performed on dashboard; time approvals correctly hand off to `/work/time`. Cost amounts sourced from `ewm_cost_rollups`. Company membership gate present.

---

## 6. Additive Improvement Charter (Non-Redesign)

Allowed under this board (implementation approval separate):

1. **Compose, don’t calculate** — replace Expected Gross Profit with labelled Forecast Margin (EWM) + optional Profit (Accounting) read tiles.  
2. **Widgetise** — implement missing named panels as independent read-model cards with isolated error states.  
3. **Wire unused payloads** — render `executiveAlerts`; surface idle/overload in Capacity Heatmap; compose Cash Position via Accounting read API.  
4. **Materialise** — populate/consume `ewm_analytics_facts` for heatmap and portfolio health (no new cost formulas).  
5. **Industry packs** — configuration overlays (labels, default widget order), not new engines.  
6. **AI Readiness Zone** — design shell citing `ai.work.daily_focus` / `ai.work.margin_risk`; ranking only, no mutation.

Forbidden under this board:

- Changing Payroll engines, payslip math, or statutory certification artefacts.  
- Posting journals or recomputing recognised revenue in EWM.  
- Merging Accounting `/` into a single ambiguous “Profit” cockpit.  
- Auto-approving time or locking entries from the dashboard.

---

## 7. Certification Result

| Dimension | Result |
|-----------|--------|
| Rules alignment (V4.1.2) | **NOT MET** by current UI/API |
| Primary command-centre capability | **NOT MET** |
| Additive path to certification | **DEFINED** (see Deliverable 05) |

# EXECUTIVE DASHBOARD NOT CERTIFIED

Re-submission criterion: all thirteen 30-second questions answered with authority-labelled widgets, zero forbidden Profit tiles, Cash Position read-only from Accounting, and per-widget failure isolation.
