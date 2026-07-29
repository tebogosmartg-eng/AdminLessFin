# 02 — Financial Close Domain Model

**Pillar:** Enterprise Financial Close Platform (EFCP)  
**Version:** 6.1.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Close Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Logical enterprise domain model for Financial Close. **Not** physical schema, ORM, or API design.

---

## 2. Ubiquitous Language

| Term | Meaning |
|------|---------|
| **Close Workspace** | Engagement container for entity + reporting period close |
| **Checklist Template / Instance** | Procedure catalogue and its period instantiation |
| **Close Task** | Assignable unit of close work |
| **Milestone** | Coarse gate within the workspace |
| **Close Approval** | Formal decision record |
| **Close Readiness** | Whether snapshot certification is allowed |
| **Blocking Issue** | Defect preventing readiness |
| **Lead Schedule** | Control-account composition / roll-forward schedule |
| **Working Paper (WP)** | Evidence document/pack for a procedure or assertion |
| **Reconciliation** | Controlled match of balances / subledgers |
| **Audit Adjustment (Close)** | Proposal tracked in Close; posted by Accounting |
| **Review Note** | Query/comment in review |
| **Manager / Partner Review** | Formal review gates |
| **Publication Readiness** | Hand-off posture to EFRE |
| **Snapshot Hand-off** | Binding of certified Snapshot Version leaving Close into EFRE |

---

## 3. Aggregate Map

```
Company
└── ReportingEntity
      └── CloseWorkspace* (reporting_period_id)
            ├── ChecklistInstance → ChecklistItem*
            ├── CloseTask*
            ├── Milestone*
            ├── CloseApproval*
            ├── CloseReadinessAssessment*
            ├── BlockingIssue*
            ├── Reconciliation*
            ├── LeadSchedule* → LeadScheduleLine*
            ├── WorkingPaper* → WorkingPaperVersion*
            ├── AuditAdjustmentProposal* → journal_ref?
            ├── ReviewNote*
            ├── ManagerReviewCase
            ├── PartnerReviewCase
            ├── PublicationReadinessStamp
            └── SnapshotHandOff → snapshot_version_id (V6.0.1)
```

---

## 4. Core Entities (logical)

| Entity | Identity | Key attributes | Invariants |
|--------|----------|----------------|------------|
| `CloseWorkspace` | company + entity + period | status, opened_by, closed_at | One active non-restatement workspace per entity/period |
| `ChecklistInstance` | workspace + template_version | items[] | Template version immutable |
| `CloseTask` | workspace + task_id | owner, due, status, evidence_refs | Critical done tasks reopen via event |
| `Milestone` | workspace + milestone_key | status, achieved_at | Achievement requires evidence |
| `CloseApproval` | approval_id | scope, actor, decision | Immutable once decided |
| `CloseReadinessAssessment` | workspace + assessment_id | state, blockers[], snapshot_ready | `ready` requires zero blocking (unless waived) |
| `BlockingIssue` | issue_id | severity, status, waiver_ref? | Waiver needs CloseApproval |
| `Reconciliation` | recon_id | type, status, break_items[] | Sign-off attributed |
| `LeadSchedule` | lead_id | account_control, snapshot_version_id?, status | Locked ⇒ snapshot pin required |
| `WorkingPaper` | wp_id | assertion, snapshot_version_id?, status | Finalized ⇒ immutable version |
| `AuditAdjustmentProposal` | proposal_id | amounts, journal_ids[], snapshot_version_id? | Posted only via Accounting |
| `ReviewNote` | note_id | target_ref, status | Thread retained |
| `ManagerReviewCase` | workspace | state, reviewer | SoD vs preparer |
| `PartnerReviewCase` | workspace | state, reviewer | SoD vs preparer/manager |
| `PublicationReadinessStamp` | workspace | ready_at, snapshot_version_id, gates[] | Pins Snapshot Version |
| `SnapshotHandOff` | handoff_id | snapshot_version_id, fre_case_ref? | Snapshot must be certified per V6.0.1 |

---

## 5. Anti-Duplication Invariants

| Forbidden | Owner of truth instead |
|-----------|------------------------|
| Parallel GL balances in Close | Accounting / Fact Snapshot |
| Framework statement layouts in Close | EFRE |
| Reporting Adjustments as journals | V6.0.1 Reporting Adjustment (EFRE) vs Audit Adj (Accounting) |
| Snapshot without workspace readiness for statutory path | Close Readiness + Publication Readiness |
| WP supporting published figures without Snapshot Version link | Working Paper Architecture |

---

## 6. Certification

Financial Close Domain Model is **CERTIFIED**.
