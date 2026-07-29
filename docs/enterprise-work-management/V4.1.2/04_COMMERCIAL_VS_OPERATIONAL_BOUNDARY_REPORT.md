# 04 — Commercial vs Operational Boundary Report

**Board:** Independent Principal Enterprise Business Rules Board  
**Version:** 4.1.2  
**Date:** 2026-07-13  

---

## 1. Executive Ruling

Enterprise Work Management owns **operational execution and operational intelligence**.  
Sales/Engagement owns **commercial instruments and billing**.  
Accounting owns **financial recognition**.  

These three planes must remain separately labelled on every executive surface.

---

## 2. Boundary Map

| Concept | Commercial plane | Operational plane (EWM) | Financial plane (Accounting) |
|---------|------------------|-------------------------|------------------------------|
| Customer relationship | Engagement / Sales | Link metadata on Project | AR customer |
| Contract Value | Contract/Engagement SoT | Snapshot on Project | N/A (memo) until recognised |
| Approved Variations | Commercial approval | Snapshot refresh only | Per recognition policy |
| Billable rates | Engagement/Sales | May display; billing bridge uses commercial rates | — |
| Time for billing | Timesheet projection target = Engagement | Locked billable Time Entry | — |
| Invoices | Sales | Read unbilled signal | Revenue/AR per Accounting |
| Recognised Revenue | — | **Display only** | **SoT** |
| Operational Costs | — | **SoT** | May journal from other sources; does not redefine EWM facts |
| Forecast Margin | — | **SoT (ops)** | Must not be called Recognised Profit |
| Net Profit (FS) | — | Display GL only | **SoT** |
| Subcontractor claims | PO/AP commercial | Consumption cost facts | AP/GL |
| Payroll | — | Input hours facts | Payroll journals via Payroll path |

---

## 3. Certified Boundary Rules

### BR-BND-01 — Engagement Link

| Field | Certification |
|-------|---------------|
| **Purpose** | Prevent EWM from replacing commercial engagement |
| **Owner** | Engagement SoT; EWM link |
| **Processing** | Invoice generation requires Engagement; internal projects may omit link |
| **Failure** | Block billing bridge if link missing for billable intent |
| **Events** | Consumed: engagement updated; Published: `work.project_linked` |

### BR-BND-02 — Contract Snapshot Non-SoT

| Field | Certification |
|-------|---------------|
| **Purpose** | Ops economics without commercial takeover |
| **Processing** | Snapshot increases only after commercial variation approve |
| **Forbidden** | EWM editing Contract Value as master |
| **Audit** | Snapshot diffs + commercial reference |

### BR-BND-03 — Dual Profit Labelling

| Field | Certification |
|-------|---------------|
| **Purpose** | Eliminate ambiguous “Profit” widgets |
| **Processing** | Every surface labels “Recognised (Accounting)” vs “Operational / Forecast (EWM)” |
| **Failure** | Non-conforming UI/report rejected at Implementation Approval |
| **AI** | Narratives must include authority labels |

### BR-BND-04 — No EWM Revenue Recognition Entity

| Field | Certification |
|-------|---------------|
| **Purpose** | Preserve Accounting ownership |
| **Ruling** | Revenue Recognition is **not** an EWM entity (V4.1.1) |
| **Forbidden** | EWM posting `journal.*` or recognising revenue |

### BR-BND-05 — Billing Bridge Direction

| Field | Certification |
|-------|---------------|
| **Purpose** | One path from ops time to commercial billing |
| **Processing** | Locked billable EWM time → timesheet/billing projection on Engagement |
| **Forbidden** | Second billing engine inside EWM Costing |

### BR-BND-06 — Unbilled ≠ Recognised

| Field | Certification |
|-------|---------------|
| **Purpose** | Protect financial statements from ops signals |
| **Processing** | Unbilled completed work is operational/billing signal only |
| **Reporting** | Show beside Recognised Revenue, never summed into it |

---

## 4. Conflict Resolutions

| Conflict | Winner | Loser behaviour |
|----------|--------|-----------------|
| Contract value mismatch snapshot vs commercial | Commercial SoT | Refresh snapshot; flag stale |
| Billable rate in EWM vs Engagement | Engagement | EWM display may lag until refresh |
| Op margin vs GL profit | Both valid | Separate labels |
| Job entity vs Project | Project stereotype | No Job table |
| Work entity vs Project | Abstract Work | No Work table |

---

## 5. Industry Agnostic Proof

| Industry | Commercial | Operational |
|----------|------------|-------------|
| Professional services | Engagement retainers | Project/Task time |
| Construction | Contract + variations | Job stereotype Project + materials/plant |
| Industrial maintenance | Work orders as Jobs | Equipment + labour consumptions |
| Government programmes | Programme funding commercial codes outside EWM | Programme → Projects delivery |

Same rule pack; configuration/stereotypes only.

---

## 6. Quality Gates

| Gate | Result |
|------|--------|
| No duplicated commercial SoT in EWM | **PASS** |
| No GL posting from EWM | **PASS** |
| Dual-authority profitability | **PASS** |
| Auditable snapshot | **PASS** |

---

## 7. Result

**COMMERCIAL VS OPERATIONAL BOUNDARY CERTIFIED.**
