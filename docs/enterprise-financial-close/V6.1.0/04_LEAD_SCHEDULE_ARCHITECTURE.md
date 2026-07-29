# 04 — Lead Schedule Architecture

**Pillar:** Enterprise Financial Close Platform (EFCP)  
**Version:** 6.1.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Close Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Business Purpose

Lead Schedules provide **traceable composition** of GL control accounts (and framework-relevant aggregations) used during Close — opening balance, movements, closing balance, and supporting detail references — so certified Reporting Snapshots remain reconcilable to Accounting.

**Hard rule:**

> Lead Schedules remain **traceable** to Accounting facts and, once locked for statutory close, pin a Reporting Snapshot Version.

---

## 2. Ownership

| Role | Responsibility |
|------|----------------|
| Preparer | Builds lead from Accounting / Fact Snapshot extracts |
| Reviewer | Signs composition |
| EFCP | Schedule definitions, lock, versioning |
| Accounting | Source balances (SoT) |
| EFRE Mapping | Consumes sealed facts — lead is Close evidence, not a second mapping engine |

Lead Schedules are **not** Framework Pack statement layouts. They are Close analytical / control schedules.

---

## 3. Structure (logical)

```
LeadSchedule
  ├── identity, control_account_id(s), period, currency
  ├── schedule_type (rollforward | composition | aging_support | other)
  ├── opening_balance, movements[], closing_balance
  ├── lines[] → LeadScheduleLine
  │     ├── description, amount, source_ref (journal / subledger / WP)
  │     └── taxonomy_hint? (optional, non-authoritative)
  ├── variance_to_gl
  ├── working_paper_refs[]
  ├── reconciliation_refs[]
  ├── snapshot_version_id?   # required when locked for certified snapshot
  ├── status, preparer, reviewer
  └── content_hash
```

**Invariant:** `opening + movements = closing` within tolerance policy; `closing` ties to GL / Fact Snapshot control balance or Blocking Issue is raised.

---

## 4. Lifecycle

```
draft → prepared → reviewed → locked_to_snapshot → (superseded)
```

| Status | Meaning |
|--------|---------|
| draft | Editable |
| prepared | Preparer complete |
| reviewed | Manager/reviewer signed |
| locked_to_snapshot | Immutable; `snapshot_version_id` set |
| superseded | Replaced after Audit Adj / restatement |

---

## 5. Traceability Rules

| Rule | Requirement |
|------|-------------|
| T1 | Every line amount has `source_ref` or explicit plug with Blocking Issue |
| T2 | Control total reconciles to Accounting balance at prepare time |
| T3 | On lock, control total reconciles to Fact Snapshot amounts |
| T4 | Variance unexplained ⇒ cannot lock; raise Blocking Issue |
| T5 | Locked leads retained with Snapshot Version |
| T6 | Restatement ⇒ new lead revision linked to new Snapshot Version |

---

## 6. Relationships

| Related | Nature |
|---------|--------|
| Fact Snapshot / Reporting Dataset | Authoritative amounts at lock |
| Working Papers | Detail evidence |
| Reconciliations | Subledger tie-outs |
| Audit Adjustments | Movement lines cite journals |
| Manager / Partner Review | Primary review artefact |
| EFRE Notes | May cite lead ID via Cross Reference |

---

## 7. Approval Workflow

| Gate | Actor |
|------|-------|
| Prepared | Preparer |
| Reviewed | Manager |
| Locked | Freeze/readiness process after Snapshot certification path |

AI may propose roll-forwards; cannot lock.

---

## 8. Audit Requirements

- Content hash, preparer, reviewer  
- Snapshot Version pin when locked  
- GL/Fact Snapshot tie-out evidence  
- Line-level source references  
- Version history |

---

## 9. Multi-Framework Note

Leads are **framework-agnostic control schedules**. Framework presentation mapping occurs in EFRE Mapping Engine on sealed facts. Optional `taxonomy_hint` on lines is non-authoritative assistance only.

---

## 10. Certification

Lead Schedule Architecture is **CERTIFIED**.
