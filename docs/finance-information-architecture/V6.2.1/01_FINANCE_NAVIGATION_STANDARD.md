# 01 — Finance Navigation Standard

**Pillar:** Finance Information Architecture (FIA)  
**Pack:** Navigation & Ownership Refinement  
**Version:** 6.2.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Architectural Question — Decision Record

### Question

Do Trial Balance, Income Statement (Live), Balance Sheet (Live), Cash Flow (Live), and Ratio Analysis belong under **Reports** or **Accounting**?

### Decision

**Permanent owner: Accounting (via Accounting Reports).**

| Option | Board verdict |
|--------|---------------|
| Reports | **Rejected** as permanent home for these five |
| Financial Statements Workspace | **Rejected** for live artefacts (statutory only) |
| Accounting → Accounting Reports | **Accepted** |

### Decision criteria

| Criterion | Finding |
|-----------|---------|
| **Business ownership** | These present the books; Accounting owns the books |
| **User expectations** | Accountants expect TB/IS/BS beside CoA/Journals/Reconcile |
| **Navigation simplicity** | One live statement home; Reports not a second statement shelf |
| **Enterprise scalability** | Reports stays free for cross-domain / executive packs |
| **Future AI** | AI advisory on live books attaches to Accounting facts/context; statutory AI to Workspace |
| **Future reporting frameworks** | Framework packs attach only to Financial Statements Workspace / EFRE — never to live Accounting Reports |

---

## 2. Permanent Finance Navigation Hierarchy

Certified top-level finance-related groups (sibling order illustrative; product may sort UX within constraints):

```
Dashboard
Operations
Sales
Purchases
Payroll
Work Management
Accounting
  ├── Chart of Accounts
  ├── Journal Entries
  ├── Recurring Entries
  ├── Reconcile
  ├── Tax Rates
  └── Accounting Reports
        ├── Trial Balance (Live)
        ├── Income Statement (Live)
        ├── Balance Sheet (Live)
        ├── Cash Flow (Live)
        ├── Ratio Analysis (Live)
        └── General Ledger (inquiry)
Financial Statements          ← statutory preparation ONLY
  ├── Financial Close
  │     ├── Workspace / Checklist / Tasks
  │     ├── Working Papers
  │     ├── Lead Schedules
  │     └── Reviews / Readiness
  ├── Statements               ← EFRE statutory
  ├── Disclosures
  └── Publication
Assets & Loans                 ← independent
Reports                        ← enterprise-wide ONLY
  ├── Executive Reporting
  ├── Operational Reporting    ← management analytics — NOT live FS
  └── (domain report indexes as single listings)
Enterprise Governance
```

**Confirmed:** The example hierarchy in the brief is **correct in structure**, with the refinement that live TB/IS/BS/CF/Ratios sit under **Accounting → Accounting Reports**, not under Reports.

---

## 3. Certified Capabilities (summaries)

Full attribute tables: see §4 and matrices.

| Capability | Permanent home |
|------------|----------------|
| Accounting | Accounting nav |
| Accounting Reports | Accounting → Accounting Reports |
| Financial Statements Workspace | Financial Statements |
| Reports | Reports (enterprise-wide) |
| Executive Reporting | Reports → Executive |
| Operational Reporting | Reports → Operational (analytics; no live FS) |
| Financial Close | Financial Statements → Close |
| Enterprise Financial Reporting | Financial Statements (Statements/Disclosures/Publication) |

---

## 4. Capability Definitions

### 4.1 Accounting

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Maintain books: COA, journals, recognition, periods, reconciliation tools |
| **Primary Users** | Accountants, bookkeepers, controllers |
| **Navigation Owner** | Accounting |
| **Business Owner** | Accounting module |
| **Calculation Owner** | Accounting |
| **Presentation Owner** | Accounting setup & control UI |
| **Relationships** | Source of facts for Accounting Reports, Snapshots, all modules posting |
| **Consumers** | All finance consumers |
| **Future Scalability** | Multi-entity books; never absorbs statutory layouts |

### 4.2 Accounting Reports

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Live presentation of Accounting balances for control and management inquiry |
| **Primary Users** | Accountants, controllers, auditors (inquiry) |
| **Navigation Owner** | Accounting → Accounting Reports |
| **Business Owner** | Accounting |
| **Calculation Owner** | Accounting |
| **Presentation Owner** | Accounting Reports |
| **Relationships** | Sole home for Live TB, IS, BS, CF, Ratios, GL inquiry |
| **Consumers** | Dashboard shortcuts (not second homes), auditors |
| **Future Scalability** | Remains live; never claims Framework Pack compliance |

**Sole artefacts (no duplicates elsewhere):**

- Trial Balance (Live)  
- Income Statement (Live)  
- Balance Sheet (Live)  
- Cash Flow (Live)  
- Ratio Analysis (Live)  

### 4.3 Financial Statements Workspace

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Sole home for **statutory** financial statement preparation |
| **Primary Users** | Controllers, reporting managers, partners, auditors |
| **Navigation Owner** | Financial Statements |
| **Business Owner** | Finance Office (EFCP + EFRE orchestration) |
| **Calculation Owner** | None for recognition — sealed Accounting via snapshots |
| **Presentation Owner** | Workspace shell; children own specialised UIs |
| **Relationships** | Contains Close + EFRE surfaces |
| **Consumers** | Board (published), regulators (later) |
| **Future Scalability** | Multi-framework statutory packs |

### 4.4 Reports

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | **Enterprise-wide reporting only** — cross-domain and executive insight; not the books’ live statement shelf |
| **Primary Users** | Managers, executives, domain specialists |
| **Navigation Owner** | Reports |
| **Business Owner** | Reports platform |
| **Calculation Owner** | Source domains (Accounting, Payroll, EWM, etc.) |
| **Presentation Owner** | Reports |
| **Relationships** | Aggregates Executive + Operational Reporting; must not host live TB/IS/BS/CF/Ratios |
| **Consumers** | Enterprise consumers |
| **Future Scalability** | V3.6 registry; new enterprise reports register once |

### 4.5 Executive Reporting

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Board/executive packs and KPI summaries |
| **Primary Users** | Executives, board |
| **Navigation Owner** | Reports → Executive Reporting |
| **Business Owner** | Reports |
| **Calculation Owner** | Source systems |
| **Presentation Owner** | Executive Reporting |
| **Relationships** | May link read-only to Publication or Accounting Reports — not duplicate FS |
| **Consumers** | Leadership |
| **Future Scalability** | KPI catalogue |

### 4.6 Operational Reporting

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Management operational analytics (e.g. aging, inventory valuation, project profitability, budgets, sales tax listings) |
| **Primary Users** | Managers, operations, finance ops |
| **Navigation Owner** | Reports → Operational Reporting |
| **Business Owner** | Reports |
| **Calculation Owner** | Source modules |
| **Presentation Owner** | Operational Reporting |
| **Relationships** | **Excludes** Live TB/IS/BS/CF/Ratios (those are Accounting Reports) |
| **Consumers** | Day-to-day management |
| **Future Scalability** | Add analytics without creating statement twins |

### 4.7 Financial Close

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Controlled close producing certified Reporting Snapshots |
| **Primary Users** | Preparers, reviewers, controllers |
| **Navigation Owner** | Financial Statements → Financial Close |
| **Business Owner** | EFCP |
| **Calculation Owner** | — (orchestrates; Accounting calculates balances) |
| **Presentation Owner** | Close UI |
| **Relationships** | Working Papers, Lead Schedules, hand-off to EFRE |
| **Consumers** | EFRE, auditors |
| **Future Scalability** | Multi-entity workspaces |

### 4.8 Enterprise Financial Reporting

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Framework statutory Statements, Disclosures, Publication |
| **Primary Users** | Reporting managers, auditors, board |
| **Navigation Owner** | Financial Statements → Statements / Disclosures / Publication |
| **Business Owner** | EFRE |
| **Calculation Owner** | Presentation mapping of sealed facts only |
| **Presentation Owner** | EFRE |
| **Relationships** | Consumes Close snapshots |
| **Consumers** | External stakeholders |
| **Future Scalability** | IFRS / SME / GRAP / MCS / IPSAS / Future |

---

## 5. Anti-Duplication (hard rules)

| Artefact | Only location |
|----------|---------------|
| Income Statement (Live) | Accounting Reports |
| Balance Sheet (Live) | Accounting Reports |
| Cash Flow (Live) | Accounting Reports |
| Trial Balance (Live) | Accounting Reports |
| Ratio Analysis (Live) | Accounting Reports |
| Statutory Statements | Financial Statements → Statements |
| Close Working Papers | Financial Statements → Close |

---

## 6. Certification

Finance Navigation Standard is **CERTIFIED**.
