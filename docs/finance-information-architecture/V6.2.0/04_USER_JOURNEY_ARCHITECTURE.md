# 04 — User Journey Architecture

**Pillar:** Finance Information Architecture (FIA)  
**Version:** 6.2.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Define canonical user journeys that respect one-owner boundaries — users never choose between two competing “financial statements” products for the same intent.

---

## 2. Journey Catalogue

### J1 — Day-to-day live financial position

| Step | Location | Owner |
|------|----------|-------|
| 1 | Open Reports → Operational Reports / Live Financial Statements | Operational Reports |
| 2 | View IS / BS / CF / TB / Ratios (real time) | Accounting facts → Operational presentation |
| 3 | Drill to GL if needed | Accounting Reports under Reports |

**Does not enter:** Financial Close, statutory Statements, Publication.

---

### J2 — Post and control books

| Step | Location | Owner |
|------|----------|-------|
| 1 | Accounting → Journals / CoA / Reconcile | Accounting |
| 2 | Optional Operational Reports for confirmation | Operational Reports |

---

### J3 — Manage assets or loans

| Step | Location | Owner |
|------|----------|-------|
| 1 | Assets & Loans | Assets & Loans |
| 2 | Journals appear in Accounting | Accounting |
| 3 | Live impact visible in Operational Reports | Operational Reports |

---

### J4 — Period statutory close & publish

| Step | Location | Owner |
|------|----------|-------|
| 1 | Financial Statements Workspace → Financial Close | EFCP |
| 2 | Complete checklist, recon, Working Papers, Lead Schedules | EFCP |
| 3 | Audit adjustments posted via Accounting | Accounting |
| 4 | Certify Reporting Snapshot | Snapshot / Close |
| 5 | Manager / Partner review | EFCP |
| 6 | Statements / Disclosures assembly | EFRE |
| 7 | Publication | EFRE |

**Does not replace:** Live Operational Reports journey (J1 continues in parallel).

---

### J5 — Executive overview

| Step | Location | Owner |
|------|----------|-------|
| 1 | Reports → Executive Reports (and/or Work Executive Dashboard for ops KPIs — ops not finance FS) | Executive Reports / EWM |
| 2 | Optional link to **published** pack (read-only) | EFRE Publication |
| 3 | Optional link to live Operational Reports | Operational Reports |

**Must not:** Present a third full FS product.

---

### J6 — External / internal audit of statutory pack

| Step | Location | Owner |
|------|----------|-------|
| 1 | Financial Statements → Publication (immutable pack) | EFRE |
| 2 | Cross-ref to Working Papers / Lead Schedules | EFCP |
| 3 | Trace amounts to Snapshot → Accounting | Snapshot / Accounting |

---

### J7 — Governance constraint (finance action)

| Step | Location | Owner |
|------|----------|-------|
| 1 | Governance (DoA / obligation) | EGCP |
| 2 | Resume finance journey (J2 or J4) | Accounting / Close |

---

## 3. Intent → Navigation Router

| User intent | Primary entry |
|-------------|---------------|
| “How are we doing today?” | Operational Reports |
| “Book this transaction” | Accounting |
| “Manage that vehicle / loan” | Assets & Loans |
| “Close the year / prepare IFRS pack” | Financial Statements Workspace |
| “What did we publish?” | Publication |
| “Board KPI pack” | Executive Reports |
| “Who can approve this?” | Governance |

---

## 4. Anti-Journey (forbidden)

| Anti-pattern | Why |
|--------------|-----|
| User must open two FS apps for same live P&L | Duplicate presentation |
| Close required to see today’s TB | Breaks operational journey |
| Statutory pack edited on Operational live page | Wrong owner |
| Assets managed inside Journals only | Loses Assets independence |

---

## 5. Certification

User Journey Architecture is **CERTIFIED**.
