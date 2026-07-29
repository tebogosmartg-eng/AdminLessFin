# 03 — Capability Ownership Matrix

**Version:** 6.2.1  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Master Matrix

| Capability | Business Owner | Navigation Owner | Calculation Owner | Presentation Owner |
|------------|----------------|------------------|-------------------|--------------------|
| Accounting | Accounting | Accounting | Accounting | Accounting |
| Accounting Reports | Accounting | Accounting | Accounting | Accounting Reports |
| Live TB / IS / BS / CF / Ratios | Accounting | Accounting | Accounting | Accounting Reports |
| Financial Statements Workspace | Finance Office | Financial Statements | — | Workspace shell |
| Financial Close | EFCP | Financial Statements | — (orchestrate) | EFCP |
| Enterprise Financial Reporting | EFRE | Financial Statements | Presentation mapping | EFRE |
| Statements (statutory) | EFRE | Financial Statements | Sealed-fact mapping | EFRE |
| Disclosures | EFRE | Financial Statements | Presentation | EFRE |
| Publication | EFRE | Financial Statements | — | EFRE |
| Reports (platform) | Reports | Reports | Source domains | Reports |
| Executive Reporting | Reports | Reports | Source systems | Executive Reporting |
| Operational Reporting | Reports | Reports | Source modules | Operational Reporting |
| Assets & Loans | Assets & Loans | Assets & Loans | Assets & Loans | Assets & Loans |
| Enterprise Governance | EGCP | Enterprise Governance | Rule evaluation | Governance Reporting |

---

## 2. Dual Presentation Tracks (non-duplicate)

| Intent | Presentation Owner | Calculation Owner |
|--------|--------------------|-------------------|
| Live management / control statements | Accounting Reports | Accounting |
| Statutory / framework statements | EFRE | Accounting facts via Snapshot (no re-recognition) |

These are **different capabilities**, not duplicates.

---

## 3. V6.2.0 Supersession

| V6.2.0 assignment | V6.2.1 permanent |
|-------------------|------------------|
| Live IS/BS/CF/TB/Ratios → Operational Reports | → **Accounting Reports** under Accounting |
| Reports owns “enterprise + operational including live FS” | Reports owns **enterprise-wide only**; Operational Reporting excludes live FS five |

All other V6.2.0 boundary axioms (Accounting balances; Workspace statutory; Assets independent; EGCP outside) remain.

---

## 4. Certification

Capability Ownership Matrix is **CERTIFIED**.
