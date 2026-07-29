# 03 — Working Paper Architecture

**Pillar:** Enterprise Financial Close Platform (EFCP)  
**Version:** 6.1.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Close Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Business Purpose

Working Papers are the **evidence backbone** of Financial Close. They document procedures performed, judgments made, and quantitative tie-outs that support certified Reporting Snapshots and, ultimately, auditable publication.

**Hard rule:**

> Working Papers that support certified snapshot figures **must** link to the Reporting Snapshot Version they support.

---

## 2. Ownership

| Role | Responsibility |
|------|----------------|
| Preparer | Authors WP content |
| Manager / Partner | Reviews, annotates, clears notes |
| EFCP | Indexes custody metadata, versions, links |
| DMS / Evidence store | Binary storage (EGCP Evidence custody metadata when available) |
| EFRE | May reference WP IDs via Cross Reference Engine — does not own WP authoring |

---

## 3. WP Types (logical)

| Type | Example |
|------|---------|
| Procedure WP | Cut-off testing, accrual calculation |
| Balance WP | Cash confirmation support |
| Judgment WP | Significant estimate rationale |
| Tie-out WP | Statement line ↔ lead ↔ GL |
| Adjustment WP | Support for Audit Adjustment proposal |
| Disclosure WP | Support for subsequent events / contingent notes |

---

## 4. Structure (logical)

```
WorkingPaper
  ├── identity, assertion, accounts[], period
  ├── task_refs[], lead_schedule_refs[], recon_refs[]
  ├── snapshot_version_id?   # required when status=finalized AND supports snapshot amounts
  ├── versions[]
  │     └── WorkingPaperVersion (content_ref, hash, author, created_at, status)
  ├── review_notes[]
  └── sign_offs[] (manager, partner)
```

---

## 5. Lifecycle

```
draft → submitted → reviewed → finalized → (superseded)
```

| Transition | Gate |
|------------|------|
| draft → submitted | Preparer complete |
| submitted → reviewed | Manager/Partner engaged |
| reviewed → finalized | Review notes cleared; snapshot link if required |
| * → superseded | New WP version or replacement WP |

Finalized versions are **immutable**. Corrections ⇒ new version / supersession.

---

## 6. Snapshot Linkage Rules

| Condition | Snapshot link |
|-----------|---------------|
| WP supports amounts in certified Reporting Snapshot | **Mandatory** `snapshot_version_id` |
| WP supports only process narrative for open period | Optional until finalize-for-snapshot |
| Restatement | New finalized WP versions link to new Snapshot Version; prior retained |

---

## 7. Relationships

| Related | Nature |
|---------|--------|
| Close Tasks | WP fulfills task evidence |
| Lead Schedules | Tie-out source |
| Reconciliations | Attach recon sign-off |
| Review Notes | Threaded on WP |
| Audit Adjustment Proposals | Support package |
| EFRE Cross References | Optional citation from notes/disclosures |
| Publication Readiness | Evidence index includes finalized WPs |

---

## 8. Approval Workflow

| Stage | Approver |
|-------|----------|
| Submit | Preparer |
| Clear review notes | Note author / manager |
| Finalize | Manager (Partner may co-sign for high-risk) |

AI may draft; cannot finalize or clear notes authoritatively.

---

## 9. Audit Requirements

- Author, timestamps, content hash/ref  
- Snapshot Version ID when applicable  
- Review note threads retained  
- Sign-off actors  
- No silent delete of finalized WP  

---

## 10. Retention & Versioning

| Rule | Mandate |
|------|---------|
| Finalized WP | Retain ≥ related Snapshot / Published Pack retention |
| Draft abandoned | May purge per policy if never submitted |
| Legal hold | Blocks purge |

---

## 11. Certification

Working Paper Architecture is **CERTIFIED**.
