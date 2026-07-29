# 04 — Alert Threshold Catalogue

**Board:** Independent Principal Enterprise Performance Management Board  
**Version:** 4.1.5  
**Date:** 2026-07-13  

Thresholds are **configuration**, not alternate KPI definitions. Engines own evaluation; dashboards display resulting alerts. Industry packs may override defaults within certified bands.

---

## 1. Threshold Records

| Threshold ID | KPI | Default warning | Default critical | Evaluation owner | Escalation |
|--------------|-----|-----------------|------------------|------------------|------------|
| `THR-EXE-01` | EXE-01 | Depth ≥ 5 | Depth ≥ 12 or any critical item | EWM Analytics | Attention first |
| `THR-EXE-02` | EXE-02 | Status = watch | Status = crisis | EWM Analytics | Notify exec role |
| `THR-EXE-04` | EXE-04 | Loss-makers ≥ 1 | Loss-makers ≥ 3 or margin < −10% policy | EWM Forecast | Margin risk |
| `THR-EXE-05` | EXE-05 | ≥ 1 Accounting loss project | ≥ 3 or materiality % of revenue | Accounting (signal) | FD attention |
| `THR-OPS-02` | OPS-02 | Burn rate +25% vs 4-wk avg | +50% | EWM Costing | Ops review |
| `THR-OPS-04` | OPS-04 / PRJ-01 | Burn % ≥ **85%** | Burn % ≥ **100%** | EWM Budget/Costing | `work.budget_at_risk` |
| `THR-PRJ-04` | PRJ-04 | Any overdue | Overdue > 7 days or count ≥ 3 | EWM Milestones | Schedule escalate |
| `THR-CAP-01` | CAP-01 | Utilisation ≥ 90% | ≥ 100% portfolio | EWM Capacity | Capacity plan |
| `THR-CAP-03` | CAP-03 / RES-02 | Utilisation > 100% | ≥ 120% | EWM Capacity | Reallocate |
| `THR-CAP-04` | CAP-04 | Idle ratio < 20% (flag idle) | Idle pool > 30% of available hours | EWM Capacity | Fill bench |
| `THR-CLK-01` | CLK-01 | Open sessions > expected shift count | Orphans after policy window | EWM Clocking | CLK-02 |
| `THR-CLK-02` | CLK-02 | ≥ 1 missing clock-out | ≥ 5 or > 24h open | EWM Clocking | Attention |
| `THR-PAY-01` | PAY-01 | Pending ≥ 1 | Ageing > 48h or count ≥ 20 | EWM Time | Approver notify |
| `THR-PAY-02` | PAY-02 | Ready hours < expected payroll cut-off | Zero ready at cut-off −1d | EWM Adapter | Payroll ops |
| `THR-SAL-02` | SAL-02 | AR > policy days outstanding | AR critical ageing bucket | Sales/Accounting | Collections |
| `THR-SAL-03` | SAL-03 | Unbilled > 7 days | Unbilled > 14 days or material value | EWM Billing signal | Issue invoice CTA |
| `THR-ACC-03` | ACC-03 | Below operating cash buffer | Below critical buffer | Accounting | FD |
| `THR-ACC-04` | ACC-04 | AP due ≤ 7 days material | Overdue AP | Accounting | Pay run |
| `THR-RSK-01` | RSK-01 | Score ≥ medium band | Score ≥ high / any critical risk | EWM Risk | Risk board |
| `THR-RSK-02` | RSK-02 | Unacked ≥ 1 | Unacked ≥ 5 or age > 24h | EWM Alerts | Escalate |
| `THR-CLI-01` | CLI-01 | ≥ 1 client | ≥ 5 clients or strategic client flag | EWM Analytics | MD/Owner |
| `THR-PRD-01` | PRD-01 | Billable ratio < industry default (e.g. 60%) | < 40% | EWM Time | Ops review |
| `THR-FCT-03` | FCT-03 | Margin < 10% (policy) | Margin < 0 | EWM Forecast | `ai.work.margin_risk` |

---

## 2. Threshold Governance Rules

1. Changing a threshold does **not** create a new KPI ID.  
2. Defaults above are **certified baselines**; company may tighten within governance.  
3. Loosening beyond critical bands requires admin + audit reason.  
4. Alerts must reference `Threshold ID` + `KPI ID` in payload.  
5. Dashboard must not invent parallel thresholds.  
6. AI may propose threshold changes; humans approve.

---

## 3. Result

**ALERT THRESHOLD CATALOGUE CERTIFIED.**
