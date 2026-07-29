# 05 — Close Workflow

**Pillar:** Enterprise Financial Close Platform (EFCP)  
**Version:** 6.1.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Close Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Define the controlled Close Workflow that produces a certified Reporting Snapshot and hands off Publication Readiness to EFRE — without binding statutory statements to live GL.

---

## 2. End-to-End Workflow

```
1. Open Close Workspace (entity + Reporting Period)
2. Instantiate Close Checklist → generate Close Tasks / Milestones
3. Execute tasks in parallel with live Accounting (Operational Reports continue)
4. Perform Reconciliations → raise Blocking Issues on breaks
5. Prepare Lead Schedules + Working Papers
6. Propose Audit Adjustments → Accounting posts journals → re-extract facts
7. Seal / certify Reporting Snapshot Version (V6.0.1) under Close control
8. Lock Lead Schedules & finalize WPs to Snapshot Version
9. Close Readiness → ready (no unresolved blockers)
10. Manager Review → approve | return
11. Partner Review (when required) → approve | return
12. Reporting Freeze (V6.0.1) via Close Approvals
13. Publication Readiness → ready
14. Hand-off to EFRE (Statement assembly → Validation → EFRE Review → Publication)
15. Workspace closed (or reopened for Restatement)
```

---

## 3. Stage Gates

| Gate | Entry | Exit | Fail path |
|------|-------|------|-----------|
| G1 Workspace open | Period known | Workspace in_progress | — |
| G2 Recons signed | Tasks assigned | Material recons signed_off | Blocking Issues |
| G3 Evidence complete | Leads prepared; WPs submitted | Leads reviewed; WPs reviewed | Return to preparers |
| G4 Snapshot certify | Facts extractable; audit adj posted | Snapshot Version certified | Remain in_progress |
| G5 Evidence lock | Snapshot certified | Leads locked; WPs finalized with snapshot_id | Blocking Issues |
| G6 Readiness | No blockers (or waived) | readiness=ready | Mitigate issues |
| G7 Manager Review | readiness=ready | manager approved | Return + issues |
| G8 Partner Review | manager approved (if required) | partner approved | Return + issues |
| G9 Freeze | Reviews passed | Reporting Freeze applied | — |
| G10 Publication Readiness | Freeze applied | publication_readiness=ready | — |
| G11 EFRE hand-off | Publication Readiness | SnapshotHandOff recorded | EFRE gates apply |
| G12 Close | Pack published or period parked | workspace closed | Restatement reopen |

---

## 4. Role RACI (logical)

| Activity | Preparer | Manager | Partner | Accounting | EFRE |
|----------|:--------:|:-------:|:-------:|:----------:|:----:|
| Checklist/tasks | R | A | C | C | I |
| Reconciliations | R | A | C | C | I |
| Lead / WP | R | A | C | I | I |
| Post Audit Adj | C | C | C | **R/A** | I |
| Certify Snapshot | R | A | C | C | I |
| Manager Review | C | **R/A** | I | I | I |
| Partner Review | C | C | **R/A** | I | I |
| Freeze | C | A | A | I | I |
| Assemble statements | I | I | I | I | **R/A** |
| Publish pack | I | C | A | I | **R/A** |

R=Responsible A=Accountable C=Consulted I=Informed

---

## 5. Approval Sequence

```
Close Approvals (task/milestone)
  → Manager Review approval
  → Partner Review approval (policy/required periods)
  → Freeze approval
  → Publication Readiness approval
  → EFRE Review Workflow approval (V6.0.0) for Published Pack
```

SoD: preparer ≠ sole Manager/Partner approver.

---

## 6. Parallel Operational Path

During stages 1–12, Operational Financial Reporting may continue to show **live** balances. Close Workflow does not freeze Operational Reports.

---

## 7. Restatement Re-entry

```
Published pack exists + error
  → close.workspace.reopened_for_restatement
  → Audit Adj (if needed) via Accounting
  → New Snapshot Version
  → Re-lock leads/WPs
  → Reviews → Freeze → Publication Readiness
  → EFRE restated publication (V6.0.0 / V6.0.1)
```

Prior workspace evidence retained.

---

## 8. Business Events (workflow spine)

| Stage | Representative events |
|-------|----------------------|
| Open | `close.workspace.opened` |
| Progress | `close.task.completed`, `close.recon.signed_off`, `close.issue.*` |
| Snapshot | `close.snapshot.certify_requested` → consumes/produces `fre.facts.sealed` / `fre.snapshot.certified` |
| Review | `close.manager_review.*`, `close.partner_review.*` |
| Ready | `close.readiness.ready`, `close.publication_readiness.ready` |
| Hand-off | `close.hand_off.completed` |
| Close | `close.workspace.closed` |

---

## 9. Certification

Close Workflow is **CERTIFIED**.
