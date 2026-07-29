# 05 — Dashboard Readiness Assessment

**Board:** Independent Principal Executive Experience Board  
**Version:** 4.1.3  
**Date:** 2026-07-13  

---

## 1. Readiness Scorecard

| Dimension | Weight | Score (0–5) | Notes |
|-----------|--------|-------------|-------|
| 30-second questionnaire coverage | 25% | **1.5** | 2/13 full; many partial |
| Widget suite completeness | 20% | **1.5** | ~4/15 live; several partial |
| Authority labelling & no duplicate calc | 20% | **1.0** | Critical Profit non-conformance |
| Cross-module composition (Cash/AR/Revenue) | 15% | **0.5** | Stubs / missing |
| Performance & widget isolation | 10% | **2.0** | Live joins; all-or-nothing load |
| Multi-company / industry config | 10% | **1.0** | Active company only; no packs |
| **Weighted readiness** | 100% | **≈1.3 / 5** | **Not production command-centre ready** |

Certification bar for “primary command centre”: **≥4.0** with zero Critical authority defects.

---

## 2. Quality Gate Detail

| Gate | Result | Evidence |
|------|--------|----------|
| Executive value | **PARTIAL** | Active work, burn, attention exist; earned revenue/cash/clients missing |
| Operational value | **PARTIAL** | Useful for delivery managers; incomplete for owners |
| No duplicated ownership | **PASS** (design) | Planes clear in docs |
| No financial recalculations | **FAIL** | `expectedGrossProfit` in edge function |
| Accounting financial authority | **GAP** | Cash/recognised revenue not on `/work` |
| Payroll payroll authority | **PASS** | Approvals hand off; no PAYE |
| EWM operational authority | **PASS** | Projects, cost, capacity owned correctly |
| Dashboard loads quickly | **PARTIAL** | Multi-query; no facts materialization |
| Multi-company ready | **PARTIAL** | Scoped; no executive rollup role path |
| Industry configurable | **FAIL** | Hard-coded general workspace stereotypes only |

---

## 3. Additive Remediation Roadmap (Implementation Approval Required)

Ordered for maximum certification lift without touching frozen modules:

### R1 — Authority conformance (blocker)

1. Remove or relabel **Expected Gross Profit**.  
2. Stop computing profit in `GET_EXECUTIVE_DASHBOARD`.  
3. Consume Forecast Margin from forecast/costing engines; optional Accounting Profit tile via Accounting read.

### R2 — Compose missing read models

4. Cash Position (Accounting read-only).  
5. Recognised Revenue (Accounting) + Outstanding Invoices (Sales/AR).  
6. Render Executive Alerts from `ewm_budget_alerts`.  
7. Clocking Status strip (open / missing clock-outs).  
8. Recent Activity (BOE composition).  

### R3 — Named widgets

9. Business Health portfolio score.  
10. Capacity Heatmap (prefer `ewm_analytics_facts`).  
11. Risk Register Summary.  
12. Loss-making work list (ops + accounting flags).  
13. Clients requiring attention.

### R4 — Platform quality

14. Per-widget React Query / error isolation.  
15. Wire BOE invalidation for `ewm_executive_dashboard`.  
16. Approvals ageing buckets.  
17. Industry label packs + multi-company rollup (platform role).  
18. AI Readiness Zone shell (design → advisory).

---

## 4. What Remains Certified Upstream

| Pack | Status |
|------|--------|
| V4.1.1 Navigation | CERTIFIED — `/work` is correct ops home |
| V4.1.1 Domain Model | CERTIFIED |
| V4.1.2 Dashboard Rules | CERTIFIED — this pack **enforces** them against UI |
| V4.1.3 Widget Ownership targets | CERTIFIED (Report 02) |
| V4.1.3 KPI Catalogue | CERTIFIED as target (Report 03) |
| AI Readiness Zone design | DESIGN CERTIFIED |

---

## 5. Re-Certification Criteria

Return **EXECUTIVE DASHBOARD CERTIFIED** only when:

1. All 13 executive questions answerable on `/work` within 30 seconds.  
2. All 15 named widgets present (AI zone may remain design-shell).  
3. Zero money tiles without authority labels.  
4. Zero profit/margin math invented in the dashboard composition API.  
5. Cash / Recognised Revenue / AR are Accounting/Sales reads.  
6. Widgets fail independently; no fabricated healthy zeros.  
7. Active-company default + documented multi-company role path.  
8. Industry packs configurable without engine forks.

---

## 6. Final Status

# EXECUTIVE DASHBOARD NOT CERTIFIED

The surface is a **valuable partial operational overview** and a valid navigation home. It is **not yet** the primary command centre for business owners across industries.

**Board recommendation:** Proceed with additive Implementation Approval citing V4.1.2 rules + this V4.1.3 pack. Do not freeze the current UI as enterprise-complete.
