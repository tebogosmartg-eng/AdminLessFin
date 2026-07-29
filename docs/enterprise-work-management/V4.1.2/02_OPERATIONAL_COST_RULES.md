# 02 — Operational Cost Rules

**Board:** Independent Principal Enterprise Business Rules Board  
**Version:** 4.1.2  
**Date:** 2026-07-13  

---

## 1. Authority

| Concern | Owner |
|---------|--------|
| Operational cost facts & rollups | **EWM Costing** |
| Rate cards (operational) | **EWM** |
| Project/portfolio operational budgets | **EWM** |
| Inventory unit cost methods | Inventory |
| Expense tax / VAT | Expenses / Accounting |
| Payslip employer cost | Payroll (read reference only) |
| Journals / recognised costs | **Accounting** |

**Hard rule:** EWM never posts journals. Accounting never recomputes EWM operational cost math. Analytics never recalculates cost — it consumes rollups.

---

## 2. Cost Fact Creation Rule

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Create immutable operational cost facts from locked delivery activity. |
| **Owner** | EWM Costing |
| **Trigger** | `work.time_locked`; `work.resource_consumed` (approved/locked consumption) |
| **Preconditions** | Source fact locked; company scope; rate or amount resolvable (or incomplete flagged) |
| **Processing Rules** | **Labour:** `labour_cost = duration_hours × resolved_operational_rate`. **Consumption:** `cost = qty × unit_cost` or certified claim amount. Attribute to Project, Client (via Engagement link if any), Department/Workspace, Cost Category derived from Resource Type. Idempotent: one primary cost fact per locked source fact. |
| **Validation Rules** | No cost fact from draft/submitted-only time; no negative qty; currency = company base unless FX adapter certified later |
| **Approval Requirements** | Upstream approval/lock only |
| **Exceptions** | Manual adjusting cost fact requires admin + reason + compensating nature |
| **Failure Behaviour** | Rate unresolved → fact status `incomplete` + alert; do not invent zero silently for labour |
| **Published Events** | Conceptual cost-fact creation feeds rollups; `work.budget_at_risk` when thresholds breach; `work.forecast_updated` |
| **Consumed Events** | `work.time_locked`, `work.resource_consumed` |
| **Audit Requirements** | Source id, rate resolution path, amounts, actor of lock |
| **Reporting Impact** | Burn, margin, department cost, client cost |
| **AI Readiness** | Explain burn drivers; never rewrite facts |
| **Integration Consumers** | Forecast, Budget, Dashboard, Accounting (read), Billing (optional recharge) |

---

## 3. Operational Rate Resolution Order

Certified order (first match wins):

1. Task override operational rate  
2. Project role rate  
3. Employee / Work Resource operational cost rate  
4. Company default role rate  

| Rule | Certification |
|------|---------------|
| Purpose | Deterministic labour costing across industries |
| Owner | EWM |
| Validation | Rates ≥ 0; missing all four → incomplete |
| Audit | Record which step resolved |
| Forbidden | Using payslip rates as silent substitute for operational rates |

---

## 4. Cost Categories (Derived)

Cost Category is derived from Resource Type catalogue (V4.1.1 Resource Model). UI must not invent conflicting free-text categories that bypass catalogue.

| Resource Type family | Operational cost basis |
|----------------------|------------------------|
| Permanent / Contract Employee | Hours × op rate |
| Temporary / Casual | Hours × op rate (ops); wage calc in Payroll |
| Subcontractor / Consultant | Certified value |
| Equipment / Vehicle / Plant / Tool | Hire/ownership burn × time/qty |
| Material | Issue qty × unit cost |
| Travel / Accommodation / Fuel | Claim/PO amount |

---

## 5. Immutability & Corrections

| Field | Certification |
|-------|---------------|
| **Processing Rules** | Locked cost facts are immutable. Corrections = compensating cost facts linked to original. Period close may freeze further compensations except admin break-glass (audited). |
| **Failure Behaviour** | Attempted update-in-place → reject |
| **Audit** | Compensation reason mandatory |

---

## 6. Budget Consumption Math

```
Budget            = operational baseline (Project/Portfolio)
Burn              = Σ locked operational cost facts
Remaining         = Budget − Burn
Burn Rate         = Burn / elapsed_planned_duration
Forecast Cost     = Burn + remaining_effort × blended_op_rate (+ known consumptions)
At-Risk           = Forecast Cost > Budget × threshold
```

| Field | Certification |
|-------|---------------|
| **Owner** | EWM |
| **Trigger** | Cost fact; budget change; forecast refresh |
| **Validation** | Single threshold formula per company |
| **Published Events** | `work.budget_at_risk` |
| **Reporting Impact** | Economics strip, alerts |
| **AI Readiness** | Re-baseline suggestions |

---

## 7. Payroll Cost Reference (Non-Owning)

| Field | Certification |
|-------|---------------|
| **Purpose** | Optionally attach employer labour cost **reference** after payroll finalization |
| **Owner of amount** | Payroll |
| **EWM behaviour** | Store `payroll_period_id` / `payroll_cost_ref` read-only; never compute PAYE/UIF/SDL/net |
| **Trigger** | Payroll period finalized (consumed) |
| **Failure Behaviour** | Missing ref → operational cost remains valid without payroll ref |

---

## 8. Rollup Rules

| Field | Certification |
|-------|---------------|
| **Purpose** | Materialize Project / Client / Department / Portfolio burn |
| **Owner** | EWM Costing |
| **Processing** | Rollups derived from cost facts; Analytics **consumes** rollups |
| **Forbidden** | Second cost engine in Analytics or Reporting builders for the same labour math |
| **Multi-company** | Rollups never cross `company_id` |

---

## 9. Integration Matrix

| Consumer | May | Must not |
|----------|-----|----------|
| Accounting | Read finalized op cost facts | Treat as journals |
| Billing | Use billable flags / recharge signals | Invent revenue recognition |
| Payroll | Ignore op rates; use input hours facts | Read op cost as payslip |
| Analytics | Display rollups | Recalculate hours×rate |
| AI | Explain | Mutate |

---

## 10. Quality Gates

| Gate | Result |
|------|--------|
| One cost fact per locked source (idempotent) | **PASS** |
| No GL posting | **PASS** |
| No payroll calc | **PASS** |
| Compensating corrections only | **PASS** |
| Industry-agnostic catalogue | **PASS** |

---

## 11. Result

**OPERATIONAL COST RULES CERTIFIED.**
