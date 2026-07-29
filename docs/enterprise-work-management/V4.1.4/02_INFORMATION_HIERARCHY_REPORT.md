# 02 — Information Hierarchy Report

**Board:** Independent Principal Executive Intelligence Board  
**Version:** 4.1.4  
**Date:** 2026-07-13  

---

## 1. Certified Hierarchy (Target)

| Order | Section | Purpose |
|-------|---------|---------|
| 1 | Executive Attention | What to do now |
| 2 | Business Health | How healthy is the enterprise pulse? |
| 3 | Work Portfolio | What work exists and its state |
| 4 | Commercial Position | What is secured / pipeline |
| 5 | Operational Performance | How delivery is burning vs plan |
| 6 | Resource Health | Who is overloaded / available |
| 7 | Financial Readiness (read-only) | Cash, AR, recognition — Accounting/Sales |
| 8 | Risks | Structured risk view |
| 9 | Activity Timeline | What just changed |
| 10 | Drill-down Analytics | Deep analysis after the story |

**Invariant:** Actions and narrative precede KPI grids.

---

## 2. Actual Hierarchy (`/work`)

| Visual order | Present content | Maps to target section? |
|--------------|-----------------|-------------------------|
| 0 | Title + resource/clocking/projects CTAs | Partial nav only — not Attention |
| 1 | Seed empty-state (conditional) | Onboarding — OK when empty |
| 2 | **8 KPI cards** | Fragments of 3–6 — **wrong position** |
| 3 | Projects Requiring Attention | **Section 1** — too late |
| 3b | Upcoming Deadlines | Mix of 3 / 8 — secondary |
| 4 | Payroll Due / Time Approvals | Fragment of Section 1 action |

**Absent as sections:** Business Health (2), Commercial Position as narrative (4), Operational Performance story (5), Resource Health panel (6), Financial Readiness (7), Risks (8), Activity Timeline (9), Drill-down Analytics zone (10).

---

## 3. Section Certification Cards

### 1. Executive Attention

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What requires my attention today? |
| **Decision Enabled** | Rank interventions; open owning workflow |
| **Primary Data Owner** | EWM Analytics composition (attention + alerts) |
| **Consumer** | All six personas |
| **Drill-down Path** | Attention item → Project CC / Time / Clocking / Sales billing |
| **Update Frequency** | On open + work/alert events |
| **Performance Target** | First paint ≤1.5s with top 5 items; independent of KPI grid |
| **Mobile Behaviour** | Full-width top stack; max 5 with “See all” |
| **Industry Variants** | Labels (Job/Matter/Engagement); severity thresholds configurable |
| **Status** | **PARTIAL / WRONG ORDER** |

### 2. Business Health

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Is the business operationally healthy right now? |
| **Decision Enabled** | Escalate or proceed with normal ops |
| **Primary Data Owner** | EWM Analytics (compose drivers — no new math) |
| **Consumer** | CEO, MD, Business Owner, Ops Director |
| **Drill-down Path** | Health drivers → Attention / Portfolio / Risks |
| **Update Frequency** | On open / risk-capacity-budget events |
| **Performance Target** | ≤400ms from rollups/facts |
| **Mobile Behaviour** | Single status + top driver |
| **Industry Variants** | Driver weights by industry pack |
| **Status** | **MISSING** |

### 3. Work Portfolio

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What work is active, pipeline, or blocked? |
| **Decision Enabled** | Portfolio focus / start-stop decisions |
| **Primary Data Owner** | EWM Projects |
| **Consumer** | Ops / Project Directors, MD |
| **Drill-down Path** | `/work/projects` → Project Command Centre |
| **Update Frequency** | Near real-time status |
| **Performance Target** | Counts ≤200ms |
| **Mobile Behaviour** | Three beats: Active / At risk / Pipeline |
| **Industry Variants** | Naming only |
| **Status** | **PARTIAL** (count KPI only) |

### 4. Commercial Position

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What revenue is secured vs still in pipeline? |
| **Decision Enabled** | Chase pipeline vs protect delivery on awarded |
| **Primary Data Owner** | Commercial / Engagement (snapshot in EWM) |
| **Consumer** | CEO, MD, FD, Business Owner |
| **Drill-down Path** | Pipeline list → commercial/engagement record |
| **Update Frequency** | On commercial approve / snapshot |
| **Performance Target** | Snapshot sums only |
| **Mobile Behaviour** | Two labelled figures |
| **Industry Variants** | Quote/tender/pipeline vocabulary |
| **Status** | **PARTIAL** (unlabelled KPIs) |

### 5. Operational Performance

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Are we delivering within operational cost envelopes? |
| **Decision Enabled** | Re-scope, freeze spend, reallocate |
| **Primary Data Owner** | EWM Costing |
| **Consumer** | Ops / Project Directors, FD (ops view) |
| **Drill-down Path** | Burn by project → cost facts |
| **Update Frequency** | On cost lock / rollup |
| **Performance Target** | Consume rollups; label Operational Cost (EWM) |
| **Mobile Behaviour** | Burn vs budget story line |
| **Industry Variants** | Budget policy thresholds |
| **Status** | **PARTIAL** (duplicate cost KPIs) |

### 6. Resource Health

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Who is overloaded; who has capacity? |
| **Decision Enabled** | Rebalance allocations |
| **Primary Data Owner** | EWM Capacity |
| **Consumer** | Ops Director, Project Director |
| **Drill-down Path** | Resources / allocations / clocking |
| **Update Frequency** | Snapshot / time lock |
| **Performance Target** | ≤300ms aggregates |
| **Mobile Behaviour** | Overload count + available hours |
| **Industry Variants** | Crew / bench / utilisation norms |
| **Status** | **PARTIAL** |

### 7. Financial Readiness (read-only)

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Cash, outstanding payments, recognised position — ready for money decisions? |
| **Decision Enabled** | Collections, issue invoice (via Sales), cash watch — **no GL posts from dash** |
| **Primary Data Owner** | Accounting / Sales |
| **Consumer** | FD, CEO, Business Owner |
| **Drill-down Path** | Accounting `/` bank/AR · Sales invoice flows |
| **Update Frequency** | Accounting/Sales refresh |
| **Performance Target** | Reuse Accounting aggregates; fail open (error, not fake zero) |
| **Mobile Behaviour** | Cash + AR outstanding |
| **Industry Variants** | Currency display via company adapters |
| **Status** | **MISSING** on `/work` |

### 8. Risks

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | Which structured risks threaten delivery/margin? |
| **Decision Enabled** | Escalate / mitigate |
| **Primary Data Owner** | EWM Risk (+ budget alerts) |
| **Consumer** | All personas |
| **Drill-down Path** | Risk register → project |
| **Update Frequency** | On risk/alert events |
| **Performance Target** | Top N by score |
| **Mobile Behaviour** | Top 5 |
| **Industry Variants** | Risk taxonomies |
| **Status** | **MISSING** (alerts API unused) |

### 9. Activity Timeline

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What just happened that I should know? |
| **Decision Enabled** | Context for attention items |
| **Primary Data Owner** | Platform BOE / activity composition |
| **Consumer** | All personas |
| **Drill-down Path** | Event → owning module |
| **Update Frequency** | Event stream |
| **Performance Target** | Last N events; independent fail |
| **Mobile Behaviour** | Compact feed |
| **Industry Variants** | Event filters |
| **Status** | **MISSING** on `/work` |

### 10. Drill-down Analytics

| Attribute | Certification |
|-----------|---------------|
| **Business Question** | What is the deep evidence behind the story? |
| **Decision Enabled** | Validate before large actions |
| **Primary Data Owner** | Owning modules + work reports |
| **Consumer** | FD, Project Director, Ops |
| **Drill-down Path** | Project CC · Portfolio Health report · Accounting reports |
| **Update Frequency** | On demand |
| **Performance Target** | Lazy load; never block Attention |
| **Mobile Behaviour** | Links, not dense charts first |
| **Industry Variants** | Report packs |
| **Status** | **PARTIAL** (project drill only; no analytics zone) |

---

## 4. Hierarchy Conformance Matrix

| Target order | Present in order? | Board |
|--------------|-------------------|-------|
| 1 Attention first | **NO** (3rd visual block) | **FAIL** |
| 2 Business Health | **NO** | **FAIL** |
| 3–6 Story sections | **Fragmented into KPI strip** | **FAIL** |
| 7 Financial Readiness | **NO** | **FAIL** |
| 8–9 Risks / Activity | **NO** | **FAIL** |
| 10 Drill-down | **PARTIAL** | **PARTIAL** |
| Actions before KPIs | **NO** | **FAIL** |
| Story before statistics | **NO** | **FAIL** |

---

## 5. Result

# INFORMATION HIERARCHY NOT CERTIFIED

Current layout inverts the certified order: **statistics dominate; decisions trail**.
