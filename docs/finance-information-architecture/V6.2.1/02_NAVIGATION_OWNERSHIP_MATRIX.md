# 02 — Navigation Ownership Matrix

**Version:** 6.2.1  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

One primary navigation location per finance capability. Shortcuts allowed; second homes forbidden.

---

## 2. Matrix

| Capability / Artefact | Primary navigation location | Forbidden second homes |
|-----------------------|----------------------------|------------------------|
| Accounting (books UI) | Accounting | Reports |
| Chart of Accounts | Accounting | — |
| Journals / Recurring / Reconcile / Tax Rates | Accounting | — |
| Trial Balance (Live) | Accounting → Accounting Reports | Reports; Financial Statements |
| Income Statement (Live) | Accounting → Accounting Reports | Reports; Financial Statements |
| Balance Sheet (Live) | Accounting → Accounting Reports | Reports; Financial Statements |
| Cash Flow (Live) | Accounting → Accounting Reports | Reports; Financial Statements |
| Ratio Analysis (Live) | Accounting → Accounting Reports | Reports; Financial Statements |
| General Ledger inquiry | Accounting → Accounting Reports | Duplicate under Reports |
| Financial Statements Workspace | Financial Statements | Reports |
| Financial Close | Financial Statements → Close | Accounting; Reports |
| Working Papers / Lead Schedules | Financial Statements → Close | Reports |
| Statements (statutory) | Financial Statements → Statements | Accounting Reports; Reports |
| Disclosures | Financial Statements → Disclosures | Reports |
| Publication | Financial Statements → Publication | Reports |
| Enterprise Financial Reporting | Financial Statements (via children) | Reports |
| Executive Reporting | Reports → Executive | Financial Statements |
| Operational Reporting (analytics) | Reports → Operational | Must not list live FS five |
| Assets & Loans | Assets & Loans | Accounting as sole home |
| Enterprise Governance | Enterprise Governance | Reports; Financial Statements |

---

## 3. Top-Level Group Ownership

| Nav group | Owns |
|-----------|------|
| Accounting | Books + Accounting Reports (live statements) |
| Financial Statements | Statutory preparation only |
| Assets & Loans | Asset/loan subledgers |
| Reports | Enterprise-wide reporting only |
| Enterprise Governance | Governance |

---

## 4. Dashboard / Command Menu Rule

Dashboard cards and Command Menu may deep-link to Accounting Reports or Financial Statements Workspace. They **do not** create alternate ownership or alternate product names for the same artefact.

---

## 5. Certification

Navigation Ownership Matrix is **CERTIFIED**.
