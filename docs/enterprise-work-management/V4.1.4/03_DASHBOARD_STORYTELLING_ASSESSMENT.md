# 03 — Dashboard Storytelling Assessment

**Board:** Independent Principal Executive Intelligence Board  
**Version:** 4.1.4  
**Date:** 2026-07-13  

---

## 1. Story Standard

An executive dashboard **tells a story** when a reader can narrate, in order, without leaving the page:

1. **What is urgent** (attention)  
2. **How the business feels** (health)  
3. **What we are delivering** (portfolio)  
4. **What we have sold / may sell** (commercial)  
5. **How delivery is performing** (ops)  
6. **Whether people can carry it** (resources)  
7. **Whether money can support it** (financial readiness — read-only)  
8. **What could break it** (risks)  
9. **What changed** (timeline)  
10. **Where to prove it** (drill-down)

KPIs are **footnotes to the story**, not the opening chapter.

---

## 2. Story Told by Current `/work`

**Opening chapter (actual):** Eight disconnected numbers — Active Work, Pipeline, Awarded, Costs, Expected Gross Profit, Burn, Utilisation, Capacity.

**Middle (actual):** A list of projects needing attention and milestones.

**Close (actual):** Pending time approvals.

**Narration a CEO can make today:**  
“We have N active projects and some money figures. Something may need attention if I scroll. Time may need approval.”

**Narration a CEO cannot make today:**  
“We are healthy / in crisis. These three clients need me. We are making money on A and losing on B. Issue these invoices. Collect these payments. Move load from Team X to Team Y.”

---

## 3. Storytelling Quality Rubric

| Criterion | Score (0–5) | Evidence |
|-----------|-------------|----------|
| Narrative arc (beginning → middle → end) | **1** | Stats open; weak middle; thin close |
| Causal linkage (why this number matters) | **1** | KPI tiles have no “so what” |
| Decision verbs (Approve / Issue / Reallocate / Collect) | **2** | Only “Review time” + project click |
| Conflict clarity (risk vs opportunity) | **2** | Attention has risk; no opportunity winners |
| Money plot (make vs lose) | **0** | Ambiguous Expected Gross Profit; no losers/winners |
| People plot (overload vs spare) | **2** | Signals exist but not a chapter |
| Time plot (today vs coming) | **2** | Deadlines present; not framed as plot |
| Authority clarity (whose truth) | **0** | Profit tile blurs EWM vs Accounting |
| Emotional priority (urgency first) | **1** | Urgency below KPI wall |
| Industry-agnostic plot structure | **3** | Structure could generalise if hierarchy fixed |

**Mean storytelling score: ≈1.4 / 5** — below certification bar (≥4.0 with zero authority defects).

---

## 4. Anti-Patterns Detected

| Anti-pattern | Instance | Intelligence impact |
|--------------|----------|---------------------|
| **KPI wall** | 8 equal cards first | Forces scanning; delays decisions |
| **False climax** | Emerald “Expected Gross Profit” | Suggests success story without Accounting truth |
| **Orphan signals** | Alerts in API, not in story | Hidden plot points |
| **Stubbed plot lines** | Cash / AP empty arrays | Silent omission of money chapter |
| **CTA scatter** | Header nav vs body actions | Actions not part of narrative climax |
| **Seed as story** | Empty-state seed | OK for empty; must not replace Attention when data exists |

---

## 5. Certified Story Beats (Composition Only)

| Beat | Line the UI should enable | Owner of facts |
|------|---------------------------|----------------|
| Hook | “N items need you today — top is X” | EWM Attention |
| Pulse | “Business Health: Watch — driver is budget burn” | EWM composition |
| Work | “M active · K at risk · P pipeline” | EWM |
| Commercial | “Secured S · Pipeline T (Commercial)” | Commercial snapshot |
| Ops | “Burn at B% of operational budgets (EWM)” | EWM Costing |
| People | “O overloaded · C hours spare” | EWM Capacity |
| Money | “Cash C · AR open A · Recognised R (Accounting/Sales)” | Accounting/Sales |
| Threat | “R open risks / unacked alerts” | EWM Risk/Alerts |
| Continuity | “Last events…” | BOE |
| Proof | “Open analytics / project / books” | Cross-module |

No new calculation engines — only ordering, labelling, and composition of existing read models.

---

## 6. Forecast vs Recognition Story Rule

| Story line | Allowed language | Forbidden language |
|------------|------------------|--------------------|
| Operational | Forecast Margin (Operational) | Profit, Net Income, Earnings |
| Financial | Profit (Accounting), Recognised Revenue (Accounting) | Merging with forecast into one “total profit” |

**Current Expected Gross Profit:** fails this rule → **storytelling authority FAIL**.

---

## 7. Result

# DASHBOARD STORYTELLING NOT CERTIFIED

The surface is a **metric gallery with a side queue**, not an executive narrative that drives decisions in 30 seconds.
