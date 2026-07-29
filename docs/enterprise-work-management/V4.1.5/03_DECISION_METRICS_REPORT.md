# 03 — Decision Metrics Report

**Board:** Independent Principal Enterprise Performance Management Board  
**Version:** 4.1.5  
**Date:** 2026-07-13  

Maps executive decision questions (V4.1.4) to certified KPI IDs. Decision metrics are catalogue KPIs used for decisions — not a second definition set.

---

## 1. Decision → KPI Binding

| Decision question | Primary KPI(s) | Supporting KPI(s) | Decision enabled |
|-------------------|----------------|-------------------|------------------|
| What requires my attention today? | EXE-01 | RSK-02, PAY-01, CLK-02 | Prioritise interventions |
| Which work is at risk? | OPS-04, PRJ-04, RSK-01 | PRJ-01, EXE-02 | Intervene on delivery/cost |
| Where are we making money? | EXE-03, FCT-03, ACC-02 | COM-04, SAL-01, ACC-01 | Protect/expand winners (dual lens) |
| Where are we losing money? | EXE-04, EXE-05, FCT-03, ACC-02 | PRJ-03 | Correct / escalate losers |
| Which clients need attention? | CLI-01 | SAL-02, SAL-03, OPS-04 | Client follow-up |
| Which teams are overloaded? | CAP-03, RES-02 | CAP-01 | Rebalance |
| Which teams have capacity? | CAP-02, CAP-04 | RES-01 | Allocate |
| Which invoices should be issued? | SAL-03 | SAL-01, COM-01 | Trigger Sales billing |
| Which payments are outstanding? | SAL-02, ACC-04 | ACC-03 | Collect / pay |
| Which payroll approvals are outstanding? | PAY-01 | PAY-02 | Approve time → adapter |

---

## 2. Persona Decision Metric Sets

| Persona | Must-load KPI set (≤30s) |
|---------|--------------------------|
| **CEO / MD / Owner** | EXE-01, EXE-02, EXE-03, EXE-04, EXE-05, CLI-01, ACC-03, SAL-02 |
| **Operations Director** | EXE-01, OPS-03, OPS-04, CAP-03, CAP-04, CLK-01, CLK-02, PAY-01 |
| **Financial Director** | ACC-01, ACC-02, ACC-03, ACC-04, SAL-01, SAL-02, FCT-03 (labelled), PAY-02 |
| **Project Director** | EXE-01, PRJ-01, PRJ-02, PRJ-03, PRJ-04, CAP-03, FCT-01 |

---

## 3. Dual-Authority Decision Rule

When a decision mentions “money”:

| Lens | KPI | Label required |
|------|-----|----------------|
| Operational | FCT-03 / EXE-03 / EXE-04 | `(Operational)` / Forecast |
| Financial | ACC-02 / EXE-05 / ACC-01 | `(Accounting)` |

Presenting only one lens without label is a **catalogue violation**.

---

## 4. Non-Decision Metrics

KPIs may appear in reports without being executive decision metrics (e.g. CLK-03, PRD-02, PAY-03/04 on payroll surfaces). They remain catalogue-bound.

---

## 5. Result

**DECISION METRICS REPORT CERTIFIED** — every V4.1.4 decision question binds to one or more V4.1.5 KPI IDs with a single owner each.
