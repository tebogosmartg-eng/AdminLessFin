# 01 — Finance Information Architecture

**Pillar:** Finance Information Architecture (FIA)  
**Version:** 6.2.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Mission

Define permanent ownership boundaries so AdminLess Fin has **one owner per financial capability**, **one primary navigation location**, and **no duplicate reports, statements, or presentation**.

---

## 2. Core Ownership Axiom

| Layer | Owner |
|-------|-------|
| **Balances / recognition / journals** | Accounting |
| **Live operational financial presentation** | Operational Reports |
| **Statutory financial statement preparation (workspace)** | Financial Statements Workspace |
| **Close readiness & evidence** | Financial Close (EFCP) |
| **Framework statements, disclosures, publication engines** | Enterprise Financial Reporting (EFRE) |
| **Asset & loan subledgers** | Assets & Loans (posts into Accounting) |
| **Enterprise / executive insight packs** | Reports (Executive Reports) |
| **Legislation, DoA, obligations** | Enterprise Governance (EGCP) — outside finance IA nav |

```
Accounting ──balances──► Operational Reports (live IS/BS/CF/TB/Ratios)
     │
     └──► Financial Close ──snapshots──► Enterprise Financial Reporting
              ▲                              │
              │                              ▼
         Financial Statements Workspace (statutory home)
```

---

## 3. Capability Definitions

For each: Business Purpose, Primary Users, Navigation Ownership, Business Ownership, Data Ownership, Calculation Ownership, Presentation Ownership, Relationships, Future Scalability.

---

### 3.1 Accounting

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Record, classify, and control all financial transactions; maintain COA, journals, GL, periods. |
| **Primary Users** | Bookkeepers, controllers, accountants |
| **Navigation Ownership** | **Accounting** nav group (CoA, Journals, Recurring, Reconcile, Tax Rates) |
| **Business Ownership** | Accounting module |
| **Data Ownership** | `journal_entries`, items, COA, periods |
| **Calculation Ownership** | Balance & activity determination (RPCs / engine) |
| **Presentation Ownership** | Accounting setup screens only — **not** financial statements |
| **Relationships** | Target of posts from Sales, Purchases, Payroll, Assets & Loans; source for all reporting tracks |
| **Future Scalability** | Multi-entity books; never absorb EFRE layouts |

---

### 3.2 Accounting Reports

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Operational accounting inquiry: General Ledger inquiry, live Trial Balance as accounting control view, tax listings tied to books. |
| **Primary Users** | Accountants, auditors (inquiry) |
| **Navigation Ownership** | **Reports → Operational / Accounting inquiry** — single listing; GL is Accounting Report capability not a second “statements” product |
| **Business Ownership** | Accounting (content) · Reports (enterprise report packaging/registry where used) |
| **Data Ownership** | Accounting |
| **Calculation Ownership** | Accounting |
| **Presentation Ownership** | **Reports** (one report surface — no duplicate GL under Accounting and Reports) |
| **Relationships** | Reads Accounting; must not fork balances |
| **Future Scalability** | May register via V3.6 platform without duplicating FS |

**Sole presentation rule:** General Ledger appears **once** under Reports (current pattern). Accounting nav does not duplicate GL/TB as statements.

---

### 3.3 Financial Statements Workspace

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | **Sole product home for statutory financial statement preparation** — Close, evidence, framework statements, disclosures, publication. |
| **Primary Users** | Financial controllers, reporting managers, partners, external auditors |
| **Navigation Ownership** | **Financial Statements** (primary nav group / entry — distinct from Operational Reports) |
| **Business Ownership** | Finance Office (orchestrates EFCP + EFRE) |
| **Data Ownership** | Close artefacts + Reporting Snapshots + Published Packs (not live GL) |
| **Calculation Ownership** | None for recognition — consumes Accounting via snapshots |
| **Presentation Ownership** | Statutory packs only (via EFRE children) |
| **Relationships** | Contains nav for Financial Close, Working Papers, Lead Schedules, Statements, Disclosures, Publication |
| **Future Scalability** | Multi-framework; consolidation later |

**Naming alignment:** Live `/financial-statements` today is **Operational** capability (see §3.4). Target IA: that live surface is owned by Operational Reports; **Financial Statements Workspace** is the statutory home (Close entry per V6.1.1 `/financial-close`, expanding into full workspace). No two competing “statutory statement” homes.

---

### 3.4 Operational Reports

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Real-time management financial reporting integrated with Accounting. |
| **Primary Users** | Owners, managers, day-to-day finance users |
| **Navigation Ownership** | **Reports** group — Operational Reports |
| **Business Ownership** | Reports |
| **Data Ownership** | Reads Accounting (live) |
| **Calculation Ownership** | Accounting (balances); Operational Reports only arrange live presentation |
| **Presentation Ownership** | **Operational Reports** — live Income Statement, Balance Sheet, Cash Flow, Trial Balance, Ratio Analysis, comparative operational views |
| **Relationships** | Must remain per V6.0.0 Migration / V6.1.1 Approval; never replaced by Close |
| **Future Scalability** | Label clearly “live / operational”; no Framework Pack claims |

**Includes (sole live FS presentation):** today’s Financial Statements live page, Operational Reports hub, Comparative P&L/B/S (operational).

---

### 3.5 Executive Reports

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Board/executive insight: KPIs, summaries, cross-domain dashboards — not statutory notes packs. |
| **Primary Users** | Executives, board |
| **Navigation Ownership** | **Reports → Executive** (and/or Executive Dashboard under Work — **one** primary finance-facing exec finance pack location under Reports to avoid duplicate finance statements) |
| **Business Ownership** | Reports |
| **Data Ownership** | Consumes Accounting / published packs / EWM metrics as permitted |
| **Calculation Ownership** | Source systems; Executive Reports aggregate only |
| **Presentation Ownership** | Executive Reports |
| **Relationships** | Must not duplicate Operational live FS or statutory packs |
| **Future Scalability** | KPI catalogue alignment (V4.1.5) |

---

### 3.6 Assets & Loans

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Manage fixed asset register, depreciation, and loan subledgers. |
| **Primary Users** | Asset accountants, treasury |
| **Navigation Ownership** | **Assets & Loans** group (independent) |
| **Business Ownership** | Assets & Loans module |
| **Data Ownership** | Asset/loan entities |
| **Calculation Ownership** | Depreciation / loan schedules within module; posting to Accounting |
| **Presentation Ownership** | Module screens; not enterprise FS |
| **Relationships** | Posts journals to Accounting; FS consume via GL only |
| **Future Scalability** | Remains independent; no merge into Reports |

---

### 3.7 Financial Close

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Controlled period close producing certified Reporting Snapshots (EFCP). |
| **Primary Users** | Controllers, preparers, reviewers |
| **Navigation Ownership** | **Financial Statements Workspace → Financial Close** (one location; V6.1.1 Phase 4 sidebar under that home) |
| **Business Ownership** | EFCP |
| **Data Ownership** | Workspace, checklist, readiness, hand-off |
| **Calculation Ownership** | None for GL; orchestrates seal |
| **Presentation Ownership** | Close UI — not statement layouts |
| **Relationships** | Feeds EFRE; uses Accounting facts |
| **Future Scalability** | Multi-entity close workspaces |

---

### 3.8 Enterprise Financial Reporting

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Framework presentation engines (EFRE): map, assemble, validate, publish. |
| **Primary Users** | Reporting managers, auditors |
| **Navigation Ownership** | **Financial Statements Workspace** (engines appear as Statements / Disclosures / Publication children) |
| **Business Ownership** | EFRE |
| **Data Ownership** | Framework packs, mappings, published packs |
| **Calculation Ownership** | Presentation only — no recognition |
| **Presentation Ownership** | EFRE |
| **Relationships** | Consumes snapshots from Close |
| **Future Scalability** | IFRS / SME / GRAP / MCS / IPSAS / Future |

---

### 3.9 Working Papers

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Close evidence packs supporting snapshot assertions. |
| **Primary Users** | Preparers, auditors |
| **Navigation Ownership** | **Financial Statements Workspace → Financial Close → Working Papers** |
| **Business Ownership** | EFCP |
| **Data Ownership** | WP versions linked to Snapshot Versions |
| **Calculation Ownership** | None |
| **Presentation Ownership** | WP viewer in Close |
| **Relationships** | Lead Schedules, Reviews |
| **Future Scalability** | Evidence custody via EGCP |

---

### 3.10 Lead Schedules

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Traceable control-account schedules for close. |
| **Primary Users** | Preparers, auditors |
| **Navigation Ownership** | **Financial Statements Workspace → Financial Close → Lead Schedules** |
| **Business Ownership** | EFCP |
| **Data Ownership** | Lead schedules pinned to Snapshot Versions |
| **Calculation Ownership** | Tie-out to Accounting/snapshot — no parallel GL |
| **Presentation Ownership** | Lead schedule UI in Close |
| **Relationships** | Working Papers, Reconciliations |
| **Future Scalability** | Multi-currency leads |

---

### 3.11 Statements

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Framework primary statements (statutory). |
| **Primary Users** | Reporting managers, board, auditors |
| **Navigation Ownership** | **Financial Statements Workspace → Statements** |
| **Business Ownership** | EFRE Statement Engine |
| **Data Ownership** | Statement Instances on snapshots |
| **Calculation Ownership** | Mapping of sealed facts |
| **Presentation Ownership** | EFRE — **only** statutory statement presentation (live statements stay Operational Reports) |
| **Relationships** | Disclosures, Publication |
| **Future Scalability** | Multi-framework statement sets |

---

### 3.12 Disclosures

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Statutory disclosures & notes assemblies. |
| **Primary Users** | Reporting managers, auditors |
| **Navigation Ownership** | **Financial Statements Workspace → Disclosures** (notes nested here — one disclosure home) |
| **Business Ownership** | EFRE Disclosure + Notes Engines |
| **Data Ownership** | Disclosure/Note Instances |
| **Calculation Ownership** | Presentation/quant from snapshot |
| **Presentation Ownership** | EFRE |
| **Relationships** | Statements, Publication, Cross References |
| **Future Scalability** | Framework disclosure catalogues |

---

### 3.13 Publication

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Immutable published packs & distribution. |
| **Primary Users** | Controllers, board, auditors, regulators (later) |
| **Navigation Ownership** | **Financial Statements Workspace → Publication** |
| **Business Ownership** | EFRE Publication Engine |
| **Data Ownership** | Published Pack Versions |
| **Calculation Ownership** | None |
| **Presentation Ownership** | Published artefacts |
| **Relationships** | Close Publication Readiness; EGCP filing obligations |
| **Future Scalability** | XBRL-ready exports |

---

### 3.14 Enterprise Governance (boundary)

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Legislation, policy, DoA, obligations — constrains finance; does not present FS. |
| **Navigation Ownership** | **Governance** (not Finance Reports; not Financial Statements) |
| **Must not** | Own financial statements, Close WPs as SoT, or Operational Reports |

---

## 4. Anti-Duplication Rules

| Forbidden | Correct owner |
|-----------|---------------|
| Second live IS/BS under Close | Operational Reports |
| Second statutory pack under Reports | Financial Statements Workspace / EFRE |
| GL listed under Accounting and Reports as two products | One Accounting Report under Reports |
| Assets reports that recompute depreciation in Reports | Assets & Loans calculates; Reports may display |
| EGCP “governance reporting” that ships IFRS packs | EFRE Publication |
| Payroll VIP presented as company FS | Payroll Reports (separate) |

---

## 5. Multi-Framework

Financial Statements Workspace + EFRE are multi-framework ready. Operational Reports remain framework-agnostic live views.

---

## 6. Certification

Finance Information Architecture is **CERTIFIED**.
