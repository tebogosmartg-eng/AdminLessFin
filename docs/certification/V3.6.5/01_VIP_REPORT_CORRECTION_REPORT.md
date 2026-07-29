# 01 — VIP Report Correction Report

**Version:** 3.6.5  
**Module:** `src/reporting/audit/VIP`  
**Product:** AdminLess Fin

## 1. Defect

The prior VIP UI/export rendered a **flat identity-repeated matrix** (employee columns on every payroll-component row). That presentation read as a Payroll Matrix and was **not** the approved annual employee working paper.

## 2. Correction

VIP is now an **employee-first working paper**:

1. Group by employee (sorted by employee number).
2. Print identity once per employee:
   - Employee Number, Employee Name, Employee Surname, Department, Position, Cost Centre, Employment Status
3. Immediately below: **Payroll Item** × March–February + **Annual Total**
4. Each employee starts a new section (UI card, PDF page break, Excel Working Paper block).

Column rename: `Payroll Component` → `Payroll Item`.

## 3. Implementation

| Surface | Change |
|---------|--------|
| Builder | `buildVipReportFromFacts` emits `sections[]` + `detailRows` + `itemColumns` |
| Helpers | `vipReportSections`, `vipReportToDetailRows` (`vipReportToRows` aliases detail) |
| UI | `/audit-compliance-reports` renders sectioned layout |
| Registry | `payroll.compliance.vip` meta includes `layout: employee-first-working-paper` |

## 4. Source boundary (unchanged)

- Consumes immutable **Payroll Facts** only via existing loaders/measures.
- No Payroll Engine, Facts model, Register, calculation, Accounting, or Statutory Return changes.
- Management Payroll Matrix remains a separate metric-first report on `/payroll-reports`.

## 5. Annual totals

Annual Total per payroll item = sum of SA FY month columns (Mar–Feb) for that employee/item. Rounding: 2 dp. Verified in unit tests.

## 6. Verdict

**CORRECTED / CERTIFIED** — Enterprise VIP Report is an auditor-ready employee-first annual working paper.

> **Superseded (architecture):** V3.6.6 restructures VIP into a dedicated audit working-paper module with owned export pipeline and expanded audit sections. See `docs/certification/V3.6.6/`.
