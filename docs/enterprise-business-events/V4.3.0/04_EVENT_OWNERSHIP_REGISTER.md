# 04 — Event Ownership Register

**Version:** 4.3.0  
**Status:** CERTIFIED  

| Namespace | Owner module | Change control | Notes |
|-----------|--------------|----------------|-------|
| `work.*` | Enterprise Work Management | Additive under EWM boards | Must not redefine frozen finance events |
| `payroll.*` | Payroll | **FROZEN** | Statutory path unchanged |
| `journal.*` / `period.*` | Accounting | **FROZEN** | GL SoT |
| `asset.*` | Fixed Assets (+ Accounting for post) | Controlled | `asset.depreciated` posts via Accounting |
| `customer.*` | CRM | Controlled | Master data |
| `quote.*` / `invoice.*` / `payment.*` | Sales / AR | Controlled | Commercial SoT |
| `vendor.*` / `purchase_order.*` / `bill.*` | Procurement / AP | Controlled | |
| `inventory.*` | Inventory | Controlled | Stock qty SoT |
| `report.*` | Reporting | Controlled | Signals only; KPI SoT = V4.1.5 |
| `notification.*` | Platform Notifications | Controlled | Delivery plane |
| `ai.*` | AI Advisory | Controlled | Non-mutating only |
| `document.*` | Document Platform | Controlled | Artefact plane |
| `approval.*` | Approvals Platform | Controlled | Gate plane |

### Amendment rule

New Event IDs require:

1. Ownership Register row (or namespace amendment)  
2. Catalogue entry with full contract fields  
3. Publisher Matrix update  
4. Consumer Matrix update  
5. Circular-dependency scan  

Silent Event ID reuse or dual ownership is **non-compliant**.
