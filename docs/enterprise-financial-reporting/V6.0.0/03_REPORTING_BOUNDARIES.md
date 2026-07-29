# 03 — Reporting Boundaries

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Hard-bound what EFRE **owns**, what it **consumes**, and what it **must never own**, so Accounting, EGCP, Payroll, EWM, and the V3.6 Reporting Platform cannot re-absorb or duplicate financial presentation truth — and EFRE cannot become a second ledger.

---

## 2. Boundary Statement

> Accounting owns **financial facts** (books, journals, balances, period close).  
> **Operational Financial Reporting** owns **operational / live presentation** (live IS, BS, Cash Flow, Trial Balance, Ratios).  
> EFRE owns **statutory financial reporting** — statement preparation, disclosures, notes, presentation policies, statutory comparatives, validation, review, version control, and publication under versioned Framework Packs.  
> Payroll owns **calculation & payslip facts** (formulas frozen).  
> EGCP owns **legislation, policy, DoA, obligations, governance evidence custody**.  
> V3.6 Reporting Platform owns **generic registry/matrix/export substrate** — not framework FS semantics and not Operational live FS ownership.  
> V4.4.0 owns **how the product may evolve**.

Existing Financial Statements capability is **preserved** as Operational Financial Reporting — **not** deleted, deprecated, or removed.

---

## 3. Owns / Must Not Own Matrix

| Domain | Owns | Must not own |
|--------|------|--------------|
| Statement Engine | Statement Definitions instances & line composition | Debit/credit posting, account balances |
| Disclosure Engine | Checklists, applicability, Disclosure Instances | Source AR/AP/payroll transactions |
| Notes Engine | Note templates & Note Instances | GL recalculation |
| Mapping Engine | CoA/tag → taxonomy/XBRL maps | Phantom balances |
| Accounting Policy Engine | Presentation/classification/disclosure elections | Recognition & measurement engines |
| Comparative Figures Engine | Comparative columns from seals | Rewriting closed journals |
| Cross Reference Engine | Link graph | DMS blob storage product |
| Materiality Engine | Thresholds & scoping decisions | Changing recognition amounts |
| Validation Engine | ValidationRuns & articulation rules | Silent GL auto-correction |
| Review Workflow | Prepare/Review/Approve for packs | Bank payment execution |
| Publication Engine | Immutable Published Pack Versions | Live mutable preview as published truth |
| Version Control | Edition lineage & restatements | Accounting period reopen |
| XBRL Readiness | Concept bindings & export contracts | Full taxonomy product / regulator gateway (V6.0.0) |
| Framework Management | Versioned Framework Packs | Country tax legislation packs (EGCP) |

---

## 4. Consumer Module Boundaries

### 4.1 Accounting

| May | Must not |
|-----|----------|
| Seal period facts for EFRE consumption | Own Framework Packs, FS layouts, notes |
| Emit `period.closed` / support FactSnapshotSeal | Embed IFRS/GRAP statement structures |
| Remediate GL when Validation reports imbalance | Publish financial statement packs |
| Supply CoA as mapping source | Override published pack amounts |

### 4.2 Payroll

| May | Must not |
|-----|----------|
| Post employment costs through Accounting journals | Own employer financial statements |
| Contribute VIP/statutory packs via V3.6 | Recalculate PAYE into EFRE lines |
| Remain frozen on formulas | Treat payslips as FS SoT |

### 4.3 EGCP (V5.0.0)

| May | Must not |
|-----|----------|
| Evaluate DoA for pack approve/publish | Own financial statements or VIP payroll packs |
| Calendar FS filing obligations | Duplicate Framework Pack content |
| Custody evidence metadata for disclosure proofs | Redefine statement articulation |

### 4.4 Enterprise Work Management

| May | Must not |
|-----|----------|
| Consume published P&L / segment presentation where permitted | Post operational cost into FS without Accounting recognition |
| Emit `work.*` only | Emit `fre.*` or `journal.posted` |

### 4.5 V3.6 Enterprise Reporting Platform

| May | Must not |
|-----|----------|
| Register export generators for published EFRE rows | Redefine IFRS/GRAP/IPSAS line semantics |
| Provide CSV/PDF/Excel/JSON substrate | Replace FactSnapshotSeal with live payroll recomputation for FS |
| Keep payroll/VIP reports as own domain | Absorb EFRE Framework Management |

### 4.6 Operational Financial Reporting (existing Financial Statements / Reports)

**Status:** Permanent operational track (see [08_MIGRATION_STRATEGY.md](./08_MIGRATION_STRATEGY.md)). Not transitional deletion fodder.

| May | Must not |
|-----|----------|
| Own live Income Statement, Balance Sheet, Cash Flow, Trial Balance, Ratio Analysis | Be deleted, deprecated, or removed because EFRE exists |
| Consume live Accounting balance/activity RPCs | Duplicate Accounting calculations or invent balances |
| Remain backwards compatible (routes, edge methods, integrations) | Claim Framework Pack / statutory publication authority |
| Be repositioned/labelled as Operational Financial Reporting | Redesign the operational reporting engine as EFRE |
| Optionally register via V3.6 as operational generators | Own disclosures, notes, review workflow, or immutable publication packs |

---

## 5. Cross-Pillar Boundary with V4.4.0

| Concern | Owner |
|---------|-------|
| Changing EFRE architecture after certification | V4.4.0 Architecture / Breaking change class |
| Publishing a new Framework Pack version (content) | EFRE Framework Management + V4.4.0 content/architecture class as applicable |
| Tenant mapping/policy update | Tenant under EFRE; not a product release |
| Accounting journal freeze / period ownership | Remains Accounting; V4.4.0 if product contract changes |

---

## 6. Distinction from EGCP Governance Reporting

| Governance Reporting (EGCP) | Financial Reporting (EFRE) |
|-----------------------------|----------------------------|
| Compliance posture, obligations, control evidence packs | IFRS/GRAP/etc. financial statements |
| Must not own FS | Owns FS |
| Namespace `gov.*` | Namespace `fre.*` |

---

## 7. Security & Separation of Duties

| Rule | Boundary |
|------|----------|
| Preparer ≠ sole approver when DoA requires dual control | Review Workflow + EGCP DoA |
| Mapping publisher ≠ sole approver of packs using that map (recommended SoD) | Tenant policy / DoA |
| Framework Pack publisher ≠ tenant Finance Officer | Platform vs tenant roles |
| AI agent ≠ seal / approve / publish authority | P9 in Architecture |

---

## 8. Data Residency & Multi-Company

- Tenant EFRE data never crosses `company_id` without an explicit future multi-entity consolidation model.  
- Platform Framework Packs are readable by all tenants but not writable.  
- Published pack access is audited (`fre.pack.published` and access policies at implementation).  

---

## 9. Certification

Reporting Boundaries are **CERTIFIED**. Implementation designs that blur Accounting recognition with EFRE presentation, or that place FS ownership in EGCP or V3.6, are out of certification.
