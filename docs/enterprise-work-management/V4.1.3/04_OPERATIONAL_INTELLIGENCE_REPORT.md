# 04 — Operational Intelligence Report

**Board:** Independent Principal Executive Experience Board  
**Version:** 4.1.3  
**Date:** 2026-07-13  

Assesses how the Executive Dashboard turns operational facts into intervention intelligence — without becoming a second system of record.

---

## 1. Intelligence Layers

| Layer | Purpose | Current state |
|-------|---------|---------------|
| **Overview KPIs** | Instant portfolio pulse | 8 tiles; 1 forbidden Profit form |
| **Attention Queue** | Ranked “what needs me” | Client-side `buildAttentionQueue` — **LIVE** |
| **Alerts** | Explicit budget/escalation facts | API `executiveAlerts` — **not rendered** |
| **Capacity signals** | Overload / idle | Embedded in attention — no heatmap |
| **Commercial–ops–finance bridge** | Dual authority economics | Present on Project CC strip; **absent** on executive home |
| **Activity stream** | Recency / auditability | Accounting `/` only |
| **AI advisory** | Non-mutating ranking | Docs only — Design zone OK |

---

## 2. Attention Queue Certification

**Engine:** `src/lib/work/analytics/index.ts` — deterministic, no AI.

| Signal | Severity model | Board ruling |
|--------|----------------|--------------|
| Budget risk (burn ≥85%) | warning / critical @ ≥100% | **PASS** — consumes burn vs budget |
| Deadline / milestone ≤14d | info / warning / critical overdue | **PASS** |
| Idle resources | info | **PASS** (display names need HR resolve) |
| Overallocation | warning / critical @ ≥120% | **PASS** |
| Pending approvals | warning | **PASS** — does not calculate pay |
| Outstanding supplier | warning | **FAIL runtime** — always empty stub |
| Unbilled completed | warning | **PASS** when data present |
| Cash flow risks | warning | **FAIL runtime** — always empty stub |

**Ordering:** Severity-first deterministic — suitable for future `ai.work.daily_focus` ranking **as a sort overlay only**.

**Board ruling:** Attention Queue pattern is **CERTIFIED**. Stubbed commercial/accounting inputs prevent full executive coverage.

---

## 3. Cross-Module Intelligence Gaps

| Gap | Impact | Additive fix |
|-----|--------|--------------|
| No Recognised Revenue on `/work` | Cannot answer “earned” | Compose Accounting read model with label |
| No Cash Position on `/work` | Forces context switch to `/` | Read-only Accounting widget |
| No AR/AP composition | Outstanding invoices unanswered | Sales/Accounting read; never EWM invent |
| No client rollup | “Clients needing attention” unanswered | Group attention by client_id |
| No loss-making portfolio | Cannot see money losers at glance | Consume forecast margin + Accounting P&L flags |
| Alerts not rendered | Executive Alerts widget fails | Bind `executiveAlerts` UI |
| Clocking not on home | Missing open-session risk | Clocking Status widget |
| Analytics facts unused | Slow live joins; heatmap blocked | Populate `ewm_analytics_facts` |

---

## 4. Separation from Accounting Operations Command Centre

| Concern | Accounting `/` | EWM `/work` | Board rule |
|---------|----------------|-------------|------------|
| Cash, AR/AP, net income | Primary | Compose read-only | Accounting remains financial SoT |
| Active work, capacity, clocking | Not primary | Primary | EWM remains operational SoT |
| Profit | FS / GL | Forecast Margin (ops) dual-labelled | Never merge |
| Activity feed | Present | Should compose work + financial events | Shared BOE presentation |

Executives may keep Accounting `/` as financial home. Certification of **Executive Operations Dashboard** requires `/work` to answer operational + composed financial **read** questions without forcing a hunt.

---

## 5. Performance & Isolation

| Expectation | Reality | Gate |
|-------------|---------|------|
| Widget-independent failure | Single query → full-page skeleton | **FAIL** |
| Materialized analytics | Table exists; not consumed by GET_EXECUTIVE_DASHBOARD | **FAIL** |
| No fabricate zeros for cash/AP | Empty arrays omit signals (better than fake health) but hide gaps | **PARTIAL** |
| Company scope | `activeCompany` only | **PASS** for default; multi-company rollup **MISSING** |

---

## 6. AI Readiness (Design)

| Hook | Allowed behaviour | Forbidden |
|------|-------------------|-----------|
| `ai.work.daily_focus` | Re-rank attention with citations | Auto-approve, auto-lock, silent resolve |
| `ai.work.margin_risk` | Flag loss-making candidates with authority labels | Invent Accounting profit |

**AI Readiness Zone — DESIGN CERTIFIED.**

---

## 7. Operational Intelligence Result

| Component | Result |
|-----------|--------|
| Attention pattern | **CERTIFIED** |
| Alert presentation | **NOT CERTIFIED** |
| Capacity intelligence | **PARTIAL** |
| Dual-authority economics on home | **NOT CERTIFIED** |
| AI zone design | **DESIGN CERTIFIED** |

Overall operational intelligence for a primary command centre: **NOT CERTIFIED**.
