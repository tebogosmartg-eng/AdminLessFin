# 05 — VIP Report Architecture Report

**Version:** 3.6.4  
**Module:** `src/reporting/audit/VIP`

## 1. Classification

VIP is an **Audit Report** (compliance category), not a register replacement.

## 2. Shape

- **Rows:** Employee → Payroll Item (registry-driven)
- **Columns:** Mar…Feb + Annual Total (SA FY)
- **Header:** Employee Number, First Name, Surname, Department, Position, Cost Centre, Employment Status

## 3. Source

`buildVipReportFromFacts(facts)` — Payroll Facts only. Measures via `measureFactItemAmount` (engine_results preferred for statutory). No payroll calculations.

## 4. UI / export

`/audit-compliance-reports` · CSV / Excel / PDF via platform exporters · registry id `payroll.compliance.vip`

## 5. Verdict

**CERTIFIED** — VIP consumes Payroll Facts exclusively.

> **Superseded (layout/presentation):** V3.6.5 corrects VIP from a flat matrix-style table to an employee-first annual working paper and adds export branding. See `docs/certification/V3.6.5/`.
