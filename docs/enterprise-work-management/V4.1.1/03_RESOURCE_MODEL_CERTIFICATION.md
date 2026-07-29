# 03 — Resource Model Certification

**Version:** 4.1.1  
**Verdict contribution:** Work Resource is the universal operational object  

---

## 1. Universal Object Ruling

**Work Resource is CERTIFIED as the universal operational resource object** for Enterprise Work Management.

| Layer | Owns |
|-------|------|
| HR Employee / Vendor / Fixed Asset / Product | Master identity & commercial master data |
| **Work Resource** | Operational projection used in assignments, clocking, consumptions, utilisation, operational cost |
| Payroll / AP / Inventory / Billing / Accounting | Downstream consumers per matrix — **not** re-owners of Work Resource |

No parallel “equipment booking object”, “subbie object”, or “material issue object” may reinvent lifecycle outside Work Resource + typed consumption.

---

## 2. Resource Type Catalogue (Certified)

| Resource Type | Cost calculation (operational) | Utilisation calculation | Payroll consumes? | AP consumes? | Inventory consumes? | Billing consumes? | Accounting consumes op. facts only? |
|---------------|--------------------------------|--------------------------|-------------------|--------------|---------------------|-------------------|-------------------------------------|
| Permanent Employee | Hours × operational cost rate; salary allocation flags | Available vs assigned vs actual hours | **Yes** — hours/allocation input facts | No | No | Yes if billable | Yes |
| Contract Employee | Hours × operational rate | Same | **Yes** — input facts | No | No | Yes if billable | Yes |
| Temporary Employee / Temporary Labour | Hours → **wage input facts**; Payroll calculates wage | Same | **Yes** — wage inputs | No | No | Usually cost-only | Yes |
| Casual Labour | Hours → wage input facts | Same | **Yes** — wage inputs | No | No | Usually cost-only | Yes |
| Subcontractor | Certified/consumed value (qty × rate or claim) | Optional plant/people util if tracked | **NEVER** | **Yes** | No | Pass-through/markup | Yes |
| Consultant | Same as Subcontractor | Optional | **NEVER** | **Yes** | No | Pass-through/markup | Yes |
| Equipment | Hire burn or ownership burn × time/qty | Time on assignment / available | No | If rented via vendor | No | Recharge optional | Yes |
| Vehicle | Same | Same | No | If hired | No | Recharge optional | Yes |
| Plant | Same | Same | No | If hired | No | Recharge optional | Yes |
| Tool | Same | Same | No | Optional | Optional stock | Recharge optional | Yes |
| Material | Issue qty × unit cost | N/A (consumption not utilisation) | No | If purchased | **Yes** — stock issue SoT | Markup optional | Yes |
| Accommodation | Claim/PO amount | N/A | No | / Expenses | No | Recoverable flag | Yes |
| Travel | Claim amount | N/A | No | Expenses | No | Recoverable flag | Yes |
| Fuel | Claim/PO amount | N/A | No | / Expenses | Optional | Recoverable flag | Yes |

---

## 3. Ownership Anti-Duplication

| Concept | Single owner |
|---------|--------------|
| Employee identity / employment type | HR |
| Vendor / subcontractor commercial terms | Purchases/Vendors |
| Asset register | Assets |
| Stock on hand | Inventory |
| Operational assignment & consumption facts | **EWM Work Resource** |
| Payslip amounts | Payroll |
| AP invoices | Purchases/Bills |
| GL balances | Accounting |

---

## 4. Lifecycle (Work Resource)

`active` → `inactive` → `archived`

Inactive resources cannot receive new Assignments or Clock Sessions. Historical consumptions remain.

---

## 5. Invariants

1. Every budget-consuming operational use references a Work Resource **or** a Time Entry linked to an eligible people resource.  
2. `payroll_eligible=false` types **cannot** emit `ewm_payroll_input_facts.status=ready`.  
3. Cost Category is derived from Resource Type — UI must not invent conflicting categories.  
4. Master deletes in HR/Assets soft-break Work Resource links; do not cascade-destroy locked cost facts.

---

## 6. Events

| Event | When |
|-------|------|
| `work.resource_registered` | Work Resource created |
| `work.resource_assigned` | Assignment confirmed |
| `work.resource_consumed` | Consumption approved/locked |
| `work.capacity_overload` | Utilisation breach |

---

## 7. Certification Result

**RESOURCE MODEL CERTIFIED.** Work Resource is universal; typed behaviours are catalogue-driven; freeze modules remain sole authorities for their financial calculations.
