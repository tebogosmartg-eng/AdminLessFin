# 04 — Consumer Matrix

**Pillar:** Enterprise Governance & Compliance Platform (EGCP)  
**Version:** 5.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Governance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Prove that every major enterprise module **consumes** EGCP services and does not embed governance truth.

---

## 2. Consumption Modes

| Mode | Meaning |
|------|---------|
| **R** | Resolve — read versioned rules / calendar / obligations |
| **E** | Evaluate — compliance or DoA decision |
| **W** | Write-back — register evidence, exceptions, acknowledgements |
| **S** | Subscribe — react to `gov.*` events |
| **—** | Not applicable |

---

## 3. Module × Domain Matrix

| Consumer | Legislation | Compliance | Policy | DoA | Calendar | Obligations | Risk/Control | Intelligence | Gov Reporting | Audit Ready | Evidence | Control Test | Exceptions |
|----------|:-----------:|:----------:|:------:|:---:|:--------:|:-----------:|:------------:|:------------:|:-------------:|:-----------:|:--------:|:------------:|:----------:|
| Accounting | R | E | R/E | E | R | R/S | R | S | S | S | W | — | E/W |
| Payroll | R | E | R | E | R/S | R/S | R | S | S | S | W | — | E/W |
| Procurement | R | E | R/E | E | R | R | R | S | S | S | W | — | E/W |
| HR | R | E | R/E | E | R | R | R | S | S | S | W | — | E/W |
| Enterprise Work Management | R | E | R/E | E | R/S | R | R/W* | S | S | S | W | — | E/W |
| Statutory Returns | R | E | — | E | R/S | R/W | R | S | S | S | W | — | E/W |
| Document Management | — | — | R | E | — | — | — | — | — | — | W† | — | — |
| Reporting Platform | R | R | R | — | R | R | R | R | W | R | R | R | R |
| Internal Audit (persona) | R | R | R | R | R | R | R | R | R | E/W | R/W | E/W | R |
| Executive / Board (persona) | — | — | R | R | R | R | R | R | R | R | — | — | R |

\* EWM may **map** operational risks into EGCP Risk Library; it does not own the library.  
† DMS stores blobs; EGCP Evidence Repository owns custody metadata.

---

## 4. Verification Targets (mission checklist)

| Requirement | How satisfied |
|-------------|----------------|
| Accounting consumes governance | R/E/W across Legislation, Policy, DoA, Calendar, Obligations, Evidence, Exceptions |
| Payroll consumes governance | Legislation resolve + DoA + Calendar + Obligations; formulas remain payroll-owned |
| Procurement consumes governance | Policy + DoA + Compliance + Evidence |
| HR consumes governance | Labour legislation refs + Policy + DoA |
| EWM consumes governance | DoA + Policy + Calendar milestones + Risk mapping |
| No duplicated legislation | Boundaries §4 + Domain Model anti-duplication |
| No duplicated approval rules | DoA sole owner of matrices |
| No duplicated statutory calendars | Calendar sole owner of deadlines |
| Multi-country ready | Country-first Legislation model |
| Versioned legislation | LegislationVersion aggregate |
| Fully auditable | Evidence + evaluations + `gov.*` events |

---

## 5. Critical Decision Points (by consumer)

| Consumer | Decision point | EGCP services |
|----------|----------------|---------------|
| Accounting | Post journal / release payment | DoA + Policy + Evidence |
| Accounting | VAT/tax period close | Calendar + Obligations + Compliance |
| Payroll | Run calculate | Legislation resolve (adapter) |
| Payroll | Finalise / pay | DoA + Obligations window + Evidence |
| Procurement | Approve PO / contract | Policy thresholds + DoA + Exceptions |
| HR | Approve offer / termination | Policy + DoA + labour legislation refs |
| EWM | Approve time lock / budget change | DoA + Policy |
| EWM | Compliance milestone tracking | Calendar + Obligations (read) |
| Statutory Returns | Submit EMP201 / IRP5 / etc. | Obligations + Calendar + Evidence + DoA |

---

## 6. Non-Consumers (explicit)

| System | Reason |
|--------|--------|
| V4.4.0 Evolution Governance | Orthogonal product change control — not a runtime consumer |
| Raw database triggers in frozen modules | Must not become shadow governance engines |

---

## 7. Certification

Consumer Matrix is **CERTIFIED**. Implementation designs must cite this matrix for every module touchpoint.
