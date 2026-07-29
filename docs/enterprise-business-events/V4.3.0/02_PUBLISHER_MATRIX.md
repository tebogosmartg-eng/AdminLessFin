# 02 — Publisher Matrix

**Version:** 4.3.0  
**Status:** CERTIFIED  

Rule: **Exactly one publisher module per Event ID.**

| Publisher Module | Event IDs (owned) | Must not publish |
|------------------|-------------------|------------------|
| EWM | All `work.*` | `journal.*`, `payroll.*` calc/payslip, `invoice.*`, `payment.*` |
| Payroll | `payroll.run_created`, `payroll.payslips_generated`, `payroll.approved`, `payroll.processed`, `payroll.bank_file_generated`, `payroll.distributed` | `work.time_locked` (consumes only), foreign GL events except via accounting outcome of process |
| Accounting | `journal.posted`, `period.closed` | Operational EWM cost facts as GL |
| Fixed Assets | `asset.registered`, `asset.disposed`; depreciation outcome as `asset.depreciated` | Stock SoT events |
| CRM | `customer.created`, `customer.updated` | Invoice posting without Sales |
| Sales / AR | `quote.*`, `invoice.*`, `payment.received` | `journal.posted` (Accounting publishes) |
| Procurement / AP | `vendor.created`, `purchase_order.*`, `bill.*` | Inventory qty SoT |
| Inventory | `inventory.*` | EWM consumption lock |
| Reporting | `report.pack_generated`, `report.snapshot_taken` | Domain mutating events |
| Platform Notifications | `notification.*` | Domain facts |
| AI Advisory | `ai.insight_generated`, `ai.recommendation_issued` | Any mutating domain / approval auto-grant |
| Document Platform | `document.generated`, `document.distributed` | Domain state transitions |
| Approvals Platform | `approval.requested`, `approval.granted`, `approval.rejected` | Subject entity mutation (subject domain resumes) |

### Publisher integrity gates

| Gate | Result |
|------|--------|
| One publisher per event | **PASS** |
| No dual-owned IDs | **PASS** |
| Freeze namespaces respected | **PASS** |
