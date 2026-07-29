# 04 — Reporting Adjustment Model

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Pack:** Reporting Snapshot & Period Architecture  
**Version:** 6.0.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Data Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Separate **Audit Adjustments** (books) from **Reporting Adjustments** (presentation/classification on snapshots) so adjustments remain fully traceable, Accounting retains balance ownership, and Reporting Snapshots stay reconcilable to the GL.

---

## 2. Core Distinction

| Dimension | Audit Adjustment | Reporting Adjustment |
|-----------|------------------|----------------------|
| Changes GL / recognition? | **Yes** | **No** |
| Owner of posting | **Accounting** | **EFRE** (overlay only) |
| Vehicle | Journal entries (`journal.*`) | Snapshot Version adjustment records |
| How EFRE sees it | Re-extract Fact Snapshot | Applied layer on Fact Snapshot |
| Reconcile to books | By definition in books | Must bridge back to Fact Snapshot |
| Typical use | Audit discoveries, cutoff, error correction in books | Framework reclassifications, presentation aggregations, disclosure-only classification |
| Forbidden use | — | Hiding imbalance; inventing revenue/expenses not in books |

> If recognition or measurement must change, it is an **Audit Adjustment** posted through Accounting — never a Reporting Adjustment.

---

## 3. Audit Adjustment Model

### 3.1 Attributes (logical)

| Attribute | Meaning |
|-----------|---------|
| `adjustment_id` | Identity |
| `proposal_ref` | Workpaper / auditor request |
| `journal_entry_ids[]` | Posted Accounting journals |
| `period_id` | Accounting / reporting period |
| `status` | proposed \| approved \| posted \| void |
| `included_in_fact_snapshot_seal_id` | Snapshot that reflects posted journals |
| `approvers[]` | Attribution |

### 3.2 Rules

1. EFRE must **not** post journals.  
2. Only **posted** Audit Adjustments may appear in Fact Snapshots.  
3. Posting always triggers **new Snapshot Version** if a prior seal existed for the period.  
4. Link proposal ↔ journal ↔ snapshot is mandatory for audit trail.  
5. Operational Reports show Audit Adjustments once posted to live GL (live track).

---

## 4. Reporting Adjustment Model

### 4.1 Attributes (logical)

| Attribute | Meaning |
|-----------|---------|
| `reporting_adjustment_id` | Identity |
| `snapshot_version_id` | Version it belongs to |
| `type` | reclassification \| aggregation \| presentation_split \| other_framework_presentation |
| `source_fact_keys[]` | Keys within Fact Snapshot / Dataset |
| `target_taxonomy_or_presentation_refs[]` | Presentation targets |
| `amount_delta` / `amount_from` / `amount_to` | Traceable amounts |
| `rationale` | Mandatory text |
| `framework_basis` | Framework pack + paragraph/policy ref |
| `approver_id` | Attribution |
| `materiality_ref` | Optional Materiality decision |

### 4.2 Rules

1. Sum of Fact Snapshot amounts after Reporting Adjustments for a statement must still articulate; Validation Engine enforces.  
2. Bridge report: **Fact Snapshot → Reporting Adjustments → Statement lines** is mandatory for publication.  
3. Changing adjustments on a certified/frozen version is forbidden; create successor version.  
4. Reporting Adjustments must not introduce net new economic amounts not present in Fact Snapshot (reclass only / presentation only).  
5. Multi-framework: different packs may apply different Reporting Adjustments atop the **same** Fact Snapshot via separate Snapshot Versions or pack-scoped adjustment sets recorded on the Publication Snapshot — without mutating Accounting.

---

## 5. Combined Reconciliation View (required artefact for publish)

```
Live GL  ──(not used for statutory)──► Operational Reports

Live GL
  └─ posted Audit Adjustments
        └─ Fact Snapshot (sealed)
              └─ Reporting Adjustments (versioned)
                    └─ Mapped statement lines
                          └─ Publication Snapshot
```

**Audit assertion:** Every published statement line amount = function(Fact Snapshot, Mapping, Reporting Adjustments) with reversible bridge to Accounting.

---

## 6. Subsequent Events Interaction

| Classification | Path |
|----------------|------|
| Adjusting subsequent event | Audit Adjustment → post journals → new Fact Snapshot / Snapshot Version |
| Non-adjusting subsequent event | Disclosure/Note; Reporting Adjustment only if pure presentation; else disclosure-only |
| Discovered after publish | Restatement if financials change; disclosure amendment pack otherwise |

---

## 7. Approval Matrix (logical)

| Action | Minimum approval |
|--------|------------------|
| Propose Audit Adjustment | Finance / Auditor request |
| Post Audit Adjustment | Accounting authority (+ DoA as required) |
| Apply Reporting Adjustment | Reporting preparer + approver (SoD for material) |
| Freeze with adjustments | Freeze approver |
| Publish | Review Workflow approver |

AI may draft adjustment rationales; AI may **not** approve or post.

---

## 8. Anti-Patterns (forbidden)

| Anti-pattern | Why |
|--------------|-----|
| “Reporting-only” revenue not in GL | Invents balances |
| Overwriting Fact Snapshot cells in place | Breaks seal |
| Dual posting same adj in GL and as phantom reporting amount | Double count risk |
| Using Reporting Adjustment to “fix” unbalanced TB | Masks Accounting failure |
| Deleting adjustment history from version | Audit failure |

---

## 9. Certification

Reporting Adjustment Model is **CERTIFIED**.
