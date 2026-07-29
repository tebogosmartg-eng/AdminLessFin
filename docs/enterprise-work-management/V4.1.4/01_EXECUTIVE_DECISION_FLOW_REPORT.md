# 01 — Executive Decision Flow Report

**Board:** Independent Principal Executive Intelligence Board  
**Version:** 4.1.4  
**Date:** 2026-07-13  
**Evidence:** `WorkExecutiveDashboard.tsx` · `buildAttentionQueue` · `GET_EXECUTIVE_DASHBOARD`  
**Upstream:** V4.1.3 composition NOT CERTIFIED

---

## 1. Mandate

Certify whether each executive persona can answer the decision questionnaire within 30 seconds of login — and act — without the dashboard inventing financial truth or bypassing owning modules.

---

## 2. Required Decision Questionnaire (All Personas)

| # | Decision question | Decision type |
|---|-------------------|---------------|
| D1 | What requires my attention today? | Prioritisation |
| D2 | Which work is at risk? | Intervention |
| D3 | Where are we making money? | Portfolio focus |
| D4 | Where are we losing money? | Corrective action |
| D5 | Which clients need attention? | Relationship / commercial |
| D6 | Which teams are overloaded? | Capacity rebalance |
| D7 | Which teams have capacity? | Allocation |
| D8 | Which invoices should be issued? | Billing action |
| D9 | Which payments are outstanding? | Cash / collections |
| D10 | Which payroll approvals are outstanding? | Approval / payroll readiness |

---

## 3. Current Decision Flow (As Implemented)

```
Login → /work
  → Header + nav CTAs (Resources / Clocking / Projects)
  → Optional seed CTA
  → 8 KPI statistics (FIRST visual mass)
  → Attention queue + Upcoming deadlines (SECOND)
  → Payroll Due / Time Approvals (THIRD)
```

**Board ruling:** Flow is **statistics → partial actions**. Certified executive flow must be **attention → story → action → supporting metrics → drill-down**.

---

## 4. Persona Decision Flows

### 4.1 CEO / Managing Director / Business Owner

| Need | Supported today? | Flow gap |
|------|------------------|----------|
| Today’s focus | **PARTIAL** | Attention exists but below KPI wall |
| Portfolio money story | **NO** | No making/losing money narrative; Expected Gross Profit misleads |
| Client heat | **NO** | No client aggregation |
| One-screen “so what?” | **NO** | Eight numbers without ranked decisions |

**30s verdict:** Can see activity volume; cannot decide where to intervene commercially or financially with confidence.

### 4.2 Operations Director

| Need | Supported today? | Flow gap |
|------|------------------|----------|
| At-risk work | **PARTIAL** | Budget/schedule in attention |
| Overload / capacity | **PARTIAL** | Buried in attention + utilisation % KPI |
| Clocking exceptions | **NO** on home | Separate `/work/clocking` CTA only |
| Approve time | **YES** | Clear CTA to `/work/time` |

**30s verdict:** Partial delivery control; not a complete ops decision loop.

### 4.3 Financial Director

| Need | Supported today? | Flow gap |
|------|------------------|----------|
| Recognised earnings | **NO** | Not composed |
| Cash / AR / AP | **NO** | Stubs empty; Accounting `/` required |
| Ops vs Accounting distinction | **FAIL** | Expected Gross Profit looks like FS profit |
| Invoice issuance queue | **PARTIAL** | Unbilled in attention only if data present |

**30s verdict:** **Unsafe** for FD decision-making on `/work` alone — ownership boundary visually violated by profit tile.

### 4.4 Project Director

| Need | Supported today? | Flow gap |
|------|------------------|----------|
| Projects needing intervention | **PARTIAL** | Attention → Project Command Centre |
| Milestone pressure | **PARTIAL** | Upcoming Deadlines list (weak drill) |
| Project economics story | **PARTIAL** | Economics strip only after drill to project |

**30s verdict:** Usable for delivery triage if attention is scrolled to; hierarchy works against them.

---

## 5. Decision Enablement Score

| Question | Enabled? | Notes |
|----------|----------|-------|
| D1 Attention today | **PARTIAL** | Present, wrong order, alerts not rendered |
| D2 Work at risk | **PARTIAL** | Budget/schedule only |
| D3 Making money | **NO** | No winners list; unlabelled “profit” |
| D4 Losing money | **NO** | No losers list |
| D5 Clients | **NO** | — |
| D6 Overloaded teams | **PARTIAL** | Attention overallocation |
| D7 Capacity teams | **PARTIAL** | Idle + capacity hours KPI |
| D8 Invoices to issue | **PARTIAL** | Unbilled signal only |
| D9 Payments outstanding | **NO** | Stub |
| D10 Payroll approvals | **YES** | Count + Review CTA |

**Score:** 1 YES · 5 PARTIAL · 4 NO → fails decision-intelligence bar.

---

## 6. Certified Target Decision Flow (Composition Order — No New Engines)

1. **Executive Attention** — ranked actions with severity + one-click owning workflow  
2. **Business Health narrative** — one paragraph / score: “stable / watch / crisis” from existing health drivers  
3. **Work Portfolio** — active / at-risk / pipeline counts as story beats  
4. **Commercial Position** — secured vs pipeline (Commercial labels)  
5. **Operational Performance** — burn vs budget story  
6. **Resource Health** — overload vs spare capacity  
7. **Financial Readiness (read-only)** — cash / AR / recognised (Accounting/Sales)  
8. **Risks** — open delivery risks  
9. **Activity Timeline** — recent audited events  
10. **Drill-down Analytics** — Project CC, reports, Accounting routes  

Supporting KPI strip may appear **after** Attention + Health narrative — never before.

---

## 7. Result

# EXECUTIVE DECISION FLOW NOT CERTIFIED

Persona decision loops are incomplete; Financial Director path is actively misleading; statistics precede decisions.
