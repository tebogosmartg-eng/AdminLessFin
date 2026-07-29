# 06 — Business Invariants Report

**Version:** 4.1.1  

---

## 1. Enterprise Invariants — Verification

| Invariant | Status | Ruling |
|-----------|--------|--------|
| One source of truth per concept | **PASS** | See ownership map below |
| One owner per business concept | **PASS** | EWM / Sales / HR / Payroll / Accounting / DMS / Platform |
| No duplicated calculations | **PASS** | Duration→Time Engine; Op cost→Costing; PAYE→Payroll; GL→Accounting; Analytics aggregates only |
| No duplicated workflows | **PASS** | Single Time Entry lifecycle; Clocking is channel only |
| No duplicated approvals | **PASS** | Shared Approval pattern; Payroll approvals stay in Payroll |
| No duplicated audit trails | **PASS** | EWM audit for EWM objects; module audits remain in owning modules |
| No duplicated reporting ownership | **PASS** | EWM report pack additive; locked payroll/VIP builders untouched |

---

## 2. Source-of-Truth Map

| Concept | Single SoT |
|---------|------------|
| Company tenancy | Platform |
| Employee identity | HR |
| Vendor | Purchases |
| Asset | Assets |
| Inventory qty | Inventory |
| Engagement / billable project | Projects/Sales |
| Contract commercial value | Sales/CRM or Engagement |
| Operational Project hierarchy | EWM |
| Work Resource operational projection | EWM |
| Time duration & time status | EWM Time Engine |
| Operational cost facts | EWM Costing |
| Capacity / utilisation | EWM Capacity |
| Objectives / KPIs | EWM OKR |
| Payslip / statutory | Payroll |
| Journals / recognised revenue | Accounting |
| Document bytes | DMS |
| Notification delivery | Platform |

---

## 3. Hard Invariants (Must Hold in Any Future Implementation)

1. **Time belongs to work context** — no orphan employee-only enterprise time as SoT.  
2. **Locked facts are immutable** — corrections are compensating entries.  
3. **Subcontractor/Consultant never payroll-ready.**  
4. **EWM never posts journals.**  
5. **EWM never calculates PAYE/UIF/SDL/net.**  
6. **Job ≠ separate entity** — Project stereotype only.  
7. **Work ≠ persisted entity.**  
8. **Revenue Recognition ≠ EWM entity.**  
9. **Forecast Margin must not be labelled Recognised Profit.**  
10. **One open Clock Session per employee per company.**  

---

## 4. Draft Implementation Warning

Any draft migration/API/UI that violates the above is **non-conforming** and must be reconciled before Implementation Approval.

---

## 5. Result

**INVARIANTS CERTIFIED.**
