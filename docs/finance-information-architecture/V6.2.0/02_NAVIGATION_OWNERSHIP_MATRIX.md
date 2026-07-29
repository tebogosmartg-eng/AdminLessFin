# 02 — Navigation Ownership Matrix

**Pillar:** Finance Information Architecture (FIA)  
**Version:** 6.2.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Assign **exactly one primary navigation location** per financial capability. Secondary links (dashboard shortcuts, command palette) may deep-link but must not create a second “home.”

---

## 2. Target Finance Navigation Map

```
Accounting
  ├── Chart of Accounts
  ├── Journal Entries
  ├── Recurring Entries
  ├── Reconcile
  └── Tax Rates

Assets & Loans
  ├── Fixed Assets
  ├── Asset Categories
  └── Loans

Reports                          ← enterprise reporting home
  ├── Operational Reports        ← hub + live FS entry points
  │     ├── Live Financial Statements (IS/BS/CF/TB/Ratios)
  │     ├── Comparative P&L / B/S (operational)
  │     ├── General Ledger (Accounting Reports)
  │     ├── Sales Tax / Inventory / Project / Budgets (as applicable)
  ├── Executive Reports
  └── (domain reports: Payroll, VIP — owned by those domains; listed once)

Financial Statements            ← statutory preparation home (Workspace)
  ├── Financial Close
  │     ├── Workspace / Checklist / Tasks
  │     ├── Working Papers
  │     ├── Lead Schedules
  │     └── Reviews / Readiness
  ├── Statements                 ← EFRE
  ├── Disclosures                ← EFRE (+ Notes)
  └── Publication                ← EFRE

Governance (EGCP)                ← NOT under Reports/FS
```

---

## 3. Matrix — Capability → Primary Nav

| Capability | Primary navigation location | Must not also live under |
|------------|----------------------------|---------------------------|
| Accounting (books) | Accounting | Reports as transaction UI |
| Accounting Reports (GL inquiry, control TB) | Reports → Operational / Accounting inquiry | Accounting (duplicate GL) |
| Operational Reports | Reports → Operational Reports | Financial Statements Workspace |
| Live IS / BS / CF / TB / Ratios | Reports → Operational Reports | Financial Statements Workspace; Close |
| Executive Reports | Reports → Executive Reports | Financial Statements Workspace |
| Assets & Loans | Assets & Loans | Reports (except optional read-only valuation report once) |
| Financial Statements Workspace | Financial Statements (group) | Reports as statutory home |
| Financial Close | Financial Statements → Close | Accounting; Operational Reports |
| Working Papers | Financial Statements → Close → Working Papers | EFRE Publication as WP editor |
| Lead Schedules | Financial Statements → Close → Lead Schedules | Operational Reports |
| Enterprise Financial Reporting | Financial Statements (engines via children) | Reports |
| Statements (statutory) | Financial Statements → Statements | Operational Reports; Accounting |
| Disclosures | Financial Statements → Disclosures | Close as disclosure editor SoT |
| Publication | Financial Statements → Publication | Operational export-only labelled “live” |
| Enterprise Governance | Governance | Reports; Financial Statements |

---

## 4. Alignment with Current Product (information only)

| Current nav label | Target IA treatment |
|-------------------|---------------------|
| Operational Reports (`/reports`) | Keep — Operational Reports |
| Financial Statements (`/financial-statements`) | **Operational live FS** — belongs under Operational Reports ownership; label may evolve to “Live Financial Statements” under IA evolution (V6.1.1: path preserved) |
| Comparative P&L / B/S | Operational Reports |
| General Ledger | Accounting Reports under Reports |
| Assets & Loans group | Unchanged independence |
| Financial Close (V6.1.1 Phase 4) | Appears under Financial Statements Workspace |

No route deletions mandated by this pack (implementation prohibited). IA defines **ownership of location**, not a force delete.

---

## 5. Duplicate Navigation Prohibitions

| Pattern | Status |
|---------|--------|
| Live FS in both Reports and Financial Statements Workspace | **Forbidden** |
| Statutory Statements under both Reports and Workspace | **Forbidden** |
| Working Papers under Reports and Close | **Forbidden** — Close only |
| Assets under Accounting and Assets & Loans | **Forbidden** — Assets & Loans only |
| Same report registered twice in Command Menu as two products | **Forbidden** |

---

## 6. Certification

Navigation Ownership Matrix is **CERTIFIED**.
