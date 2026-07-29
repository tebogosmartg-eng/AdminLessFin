# 03 — Payroll Integration Rules

**Board:** Independent Principal Enterprise Business Rules Board  
**Version:** 4.1.2  
**Date:** 2026-07-13  
**Freeze reference:** Payroll statutory engine remains FROZEN; adapter is input-facts only (V4.1 E5 change control)  

---

## 1. Integration Principle

```
EWM Time Entry (Locked)
  → EWM Payroll Adapter (input facts)
    → Payroll Engine (calculates pay)   [Payroll-owned; change-control gated]
```

| Layer | Owns |
|-------|------|
| Duration, OT **classification**, wage_input flags | EWM |
| PAYE, UIF, SDL, net, OT **pay amounts**, payslips | **Payroll** |
| Journals for payroll | Accounting (existing payroll posting path) |

---

## 2. Master Rule — Payroll Input Fact

| Field | Certification |
|-------|---------------|
| **Business Purpose** | Provide Payroll with approved hours and classification inputs without leaking calculation into EWM. |
| **Owner** | EWM Adapter for fact store; Payroll for consumption & calc |
| **Trigger** | `work.time_locked` |
| **Preconditions** | Time Entry locked; Work Resource type evaluated; company_id present |
| **Processing Rules** | Upsert payroll input fact with: employee/resource ref, hours, entry_date, OT classification flags, project/cost centre refs (informational), `wage_input` for temp/casual, `status`. |
| **Validation Rules** | See eligibility matrix; no statutory fields authored by EWM |
| **Approval Requirements** | Time approval/lock only; payroll run approval stays in Payroll |
| **Exceptions** | Compensating Time Entry → compensating input fact |
| **Failure Behaviour** | Outbox/retry; Time Entry stays locked; surface adapter failure alert |
| **Published Events** | None that redefine `payroll.*`; internal fact readiness only |
| **Consumed Events** | `work.time_locked`; Payroll period finalized (optional cost ref attach) |
| **Audit Requirements** | Eligibility decision, type snapshot, versions |
| **Reporting Impact** | Input readiness (ops); payslip reports remain Payroll-owned |
| **AI Readiness** | Flag missing OT class; never invent tax |
| **Integration Consumers** | Payroll (future wiring requires PAYROLL_CHANGE_CONTROL) |

---

## 3. Eligibility Matrix (Frozen)

| Resource Type | `payroll_eligible` | Adapter `status` | `wage_input` |
|---------------|--------------------|------------------|--------------|
| Permanent Employee | Yes | `ready` (when locked) | false (hours/allocation inputs) |
| Contract Employee | Yes | `ready` | false |
| Temporary Employee / Temporary Labour | Yes | `ready` | **true** |
| Casual Labour | Yes | `ready` | **true** |
| Subcontractor | **No** | `excluded` | false |
| Consultant | **No** | `excluded` | false |
| Equipment / Vehicle / Plant / Tool | No | `excluded` | false |
| Material / Travel / Accommodation / Fuel | No | `excluded` | false |

**Invariant:** Subcontractor/Consultant **never** payroll-ready. Attempts to force `ready` → hard reject + audit.

---

## 4. What EWM May Place on the Fact

| Allowed | Forbidden |
|---------|-----------|
| Hours / duration | PAYE / UIF / SDL / net |
| Entry dates / period keys | Payslip line generation |
| OT classification **flag** | OT **pay amount** |
| Wage_input boolean | Wage rate statutory tables |
| Cost centre / project refs (informational) | Journal lines |
| Exclusion reason | Mutation of `statutoryPayrollEngine` |

---

## 5. Overtime Classification vs Overtime Pay

| Field | Certification |
|-------|---------------|
| **Purpose** | Separate operational classification from statutory pay |
| **Owner** | Classification: EWM (Shift/Roster rules); Pay: Payroll |
| **Processing** | Time Entry may carry OT flag(s). Payroll applies legislative OT pay rules. |
| **Failure Behaviour** | Missing classification → fact ready with `ot_unclassified` warning — Payroll policy decides block vs default |
| **AI** | Suggest classification; human/payroll policy confirms |

---

## 6. Temporary / Casual Wage Inputs

| Field | Certification |
|-------|---------------|
| **Purpose** | Signal that Payroll must calculate wage from hours |
| **Processing** | `wage_input=true` on ready facts for temp/casual types |
| **Forbidden** | EWM computing wage totals as payslip authority |
| **Operational cost** | May still use operational rates for project burn — dual purpose, dual authority |

---

## 7. Period Alignment

| Field | Certification |
|-------|---------------|
| **Purpose** | Map locked time into payroll periods without EWM owning period close |
| **Owner** | Payroll owns period lifecycle |
| **Processing** | Adapter stores period key if known; else `unassigned_period` until Payroll assigns |
| **Consumed** | Payroll period finalized → optional `payroll_cost_ref` on EWM cost side |
| **Forbidden** | EWM finalizing payroll periods |

---

## 8. Change Control Gate

| Action | Allowed now (rules level) | Implementation |
|--------|---------------------------|----------------|
| Define input fact semantics | **Yes (this pack)** | N/A |
| Touch `statutoryPayrollEngine` | **No** | Requires PAYROLL_CHANGE_CONTROL |
| EWM emit payslip events | **No** | Forbidden |
| Import payroll engine into EWM | **No** | Forbidden |

---

## 9. Multi-Company / Multi-Country

- Facts are company-scoped.  
- Country affects Payroll legislation only — EWM does not embed SARS/other tax tables.  
- Timezone on source Time Entry/Clock Events preserved for audit; Payroll applies its period rules.

---

## 10. Failure & Reconciliation

| Scenario | Behaviour |
|----------|-----------|
| Adapter down | Lock succeeds; fact pending; alert |
| Type reclass after lock | No silent rewrite; compensating entry + new fact |
| Double lock replay | Idempotent upsert |
| Payroll rejects fact | Fact marked `rejected_by_payroll` with reason; EWM may require compensating time |

---

## 11. Quality Gates

| Gate | Result |
|------|--------|
| No duplicated pay calculations | **PASS** |
| No subcontractor payroll path | **PASS** |
| Freeze boundary preserved | **PASS** |
| Auditable eligibility | **PASS** |

---

## 12. Result

**PAYROLL INTEGRATION RULES CERTIFIED.**  
Payroll remains sole calculation authority. EWM remains sole operational time-fact authority for inputs.
