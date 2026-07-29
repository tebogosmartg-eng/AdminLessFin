# 05 — Executive Dashboard Rules

**Board:** Independent Principal Enterprise Business Rules Board  
**Version:** 4.1.2  
**Date:** 2026-07-13  

---

## 1. Purpose

Define what executives may see, which authority owns each metric, and how Command Centre / Portfolio / Economics surfaces must behave — without creating a parallel calculation engine.

---

## 2. Dashboard Composition Rule

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Single executive view composing **read models** from owning engines |
| **Owner** | EWM Analytics composition for ops widgets; Accounting/Sales for financial/commercial widgets |
| **Trigger** | User open; `work.*` / commercial / accounting read refresh |
| **Preconditions** | Company scope; role entitlements |
| **Processing Rules** | Dashboards **consume** rollups and certified metrics; they do not recompute hours×rate, PAYE, or recognition. Widgets fail independently. |
| **Validation Rules** | Every money widget declares authority label |
| **Approval Requirements** | N/A |
| **Exceptions** | None for labelling |
| **Failure Behaviour** | Show widget error; never fabricate zeros that imply health |
| **Published Events** | None |
| **Consumed Events** | Forecast, budget, capacity, milestone, risk, invoice/recognition reads |
| **Audit Requirements** | Access audit per platform norms; drill-through actions audit in owners |
| **Reporting Impact** | Executive pack; portfolio pack |
| **AI Readiness** | Rank attention items; cite metric authorities |
| **Integration Consumers** | Notifications (from alerts), Reporting exports |

---

## 3. Certified Metric Catalogue

| Metric | Authority | Dashboard label (mandatory) | Source |
|--------|-----------|-----------------------------|--------|
| Contract Value | Commercial | Contract Value (Commercial) | Snapshot ← commercial SoT |
| Approved Variations | Commercial | Approved Variations (Commercial) | Snapshot |
| Recognised Revenue | Accounting | Recognised Revenue (Accounting) | GL/read model |
| Invoiced (period) | Sales | Invoiced (Sales) | Sales |
| Unbilled operational | EWM/Billing signal | Unbilled Work (Operational) | Locked billable − invoiced signal |
| Operational Cost (Burn) | EWM | Operational Cost (EWM) | Cost rollups |
| Forecast Cost | EWM | Forecast Cost (EWM) | Forecast engine |
| Forecast Revenue | EWM | Forecast Revenue (Operational — not recognised) | Forecast engine |
| Forecast Margin | EWM | Forecast Margin (Operational) | Forecast engine |
| Net Profit / FS Profit | Accounting | Profit (Accounting) | GL |
| Capacity overload count | EWM | Capacity Overloads | Capacity |
| Budget at risk count | EWM | Budgets at Risk | Costing |
| Open risks (score) | EWM | Delivery Risk | Risk |
| Approval backlog | EWM | Approvals Ageing | Approval pattern |
| Payroll input ready hours | EWM adapter | Payroll Inputs Ready (not payslip) | Adapter facts |

**Forbidden widget:** single tile named “Profit” or “Margin” without authority qualifier.

---

## 4. Command Centre Rules (Executive Ops)

| Field | Certification |
|-------|---------------|
| **Purpose** | Actionable today-view for delivery control |
| **Owner** | EWM |
| **Processing** | Queues: approvals, missing clock-outs, overloads, at-risk budgets, open escalations. Actions invoke owning workflows (no bypass). |
| **AI** | `ai.work.daily_focus` ranking only |
| **Failure** | Partial panel isolation |

---

## 5. Portfolio Health Rules

| Field | Certification |
|-------|---------------|
| **Purpose** | Roll up Project Health without new cost math |
| **Owner** | EWM composition |
| **Processing** | Aggregate health drivers from Project Health Rules; concentration risk = value/burn concentration statistics on snapshots + burn |
| **Validation** | Company-scoped aggregation only |
| **AI** | `ai.work.margin_risk` with labels |

---

## 6. Economics Strip Rules

| Field | Certification |
|-------|---------------|
| **Purpose** | Side-by-side commercial vs operational vs financial |
| **Processing** | Fixed order recommended: Contract Value → Variations → Recognised Revenue → Op Cost → Forecast Margin → Accounting Profit |
| **Invariant** | No arithmetic that adds Recognised Revenue to Forecast Revenue into one “total revenue” without explicit dual-series chart |

---

## 7. Alert & Escalation Presentation

| Field | Certification |
|-------|---------------|
| **Purpose** | Surface Alerts/Escalations without resolving facts in the dashboard |
| **Processing** | Acknowledge/resolve calls Alert Rules; escalate calls Escalation Rules |
| **Forbidden** | Dashboard auto-approving time or auto-locking |

---

## 8. Multi-Company / Multi-Country

- Default view = active company context.  
- Cross-company executive rollup only if Platform grants explicit multi-company role — still no cross-company mutation.  
- Currency display uses company currency adapters; no silent FX invent in EWM.

---

## 9. Export / Reporting Impact

- Additive `work` executive reports only.  
- Locked payroll/VIP report builders untouched.  
- Exports must carry authority labels in column headers.

---

## 10. Quality Gates

| Gate | Result |
|------|--------|
| No duplicated calculations | **PASS** |
| Dual-authority labelling | **PASS** |
| AI non-mutating | **PASS** |
| Industry agnostic widgets | **PASS** |

---

## 11. Result

**EXECUTIVE DASHBOARD RULES CERTIFIED.**
