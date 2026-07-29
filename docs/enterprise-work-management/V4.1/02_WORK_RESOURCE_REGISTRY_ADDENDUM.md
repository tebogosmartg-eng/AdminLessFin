# 02 — Work Resource Registry Addendum (V4.1)

**Status:** APPROVED (additive to V4.0 Resource Engine)  
**Does not reopen:** V4.0 people allocation / skills / bench model  

---

## Purpose

Everything that consumes project budget is represented as a **Work Resource**, without moving ownership of Payroll, AP, Assets, Inventory, or Expenses into EWM.

---

## Resource Classes

| Class | Cost behaviour | Approval | Integration target | Billing | Never |
|-------|----------------|----------|--------------------|---------|-------|
| permanent_employee | Labour cost fact; salary allocation | Time approval | Payroll facts only | Billable / non-billable | Compute PAYE |
| contract_employee | Labour cost fact | Time approval | Payroll facts only | Billable / non-billable | Compute PAYE |
| casual_labour | Wage input facts | Supervisor | Payroll wage input | Usually cost-only | Compute PAYE |
| temporary_labour | Wage input facts | Supervisor | Payroll wage input | Usually cost-only | Compute PAYE |
| subcontractor | Commitment + certified value | Commercial | **AP / Purchases only** | Pass-through / markup | **Payroll** |
| consultant | Commitment + certified value | Commercial | **AP / Purchases only** | Pass-through / markup | **Payroll** |
| equipment | Hire / ownership burn | Ops | Assets | Recharge | Payroll |
| vehicle | Hire / ownership burn | Ops | Assets | Recharge | Payroll |
| plant | Hire / ownership burn | Ops | Assets | Recharge | Payroll |
| tools | Hire / ownership burn | Ops | Assets | Recharge | Payroll |
| rental_equipment | Hire burn | Ops | Purchases / rentals | Recharge | Payroll |
| materials | Issue cost | Stores | Inventory | Markup optional | Payroll |
| accommodation | Claim / PO cost | Policy | Expenses / Purchases | Recoverable flags | Payroll |
| travel | Claim cost | Policy | Expenses | Recoverable flags | Payroll |
| fuel | Claim / PO cost | Policy | Expenses / Purchases | Recoverable flags | Payroll |
| other_operational | Tagged cost | Policy | Expenses / Purchases | As configured | Payroll |

---

## Data Structures (Additive)

- `ewm_resource_types` — catalogue of classes + behaviours  
- `ewm_work_resources` — company instances linking employee/vendor/asset/product refs  
- `ewm_resource_consumptions` — operational consumption facts on projects  
- Cost category rollups feed `ewm_cost_facts` / analytics — **no GL posting**

---

## Ownership Rule

EWM stores **operational consumption facts**. Owning modules remain SoT for master data and financial posting.
