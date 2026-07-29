# 01 — Financial Close Architecture

**Pillar:** Enterprise Financial Close Platform (EFCP)  
**Version:** 6.1.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Close Architecture Board  
**Prerequisites:** EFRE V6.0.0 · Reporting Snapshot V6.0.1 — CERTIFIED  
**Verdict:** CERTIFIED  

---

## 1. Business Purpose

The Enterprise Financial Close Platform governs the **controlled process** that prepares books and evidence for statutory financial reporting and **produces certified Reporting Snapshots**.

It answers:

- What must be completed before this period’s statements may be prepared?  
- Which reconciliations, lead schedules, and working papers support the snapshot?  
- What blocks readiness?  
- Who reviewed and approved?  
- Is the period publication-ready for EFRE?

**Core principle:**

> **Accounting owns financial facts.**  
> **Financial Close owns reporting readiness.**  
> **Reporting owns presentation.**  
> Close never prepares framework statements from live GL; it produces sealed Snapshot Versions that EFRE consumes.

---

## 2. Architectural Principles

| # | Principle | Implication |
|---|-----------|-------------|
| P1 | Snapshot output | Successful Close yields certified / frozen-ready Reporting Snapshot (V6.0.1) |
| P2 | No live statutory bind | EFRE may not publish from unclosed / uncertified close workspace |
| P3 | Evidence linkage | Working Papers & Lead Schedules pin Snapshot Version IDs |
| P4 | Dual-track respect | Operational live reports remain available during Close |
| P5 | Adjustment discipline | Audit Adjustments post via Accounting; Close tracks linkage |
| P6 | Review depth | Manager and Partner Review are first-class gates |
| P7 | Event-first | State changes emit `close.*` events |
| P8 | AI-governed | AI may assist checklists/reconcile flags; may not approve Close or seal snapshots |
| P9 | Multi-company | All close artefacts scoped by `company_id` (+ reporting entity) |
| P10 | Freeze respect | Does not redefine Accounting or EFRE ownership |

---

## 3. Domain Definitions

For each domain: Business Purpose, Ownership, Relationships, Lifecycle, Approval Workflow, Consumers, Business Events, Audit Requirements, Versioning, AI Readiness.

---

### 3.1 Financial Close Workspace

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Tenant container for a Reporting Entity + Reporting Period close engagement — the home of checklist, tasks, evidence, reviews, and snapshot production. |
| **Ownership** | EFCP Close Office (tenant Finance). |
| **Relationships** | Binds Reporting Period (V6.0.1); owns Checklist, Tasks, Milestones, Readiness, Reviews; produces Snapshot Version. |
| **Lifecycle** | `planned → in_progress → in_review → ready_for_snapshot → snapshot_certified → closed \| reopened_for_restatement`. |
| **Approval Workflow** | Open/close workspace may require Close Approvals / DoA. |
| **Consumers** | All Close domains; EFRE (reads readiness + snapshot); Auditors. |
| **Business Events** | `close.workspace.opened`, `close.workspace.status_changed`, `close.workspace.closed`. |
| **Audit Requirements** | Actor, timestamps, entity, period, status history. |
| **Versioning** | Workspace identity stable; reopening for restatement links new Snapshot Version lineage. |
| **AI Readiness** | AI may summarise status; cannot open/close workspace authoritatively. |

---

### 3.2 Close Checklist

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Ordered, period-type-aware catalogue of mandatory/optional close procedures (reconcile bank, verify cut-off, payroll liability, tax accruals, etc.). |
| **Ownership** | EFCP Checklist Steward (tenant templates + platform starter templates). |
| **Relationships** | Instantiates Close Tasks; gates Close Milestones; feeds Close Readiness. |
| **Lifecycle** | Template `draft → published`; Instance items `pending → in_progress → done \| na \| blocked`. |
| **Approval Workflow** | Template publish; item completion may require reviewer sign-off. |
| **Consumers** | Preparers, Managers, Partners, Readiness engine. |
| **Business Events** | `close.checklist.instantiated`, `close.checklist.item_completed`, `close.checklist.item_blocked`. |
| **Audit Requirements** | Who completed, evidence refs, N/A rationale. |
| **Versioning** | Checklist template versions; instance pinned to template version. |
| **AI Readiness** | AI may suggest missing items vs framework/period type; cannot mark mandatory items done. |

---

### 3.3 Close Tasks

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Assignable work units derived from checklist (and ad hoc), with owners, due dates, dependencies, and evidence. |
| **Ownership** | Task assignee under Close Office; escalation via Manager Review. |
| **Relationships** | Links Working Papers, Reconciliations, Lead Schedules, Blocking Issues. |
| **Lifecycle** | `todo → doing → waiting_review → done \| cancelled`. |
| **Approval Workflow** | Completion may require Close Approvals for critical tasks. |
| **Consumers** | Assignees, Manager Review, Readiness. |
| **Business Events** | `close.task.assigned`, `close.task.completed`, `close.task.reopened`. |
| **Audit Requirements** | Assignment history, completion evidence. |
| **Versioning** | Task edits audited; critical completed tasks immutable without reopen event. |
| **AI Readiness** | AI may prioritise risk; cannot complete tasks. |

---

### 3.4 Close Milestones

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Coarse gates (e.g. Subledgers closed, Reconciliations complete, Snapshot certified, Manager approved, Partner approved, Publication ready). |
| **Ownership** | EFCP Milestone Steward. |
| **Relationships** | Aggregates Checklist/Task completion; drives Close Readiness; unlocks Manager/Partner Review and Publication Readiness. |
| **Lifecycle** | `not_started → in_progress → achieved \| missed`. |
| **Approval Workflow** | Some milestones require Close Approvals. |
| **Consumers** | Executives, Readiness, EGCP calendar (optional). |
| **Business Events** | `close.milestone.achieved`, `close.milestone.missed`. |
| **Audit Requirements** | Achievement proofs and timestamp. |
| **Versioning** | Milestone definitions versioned on checklist templates. |
| **AI Readiness** | AI may forecast slip risk; cannot mark achieved. |

---

### 3.5 Close Approvals

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Formal authority records for workspace transitions, freeze requests, and material judgment calls during Close. |
| **Ownership** | EFCP; authority matrices preferably from EGCP DoA when implemented. |
| **Relationships** | Gates Milestones, Manager/Partner Review progression, Reporting Freeze request (V6.0.1). |
| **Lifecycle** | `requested → approved \| rejected`. |
| **Approval Workflow** | Self — the approval object. |
| **Consumers** | Workflow engine, Audit. |
| **Business Events** | `close.approval.requested`, `close.approval.granted`, `close.approval.rejected`. |
| **Audit Requirements** | Actor, scope, decision, comments. |
| **Versioning** | Immutable once decided. |
| **AI Readiness** | AI cannot grant approvals. |

---

### 3.6 Close Readiness

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Computed/declared posture: whether the workspace may certify a Reporting Snapshot and proceed to EFRE assembly. |
| **Ownership** | EFCP Readiness Engine. |
| **Relationships** | Reads Checklist, Tasks, Blocking Issues, Reconciliations, Lead Schedules, Reviews; writes readiness score/state. |
| **Lifecycle** | `not_ready → conditionally_ready → ready → superseded`. |
| **Approval Workflow** | Transition to `ready` may require Manager approval. |
| **Consumers** | Snapshot certification, Publication Readiness, Executives. |
| **Business Events** | `close.readiness.updated`, `close.readiness.ready`. |
| **Audit Requirements** | Snapshot of blocking criteria at ready declaration. |
| **Versioning** | Readiness assessments time-stamped; final ready stamp pinned to Snapshot Version. |
| **AI Readiness** | AI may explain gaps; cannot declare ready. |

---

### 3.7 Blocking Issues

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Register of defects that prevent readiness (unreconciled balance, missing WP, open task, material variance). |
| **Ownership** | Issue owner under Close Office. |
| **Relationships** | Blocks Milestones/Readiness; links Tasks and Review Notes. |
| **Lifecycle** | `open → mitigated → resolved \| accepted_with_waiver` (waiver via Close Approvals; never illegal override of recognition). |
| **Approval Workflow** | Waiver requires elevated approval. |
| **Consumers** | Readiness, Manager/Partner Review. |
| **Business Events** | `close.issue.opened`, `close.issue.resolved`, `close.issue.waived`. |
| **Audit Requirements** | Full issue trail and waiver rationale. |
| **Versioning** | Immutable history of status changes. |
| **AI Readiness** | AI may detect anomalies → propose issues; cannot waive. |

---

### 3.8 Lead Schedules

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Structured roll-forward / composition schedules tying GL control accounts to supporting detail supporting the Reporting Snapshot. See [04_LEAD_SCHEDULE_ARCHITECTURE.md](./04_LEAD_SCHEDULE_ARCHITECTURE.md). |
| **Ownership** | EFCP Lead Schedule Steward. |
| **Relationships** | Sourced from Accounting facts / Fact Snapshot; links Working Papers; feeds reconciliations & reviews. |
| **Lifecycle** | `draft → prepared → reviewed → locked_to_snapshot`. |
| **Approval Workflow** | Prepare / Manager Review. |
| **Consumers** | Auditors, Manager/Partner Review, EFRE notes (reference). |
| **Business Events** | `close.lead.prepared`, `close.lead.locked`. |
| **Audit Requirements** | Trace to accounts + Snapshot Version. |
| **Versioning** | Locked lead schedules pin Snapshot Version; edits create new revision. |
| **AI Readiness** | AI may draft tie-outs; preparer owns. |

---

### 3.9 Working Papers

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Evidence packs documenting procedures, judgments, and tie-outs for close assertions. See [03_WORKING_PAPER_ARCHITECTURE.md](./03_WORKING_PAPER_ARCHITECTURE.md). |
| **Ownership** | Preparer; indexed by EFCP. |
| **Relationships** | Links Tasks, Lead Schedules, Reconciliations, Review Notes; **must** link Reporting Snapshot Version when supporting certified figures. |
| **Lifecycle** | `draft → submitted → reviewed → finalized \| superseded`. |
| **Approval Workflow** | Manager / Partner review annotations. |
| **Consumers** | Auditors, Reviewers, Publication Readiness evidence index. |
| **Business Events** | `close.wp.submitted`, `close.wp.finalized`. |
| **Audit Requirements** | Custody metadata, authors, snapshot link, content hash/ref. |
| **Versioning** | WP versions; finalized WP immutable. |
| **AI Readiness** | AI may draft narrative; cannot finalize. |

---

### 3.10 Reconciliations

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Controlled reconciliations (bank, subledger-to-GL, intercompany precursor, clearing accounts) proving GL integrity before snapshot seal. |
| **Ownership** | Reconciler under Close; bank recon may integrate existing Accounting recon capabilities as consumer. |
| **Relationships** | Produces evidence for Lead Schedules & Working Papers; opens Blocking Issues on breaks. |
| **Lifecycle** | `open → matched → broken → resolved → signed_off`. |
| **Approval Workflow** | Sign-off via Close Approvals / Manager Review for material accounts. |
| **Consumers** | Readiness, Auditors. |
| **Business Events** | `close.recon.signed_off`, `close.recon.break_detected`. |
| **Audit Requirements** | Break items, resolutions, signer. |
| **Versioning** | Signed-off recon pinned to date/snapshot. |
| **AI Readiness** | AI may suggest matches; cannot sign off. |

---

### 3.11 Audit Adjustments (Close context)

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Close-tracked proposals that become **Accounting** journals (V6.0.1 Audit Adjustment); Close owns workflow visibility and linkage to Snapshot Versions — **not** posting. |
| **Ownership** | Proposal: Close/Audit; Posting: **Accounting**. |
| **Relationships** | Tasks, Working Papers, Snapshot Version delta, Review Notes. |
| **Lifecycle** | Aligns V6.0.1: `proposed → approved → posted → included_in_snapshot`. |
| **Approval Workflow** | Close Approvals + Accounting post authority (+ DoA). |
| **Consumers** | Accounting, Snapshot Versioning, Auditors. |
| **Business Events** | `close.adjustment.proposed`, `close.adjustment.posted_reflected` (after Accounting post + re-extract). |
| **Audit Requirements** | Proposal ↔ journal ↔ Snapshot Version bridge. |
| **Versioning** | Versioned per V6.0.1; never in-place snapshot mutation. |
| **AI Readiness** | AI may propose; cannot post. |

---

### 3.12 Review Notes

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Comment/query thread on tasks, WPs, lead schedules, or financial captions during review. |
| **Ownership** | Author (preparer/manager/partner); resolution by assignee. |
| **Relationships** | Attached to WP/Lead/Task; may spawn Blocking Issues. |
| **Lifecycle** | `open → answered → cleared \| escalated`. |
| **Approval Workflow** | Clearance by note author or designated reviewer. |
| **Consumers** | Manager/Partner Review, Auditors. |
| **Business Events** | `close.review_note.opened`, `close.review_note.cleared`. |
| **Audit Requirements** | Full thread retained. |
| **Versioning** | Immutable thread; no silent deletes. |
| **AI Readiness** | AI may draft replies; human clears. |

---

### 3.13 Manager Review

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | First formal review gate of close evidence and readiness before Partner Review / snapshot certify. |
| **Ownership** | Designated Manager / Financial Controller. |
| **Relationships** | Consumes checklist, WPs, leads, recon, readiness; emits Close Approvals. |
| **Lifecycle** | `not_started → in_progress → approved \| returned`. |
| **Approval Workflow** | Manager approval decision. |
| **Consumers** | Partner Review, Readiness. |
| **Business Events** | `close.manager_review.approved`, `close.manager_review.returned`. |
| **Audit Requirements** | Reviewer, scope, findings. |
| **Versioning** | Decision immutable; return reopens tasks. |
| **AI Readiness** | AI may highlight high-risk WPs; cannot approve. |

---

### 3.14 Partner Review

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Senior / engagement partner (or board-equivalent) review gate for high-assurance statutory periods prior to Publication Readiness. |
| **Ownership** | Partner / CFO / Audit Committee designate (tenant-defined). |
| **Relationships** | Follows Manager Review; gates Publication Readiness and Reporting Freeze request. |
| **Lifecycle** | `not_started → in_progress → approved \| returned`. |
| **Approval Workflow** | Partner approval; SoD vs preparer mandatory. |
| **Consumers** | Publication Readiness, EFRE Review Workflow (may align). |
| **Business Events** | `close.partner_review.approved`, `close.partner_review.returned`. |
| **Audit Requirements** | Senior sign-off record. |
| **Versioning** | Immutable decision. |
| **AI Readiness** | AI cannot partner-approve. |

---

### 3.15 Publication Readiness

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Final Close posture asserting certified Reporting Snapshot + reviews complete so EFRE may assemble and publish under V6.0.0 / V6.0.1 rules. |
| **Ownership** | EFCP Publication Readiness Steward. |
| **Relationships** | Requires Close Readiness=ready, Snapshot certified/frozen, Manager (+ Partner if required) approved, no blocking issues. Hands off to EFRE Publication / Review Workflow. |
| **Lifecycle** | `not_ready → ready → handed_off_to_efre → superseded`. |
| **Approval Workflow** | May require final Close Approval. |
| **Consumers** | EFRE Publication Engine, EGCP filing obligations. |
| **Business Events** | `close.publication_readiness.ready`, `close.hand_off.completed`. |
| **Audit Requirements** | Checklist of gate proofs + Snapshot Version ID. |
| **Versioning** | Readiness stamp pinned to Snapshot Version + later Published Pack Version. |
| **AI Readiness** | AI may verify gate checklist; cannot declare ready. |

---

## 4. Cross-Pillar Ownership Matrix

| Concern | Owner |
|---------|-------|
| Journals / balances | Accounting |
| Certified Reporting Snapshot | Produced under EFCP; defined by V6.0.1 |
| Framework statements / notes / publication artefacts | EFRE V6.0.0 |
| Live IS/BS/CF/TB | Operational Financial Reporting |
| DoA matrices | EGCP (when implemented) |

---

## 5. Certification

Financial Close Architecture (all 15 domains) is **CERTIFIED**.
