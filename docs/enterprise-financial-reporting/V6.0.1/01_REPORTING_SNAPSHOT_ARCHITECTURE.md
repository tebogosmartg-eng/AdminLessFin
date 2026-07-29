# 01 — Reporting Snapshot Architecture

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Pack:** Reporting Snapshot & Period Architecture  
**Version:** 6.0.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Data Architecture Board  
**Prerequisite:** EFRE V6.0.0 — CERTIFIED  
**Verdict:** CERTIFIED  

---

## 1. Business Purpose

The Reporting Snapshot Architecture defines how AdminLess Fin **obtains, freezes, versions, adjusts, and publishes** financial facts for Enterprise Financial Reporting — without preparing statutory statements from a live General Ledger, and without taking ownership of Accounting balances.

**Hard rule:**

> Statutory (and all other EFRE) financial statement preparation consumes **certified Reporting Snapshots** only.  
> Operational Financial Reporting continues to consume **live** Accounting facts.

---

## 2. Logical Pipeline

```
Accounting (live GL / balances / activity)     ← SoT for balances
        │
        │ extract & certify (no recognition change by Reporting)
        ▼
Fact Snapshot  ──► Reporting Dataset ──► Reporting Snapshot (versioned)
        │                                        │
        │                              Audit Adj (via Accounting books)
        │                              Reporting Adj (presentation layer)
        │                                        │
        ▼                                        ▼
Comparative Snapshot ◄──── prior immutable versions
                                                 │
                                          Reporting Freeze
                                                 │
                                        Publication Snapshot
                                                 │
                              EFRE Statement / Notes / Disclosure / Publish
                                                 │
                              Restatement / Subsequent Events (governed)
```

Operational Reports **branch off Accounting live** and never enter this pipeline.

---

## 3. Concept Definitions

For each concept: Business Purpose, Owner, Lifecycle, Relationships, Versioning, Approval Workflow, Consumers, Audit Requirements, Retention Rules, Publication Rules.

---

### 3.1 Reporting Period

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Bounded time interval for which enterprise financial statements are prepared (e.g. month, quarter, financial year, custom statutory period). |
| **Owner** | Tenant Finance / Reporting Office under EFRE; Accounting owns coinciding **book** / fy-close periods. |
| **Lifecycle** | `planned → open_for_reporting → facts_extractable → frozen → closed_for_reporting` (may reopen only via Restatement process). |
| **Relationships** | Contains one active Reporting Snapshot lineage; links to Accounting period refs; binds FrameworkBinding (V6.0.0). |
| **Versioning** | Period identity is stable; multiple Snapshot Versions exist within a period. |
| **Approval Workflow** | Period open/close for reporting may require DoA (EGCP) when implemented; not automatic from live GL. |
| **Consumers** | ReportingPeriodCase (V6.0.0), snapshot services, auditors, Operational Reports (informational only). |
| **Audit Requirements** | Record who opened/closed; link to Accounting period status; no silent period rewrite. |
| **Retention Rules** | Period metadata retained for statutory retention (≥ book retention / framework minimum). |
| **Publication Rules** | Publication Snapshot must cite Reporting Period identity immutably. |

---

### 3.2 Reporting Snapshot

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Certified, self-contained package of reporting facts for a Reporting Entity and Reporting Period, independent of live GL mutation after seal. |
| **Owner** | EFRE Reporting Data Steward (tenant under EFRE). |
| **Lifecycle** | `draft → certified → frozen → published_reference → superseded` (see Lifecycle deliverable). |
| **Relationships** | Contains Fact Snapshot(s), Reporting Dataset, optional Reporting Adjustments, Comparative Snapshot refs; yields Publication Snapshot. |
| **Versioning** | Every material change creates a new **Snapshot Version** — never in-place mutate certified content. |
| **Approval Workflow** | Certification and freeze require attributed approval; publication requires Review Workflow (V6.0.0). |
| **Consumers** | Statement / Notes / Disclosure / Validation / Publication Engines; Auditors. |
| **Audit Requirements** | Content hash, seal time, actor, Accounting source refs, adjustment trails. |
| **Retention Rules** | All certified versions retained; purged only under legal hold/retention policy. |
| **Publication Rules** | Only a Publication Snapshot derived from a frozen Reporting Snapshot may feed Published Pack Versions. |

---

### 3.3 Snapshot Version

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Immutable edition of a Reporting Snapshot within a period lineage (v1, v2, … / UUID edition). |
| **Owner** | EFRE Version Control (aligned with V6.0.0 Version Control domain). |
| **Lifecycle** | `created → certified → (frozen) → (publication_bound) → superseded`. |
| **Relationships** | Predecessor/successor links; maps to Restatement when prior publications exist. |
| **Versioning** | Monotonic lineage per Reporting Period + Reporting Entity; content addressable. |
| **Approval Workflow** | Creating a new version from frozen lineage requires Restatement or controlled unfreeze policy. |
| **Consumers** | Comparative Snapshots, Publication, Auditors. |
| **Audit Requirements** | Diff rationale, approver, link to Audit/Reporting Adjustments included. |
| **Retention Rules** | Superseded versions retained indefinitely for audit (or statutory minimum). |
| **Publication Rules** | Published packs bind to exact Snapshot Version ID — never “latest”. |

---

### 3.4 Reporting Dataset

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Structured collection of financial measures extracted from Accounting for reporting use: balances as-of, period activity, cash-flow components, dimensional tags present on journals — **as facts**, not presentation lines. |
| **Owner** | EFRE Fact Intake; values originate from Accounting. |
| **Lifecycle** | Built during extract → sealed into Fact Snapshot → becomes immutable layer of Snapshot Version. |
| **Relationships** | Sourced from Accounting RPCs/period close facts; input to Mapping Engine (V6.0.0); may include dimension keys (e.g. project) without recalculation. |
| **Versioning** | Dataset identity = Snapshot Version; no floating “current dataset”. |
| **Approval Workflow** | Dataset certification is part of Fact Snapshot / Reporting Snapshot certify step. |
| **Consumers** | Mapping, Statement Engine, Notes quantitative slots, Validation, Operational Reports **do not** consume this for live views. |
| **Audit Requirements** | Source operation refs (e.g. balance-as-of, period-activity), extract timestamp, company_id, period bounds. |
| **Retention Rules** | Retained with Snapshot Version. |
| **Publication Rules** | Must be complete for mandatory taxonomy coverage subject to Materiality (V6.0.0). |

---

### 3.5 Audit Adjustment

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Adjustment that **changes Accounting books** (journals) so the GL reflects audited truth — not a presentation-only overlay. |
| **Owner** | **Accounting** (posting); initiated/requested under audit/finance process; EFRE records linkage. |
| **Lifecycle** | `proposed → approved → posted_to_GL → reflected_in_new_Fact_Snapshot`. |
| **Relationships** | Must result in `journal.*` under Accounting; Reporting re-extracts Fact Snapshot after post. |
| **Versioning** | Traceable journal IDs; appears as delta between Snapshot Versions. |
| **Approval Workflow** | Accounting + DoA (EGCP) as required; EFRE cannot invent audit journals. |
| **Consumers** | Accounting GL, subsequent Fact Snapshots, audit workpapers. |
| **Audit Requirements** | Full journal trail; link proposal ↔ posted journal ↔ snapshot that includes it. |
| **Retention Rules** | Same as Accounting journal retention + snapshot links. |
| **Publication Rules** | Publication Snapshot must include only Audit Adjustments that are **posted** and included in Fact Snapshot — never pending. |

---

### 3.6 Reporting Adjustment

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Adjustment that affects **reporting presentation or classification within a Snapshot Version** without changing Accounting recognition (e.g. reclassification for framework presentation, aggregation overrides with rationale). |
| **Owner** | EFRE Reporting (tenant under EFRE). |
| **Lifecycle** | `draft → approved → applied_to_Snapshot_Version → immutable_with_version`. |
| **Relationships** | Layered on Fact Snapshot; inputs Mapping/Statement; distinct from Audit Adjustment. |
| **Versioning** | Stored with Snapshot Version; changing adjustments ⇒ new Snapshot Version. |
| **Approval Workflow** | Require attributed approval; material items may require DoA. |
| **Consumers** | Statement / Notes / Disclosure Engines; Auditors (reconciling to books). |
| **Audit Requirements** | Before/after amounts, rationale, framework basis, approver; must reconcile to unmodified Fact Snapshot. |
| **Retention Rules** | Retained with Snapshot Version forever for that edition. |
| **Publication Rules** | Allowed only if disclosed where framework requires; never used to hide GL imbalance. |

---

### 3.7 Fact Snapshot

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Sealed extract of Accounting financial facts (balances, activity, cash-flow components) for a Reporting Entity and Period — the **only** balance source for EFRE assembly. Specialises V6.0.0 AccountingFact Snapshot / FactSnapshotSeal. |
| **Owner** | EFRE owns the seal; Accounting owns the underlying balances. |
| **Lifecycle** | `extracting → sealed → immutable` (replacement only via new Snapshot Version). |
| **Relationships** | Core of Reporting Dataset; invalidated for publication if Accounting books change without re-extract (force new version). |
| **Versioning** | Seal ID + content hash; lineage via Snapshot Version. |
| **Approval Workflow** | Seal certification attributed; freeze elevates for publication. |
| **Consumers** | All EFRE engines for statutory packs. |
| **Audit Requirements** | Prove seal ≠ live GL at seal time; store source refs. |
| **Retention Rules** | Permanent with Snapshot Version. |
| **Publication Rules** | Publication Snapshot requires sealed Fact Snapshot; live GL forbidden. |

---

### 3.8 Comparative Snapshot

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Immutable reference to a prior-period (or restated) Snapshot Version used solely for comparative columns — never rebuilt from live GL of the prior period at statement time. |
| **Owner** | EFRE Comparative Figures Engine data contract. |
| **Lifecycle** | `bound → immutable` for the consuming Snapshot Version. |
| **Relationships** | Points to prior Snapshot Version / Publication Snapshot; restatement may bind restated comparative. |
| **Versioning** | Binding is version-pinned; changing comparative source ⇒ new current Snapshot Version. |
| **Approval Workflow** | Binding approved with Reporting Snapshot certify/freeze. |
| **Consumers** | Comparative Figures Engine, Notes, Validation articulation. |
| **Audit Requirements** | Exact prior Snapshot Version ID recorded; prove immutability. |
| **Retention Rules** | Dependent prior versions retained. |
| **Publication Rules** | Published comparatives must cite Comparative Snapshot bindings. |

---

### 3.9 Reporting Freeze

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Control state that locks a certified Snapshot Version against further Reporting Adjustments or re-extract without opening a new version / Restatement path. |
| **Owner** | EFRE Review / Reporting Office; DoA when EGCP available. |
| **Lifecycle** | `unfrozen → freeze_requested → frozen` (unfreeze only under Restatement / controlled policy creating new version). |
| **Relationships** | Prerequisite (or coincident) for Publication Snapshot; emits `fre.facts.sealed` / freeze events (catalogue extension). |
| **Versioning** | Freeze binds to Snapshot Version ID. |
| **Approval Workflow** | Freeze approval attributed; SoD preferred (preparer ≠ freezer where required). |
| **Consumers** | Publication Engine, Auditors, EGCP calendar/obligation hooks. |
| **Audit Requirements** | Freeze actor, time, version ID, checklist evidence. |
| **Retention Rules** | Freeze record retained with version. |
| **Publication Rules** | No publish from unfrozen snapshot (hard gate). |

---

### 3.10 Publication Snapshot

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Immutable composite bound for a Published Pack Version: frozen Reporting Snapshot Version + Comparative bindings + approved Reporting Adjustments + excluded pending items + metadata. |
| **Owner** | EFRE Publication Engine data contract. |
| **Lifecycle** | `assembled → approved → bound_to_PublishedPackVersion → immutable`. |
| **Relationships** | Input to V6.0.0 Publication Engine; may feed XBRL readiness export. |
| **Versioning** | 1:1 with Published Pack Version / edition. |
| **Approval Workflow** | Review Workflow approve then publish (V6.0.0). |
| **Consumers** | Board, auditors, regulators (later), V3.6 export substrate. |
| **Audit Requirements** | Content hash of composite; all component version IDs. |
| **Retention Rules** | Same as published pack retention. |
| **Publication Rules** | Sole allowed fact basis for statutory publication; live Operational Reports must not be labelled as this. |

---

### 3.11 Restatement

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Governed process to issue a new Snapshot Version and Publication Snapshot that supersedes a previously published edition due to error, framework change application, or audit outcome. |
| **Owner** | EFRE Version Control + Finance; Accounting participates if Audit Adjustments required. |
| **Lifecycle** | `initiated → books_adjusted_if_needed → new_Fact_Snapshot → new_Reporting_Snapshot_Version → freeze → publish_restatement`. |
| **Relationships** | Links prior Publication Snapshot; updates Comparative bindings for future periods; disclosure of restatement. |
| **Versioning** | New Snapshot Version + new Published Pack Version with `restates` link (V6.0.0 EditionLink). |
| **Approval Workflow** | Elevated DoA; cannot silently replace prior publication. |
| **Consumers** | Auditors, prior-period comparative consumers, EGCP obligations if filings amended. |
| **Audit Requirements** | Bridge schedule (old vs new), rationale, approvals, journal IDs if books changed. |
| **Retention Rules** | Original and restated editions both retained. |
| **Publication Rules** | Restated pack must reference prior edition; Operational Reports remain live and independent. |

---

### 3.12 Subsequent Events

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Events after the Reporting Period end (and/or after Reporting Freeze) that may require disclosure and/or adjusting treatment under the bound Framework Pack — without silently mutating a frozen Publication Snapshot. |
| **Owner** | EFRE Disclosure/Notes + Finance judgment; adjusting subsequent events that affect recognition are **Audit Adjustments** posted via Accounting then re-snapshot. |
| **Lifecycle** | `identified → classified (adjusting \| non-adjusting) → actioned (post+re-snapshot \| disclose_only) → closed`. |
| **Relationships** | Framework Policy / Disclosure Engine; may trigger Restatement if identified after publication. |
| **Versioning** | Adjusting path ⇒ new Snapshot Version; non-adjusting ⇒ Disclosure/Note on same or new version per freeze state. |
| **Approval Workflow** | Classification approved; adjusting path uses Audit Adjustment workflow. |
| **Consumers** | Disclosure Engine, Notes Engine, Auditors. |
| **Audit Requirements** | Event log, classification, framework reference, linkage to journals or disclosure IDs. |
| **Retention Rules** | Retained with period/pack evidence. |
| **Publication Rules** | After freeze: adjusting events require new version; no in-place mutation of Publication Snapshot. |

---

## 4. Dual-Track Guardrails (from V6.0.0 Migration)

| Track | Fact source | Snapshot mandatory? |
|-------|-------------|---------------------|
| Operational Financial Reporting | Live Accounting | **No** |
| Enterprise Financial Reporting | Fact Snapshot → Reporting Snapshot | **Yes** |

---

## 5. Multi-Framework Support

Reporting Snapshots and Fact Snapshots are **framework-agnostic financial facts**. Framework Packs (IFRS, IFRS for SMEs, GRAP, Modified Cash, IPSAS, Future) consume the same sealed facts via Mapping — they do not each extract live GL separately for statutory packs.

---

## 6. Event Extensions (`fre.*`)

Additive logical events (registration under Implementation Approval):

| Event | Concept |
|-------|---------|
| `fre.period.opened` / `fre.period.closed_for_reporting` | Reporting Period |
| `fre.snapshot.version_created` | Snapshot Version |
| `fre.snapshot.certified` | Reporting Snapshot |
| `fre.facts.sealed` | Fact Snapshot (already in V6.0.0) |
| `fre.freeze.applied` / `fre.freeze.released_for_restatement` | Reporting Freeze |
| `fre.adjustment.audit_posted` | Audit Adjustment reflected |
| `fre.adjustment.reporting_applied` | Reporting Adjustment |
| `fre.publication_snapshot.bound` | Publication Snapshot |
| `fre.restatement.initiated` / `fre.pack.restated` | Restatement |
| `fre.subsequent_event.classified` | Subsequent Events |

---

## 7. Certification

Reporting Snapshot Architecture (all 12 concepts) is **CERTIFIED**.
