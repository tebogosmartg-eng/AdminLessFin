# 03 — Governance Boundaries

**Pillar:** Enterprise Governance & Compliance Platform (EGCP)  
**Version:** 5.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Governance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Hard-bound what EGCP **owns**, what it **consumes**, and what it **must never own**, so consumer modules cannot re-absorb legislative or policy truth.

---

## 2. Boundary Statement

> EGCP owns **rules of constraint, authorisation, obligation, assurance, and evidence custody**.  
> Operational modules own **execution**.  
> Accounting owns **books**.  
> Payroll owns **calculation & payslip facts** (formulas frozen).  
> V4.4.0 owns **how the product may evolve**.

---

## 3. Owns / Must Not Own Matrix

| Domain | Owns | Must not own |
|--------|------|--------------|
| Legislation Repository | Versioned legislative content, provenance, resolution by date/country/domain | Calculation algorithms, journals, employee tax status workflows |
| Compliance Engine | Evaluation contracts & sealed results | Transaction posting, return generation |
| Policy Engine | Internal policy catalogue & versions | Employment contracts, GL accounts |
| DoA Engine | Authority matrices, evaluations, decision records | Module UI workflows, identity provisioning |
| Statutory Calendar | Deadlines & recurrence | Filing payloads (EMP201/IRP5/VAT returns) |
| Regulatory Obligations | Obligation instances & status | Regulator gateway transport |
| Risk & Control Library | Risk/control taxonomy & mappings | EWM delivery risk execution (may map) |
| Compliance Intelligence | Derived posture & alerts | Source data mutation |
| Governance Reporting | Governance report pack & certification metadata | Financial statements, VIP payroll packs |
| Audit Readiness | Readiness score, gaps, workpaper index | External audit opinions |
| Evidence Repository | Custody ledger, seals, retention class | Binary blob storage product (uses DMS) |
| Control Testing | Plans, results, remediation status | Production process execution |
| Exception Management | Waiver/breach lifecycle | Illegal override of mandatory legislation |

---

## 4. Consumer Module Boundaries

### 4.1 Accounting

| May | Must not |
|-----|----------|
| Request DoA for journals/payments | Embed approval limits |
| Resolve tax treatment references from Legislation | Duplicate VAT/rate tables as SoT |
| Attach evidence to postings | Own statutory calendar |
| Consume obligation status for tax filings | Define enterprise policy outside Policy Engine |

### 4.2 Payroll

| May | Must not |
|-----|----------|
| Resolve legislation snapshot via EGCP adapter | Own SARS constants as module SoT |
| Request DoA for finalise/payment | Local DoA tables |
| Bind runs to obligations & calendar windows | Hardcode EMP201/EMP501 dates |
| Preserve frozen calculation formulas | Change formulas under “governance” pretext |

### 4.3 Procurement

| May | Must not |
|-----|----------|
| Evaluate policy + DoA on PR/PO/contract | Embed threshold matrices |
| Link supplier compliance obligations | Private compliance rule engines |
| Register evidence of quotes/approvals | Bypass Exception Management |

### 4.4 HR

| May | Must not |
|-----|----------|
| Consume policy & labour legislation references | Fork BCEA/leave rule constants as SoT |
| Use DoA for offers, terminations, grade changes | Shadow approval chains |
| Own employee identity & employment facts | Own enterprise DoA |

### 4.5 Enterprise Work Management

| May | Must not |
|-----|----------|
| Use DoA for budget/allocation/time lock approvals | Local approval limit engine as SoT |
| Map operational risks to EGCP Risk Library | Replace EGCP Risk Library |
| Surface compliance milestones from Calendar | Maintain separate statutory calendar |
| Emit `work.*` events only | Emit governance decisions as `work.*` |

---

## 5. Cross-Pillar Boundary with V4.4.0

| Concern | Owner |
|---------|-------|
| Changing EGCP architecture after certification | V4.4.0 Architecture / Breaking change class |
| Publishing a new ZA legislation version (content) | EGCP Legislation + V4.4.0 Legislative change class |
| Customer policy update | Tenant DoA under EGCP; not a product release |
| Freezing payroll formulas | Existing payroll freeze + V4.4.0 |

---

## 6. Security & Separation of Duties

| Rule | Boundary |
|------|----------|
| Author of policy ≠ sole approver of exceptions to that policy | Enforced via DoA SoD |
| Evidence custodian ≠ unchecked deleter | Retention / legal hold |
| Legislation publisher ≠ tenant Compliance Officer | Platform vs tenant roles |
| AI agent ≠ authority grantor | P9 in Architecture |

---

## 7. Data Residency & Multi-Company

- Tenant governance data never crosses `company_id` without explicit multi-entity model (future).  
- Platform legislation packs are readable by all tenants but not writable.  
- Evidence access is audited (`gov.evidence.accessed`).

---

## 8. Certification

Governance boundaries are **CERTIFIED**. Any Implementation Approval that places legislative constants, DoA limits, or statutory calendars inside consumer modules is a boundary violation and fails certification.
