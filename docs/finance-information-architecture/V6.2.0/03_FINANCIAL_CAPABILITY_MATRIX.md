# 03 — Financial Capability Matrix

**Pillar:** Finance Information Architecture (FIA)  
**Version:** 6.2.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Prove **one owner** across business, data, calculation, and presentation dimensions for every certified capability.

Legend: **Owner** = sole accountable; **Consumer** = may read; **—** = not applicable.

---

## 2. Master Capability Matrix

| Capability | Business Owner | Data Owner | Calculation Owner | Presentation Owner | Nav Owner |
|------------|----------------|------------|-------------------|--------------------|-----------|
| Accounting | Accounting | Accounting | Accounting | Accounting (setup UI) | Accounting |
| Accounting Reports | Accounting | Accounting | Accounting | Reports | Reports |
| Operational Reports | Reports | Accounting (read) | Accounting | **Operational Reports** | Reports |
| Live FS (IS/BS/CF/TB/Ratios) | Reports | Accounting (read) | Accounting | **Operational Reports** | Reports |
| Executive Reports | Reports | Multi (read) | Source systems | **Executive Reports** | Reports |
| Assets & Loans | Assets & Loans | Assets & Loans | Assets & Loans | Assets & Loans | Assets & Loans |
| Financial Statements Workspace | Finance Office | Close + Snapshots + Packs | — | Workspace shell | Financial Statements |
| Financial Close | EFCP | EFCP | — (orchestrates) | EFCP Close UI | Financial Statements |
| Working Papers | EFCP | EFCP | — | EFCP | Financial Statements |
| Lead Schedules | EFCP | EFCP | Tie-out to Accounting/Snapshot | EFCP | Financial Statements |
| Enterprise Financial Reporting | EFRE | EFRE + Snapshots | Presentation mapping only | EFRE | Financial Statements |
| Statements (statutory) | EFRE | EFRE | Mapping of sealed facts | **EFRE** | Financial Statements |
| Disclosures | EFRE | EFRE | Presentation | **EFRE** | Financial Statements |
| Publication | EFRE | EFRE | — | **EFRE** | Financial Statements |
| Reporting Snapshots | EFRE/EFCP contract | Snapshot (V6.0.1) | Accounting facts sealed | — | via Close |
| Enterprise Governance | EGCP | EGCP | Rule eval | Governance Reporting | Governance |

---

## 3. Verify Mapping

| Board check | Result | Matrix proof |
|-------------|--------|--------------|
| One owner | ✓ PASS | Single Business Owner column per row |
| One navigation location | ✓ PASS | Nav Owner column + Matrix deliverable 02 |
| No duplicate reports | ✓ PASS | Accounting Reports / Operational / Executive disjoint |
| No duplicate financial statements | ✓ PASS | Live = Operational Reports; Statutory = EFRE under Workspace |
| Accounting owns balances | ✓ PASS | Calculation Owner = Accounting for books & live |
| Financial Statements own statutory preparation | ✓ PASS | Workspace business ownership + Close/EFRE children |
| Reports own enterprise reporting | ✓ PASS | Operational + Executive + Accounting Report packaging |
| Assets remain independent | ✓ PASS | Assets & Loans row |
| Multi-framework ready | ✓ PASS | EFRE / Workspace |

---

## 4. Consumer (non-owner) Rules

| Consumer | May | Must not |
|----------|-----|----------|
| Operational Reports | Present live Accounting | Own statutory packs; seal snapshots |
| Financial Close | Seal orchestrate; evidence | Own Framework layouts; post GL alone |
| EFRE | Present sealed facts | Own live operational FS; invent balances |
| Assets & Loans | Post to Accounting | Own enterprise FS |
| EGCP | Approve/constrain | Own FS presentation |
| EWM | Consume published or operational metrics | Own finance nav FS |

---

## 5. Certification

Financial Capability Matrix is **CERTIFIED**.
