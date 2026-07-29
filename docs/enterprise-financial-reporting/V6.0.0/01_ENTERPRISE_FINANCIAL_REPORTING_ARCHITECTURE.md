# 01 — Enterprise Financial Reporting Architecture

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Business Purpose

The Enterprise Financial Reporting Engine is the **single source of truth** for preparing enterprise-grade financial statements and related disclosures across multiple reporting frameworks — without modifying the underlying Accounting Engine.

It answers questions that Accounting alone must not answer as presentation truth:

- Which framework applies to this reporting entity and period?
- How do chart-of-accounts balances map to framework taxonomy lines?
- Which statements, notes, and disclosures are required?
- How are comparative figures and restatements presented?
- Are the statements articulated, complete, and materiality-scoped?
- Who reviewed and approved the pack, and what was published?

**Core principle:**

> **Accounting owns financial facts.**  
> **Operational Reports own operational presentation.**  
> **Enterprise Financial Reporting owns statutory financial reporting.**  
> **EFRE never recalculates recognition. Accounting never owns framework layouts. Operational Reports never own statutory publication.**

---

## 2. Pillar Position in AdminLess Fin

```
┌─────────────────────────────────────────────────────────────────┐
│                    AdminLess Fin Core Pillars                     │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Accounting  │   Payroll    │ Procurement  │  HR / Identity     │
│  (frozen GL) │ (frozen calc)│              │                    │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│              Enterprise Work Management (operational)             │
├─────────────────────────────────────────────────────────────────┤
│  EGCP V5.0.0 — Legislation · Policy · DoA · Obligations (def.)   │
├─────────────────────────────────────────────────────────────────┤
│  ★ Enterprise Financial Reporting Engine (V6.0.0) ★              │
│  Frameworks · Statements · Disclosures · Notes · Publication     │
├─────────────────────────────────────────────────────────────────┤
│  Platforms: Edge V4.2.1 · Business Events V4.3.0 · KPI V4.1.5    │
│  V3.6 Reporting Platform: export/registry substrate (optional)   │
│  Evolution Governance: V4.4.0 (orthogonal product change control) │
└─────────────────────────────────────────────────────────────────┘
```

EFRE is **not** a payroll report pack, **not** EGCP Governance Reporting, and **not** a second ledger.

---

## 3. Architectural Principles

| # | Principle | Implication |
|---|-----------|-------------|
| P1 | Accounting SoT for balances | Sealed AccountingFact Snapshots only; no parallel GL |
| P2 | Reporting SoT for presentation | Framework packs, mappings, statements, notes, disclosures |
| P3 | No calc duplication | Mapping classifies amounts; never invents or recomputes balances |
| P4 | Multi-framework | IFRS, IFRS for SMEs, GRAP, Modified Cash, IPSAS, Future Packs |
| P5 | Version everything | Framework packs, mappings, policies, published packs effective-dated |
| P6 | Multi-company | All tenant artefacts scoped by `company_id` (+ optional `reporting_entity_id`) |
| P7 | Immutable publication | Published packs are sealed; corrections via restatement editions |
| P8 | Event-first integration | State changes emit `fre.*` business events (V4.3.0 namespace) |
| P9 | AI-ready but AI-governed | Draft/gap assist only; seal, approve, publish remain human/DoA |
| P10 | Freeze respect | `journal.*` / `period.*`, payroll formulas, EGCP ownership preserved |
| P11 | XBRL-ready | Taxonomy concept bindings first-class; full taxonomy product deferred |
| P12 | Substrate reuse | V3.6 may host export artefacts; must not redefine framework semantics |

---

## 4. Domain Architecture (logical)

```
Enterprise Financial Reporting Engine
├── Framework Management           # Versioned framework packs
├── Mapping Engine                 # CoA / tags → taxonomy lines & XBRL concepts
├── Accounting Policy Engine       # Presentation / classification / disclosure policies
├── Statement Engine               # Statement structures & line composition
├── Disclosure Engine              # Disclosure checklists & instances
├── Notes Engine                   # Note templates & assemblies
├── Comparative Figures Engine     # Prior-period / restated columns
├── Cross Reference Engine         # Statement ↔ note ↔ disclosure ↔ workpaper links
├── Materiality Engine             # Thresholds & qualitative scoping
├── Validation Engine              # Articulation & completeness
├── Review Workflow                # Prepare → Review → Approve
├── Publication Engine             # Immutable published packs
├── Version Control                # Pack lineage, supersession, restatement
└── XBRL Readiness                 # Concept tags & export contracts
```

**Pipeline (published packs):**

```
period.closed / fact seal
  → AccountingFact Snapshot
  → Mapping Engine
  → Statement + Comparative + Notes + Disclosure Engines
  → Materiality + Validation
  → Review Workflow
  → Publication Engine (+ XBRL-ready artefacts)
  → Version Control
```

---

## 5. Domain Definitions

For each domain below: Purpose, Ownership, Relationships, Consumers, Business Events, Boundaries, Responsibilities, AI Readiness.

### 5.1 Statement Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Assemble framework-defined primary statements (e.g. statement of financial position, profit or loss and OCI, changes in equity, cash flows) from mapped sealed facts. |
| **Ownership** | EFRE Statement Steward. Framework packs supply definitions; Statement Engine owns instances. |
| **Relationships** | Consumes Mapping Engine outputs, Fact Snapshots, Accounting Policy presentation choices, Comparative Figures; feeds Validation, Cross Reference, Publication. |
| **Consumers** | Review Workflow, Publication Engine, Auditors, Executive, V3.6 export adapters. |
| **Business Events** | `fre.statements.generated`. |
| **Framework Boundaries** | Owns line composition per Statement Definition. Does **not** own debit/credit posting or account balances. |
| **Module Responsibilities** | Load statement definitions for bound framework; apply mappings; emit Statement Instances with line amounts and rollups. |
| **Future AI Readiness** | AI may flag unusual line movements vs prior seals; may not alter sealed amounts. |

### 5.2 Disclosure Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Determine applicable disclosures for entity/period/framework and assemble disclosure items with evidence linkage. |
| **Ownership** | EFRE Disclosure Steward. |
| **Relationships** | Reads Framework Pack disclosure catalogue, Accounting Policy Set, Materiality decisions; links to Evidence (via EGCP custody or DMS pointers); feeds Notes and Validation completeness. |
| **Consumers** | Reviewers, Auditors, Publication Engine. |
| **Business Events** | `fre.disclosures.assembled`. |
| **Framework Boundaries** | Owns applicability logic and Disclosure Instances. Does **not** own source transaction data or recognition. |
| **Module Responsibilities** | Resolve checklist; mark applicable / N/A with rationale; bind quantitative/narrative payloads; attach evidence refs. |
| **Future AI Readiness** | AI may propose gap lists vs framework checklist; cannot waive mandatory disclosures without Exception/DoA path. |

### 5.3 Notes Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Produce note assemblies (narrative + quantitative) with stable numbering and cross-statement references. |
| **Ownership** | EFRE Notes Steward. |
| **Relationships** | Consumes Statement lines, Disclosure Instances, Mapping roll-ups, Comparative Figures; integrates with Cross Reference Engine. |
| **Consumers** | Review Workflow, Publication, Auditors. |
| **Business Events** | `fre.notes.assembled`. |
| **Framework Boundaries** | Owns Note Definitions and Note Instances. Does **not** recalculate GL; quantitative note figures derive from sealed facts + mapping. |
| **Module Responsibilities** | Instantiate note templates; maintain numbering; keep totals reconcilable to statements via Validation. |
| **Future AI Readiness** | AI may draft narrative notes from templates and prior packs; publish requires Review + DoA. |

### 5.4 Mapping Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Sole authority for mapping Chart of Accounts accounts, account types, and tags to framework taxonomy lines and XBRL concept bindings. |
| **Ownership** | Tenant Mapping Steward under EFRE; default maps may ship with Framework Packs. |
| **Relationships** | Bridges Accounting CoA to Statement/Notes/Disclosure/XBRL; versioned ChartMapping Sets supersede without mutating journals. |
| **Consumers** | Statement Engine, Notes Engine, Validation Engine, XBRL Readiness. |
| **Business Events** | `fre.mapping.published`, `fre.mapping.superseded`. |
| **Framework Boundaries** | Owns MappingLines. Does **not** create phantom balances or change Accounting recognition. |
| **Module Responsibilities** | Version mappings; resolve account → taxonomy_line (+ xbrl_concept); reject unmapped material accounts per Materiality/Validation policy. |
| **Future AI Readiness** | AI may propose mappings from account names/types; stewards publish; AI never auto-publishes production maps. |

### 5.5 Accounting Policy Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Capture tenant-selected accounting policies that affect **presentation, classification, and disclosure** under a framework (e.g. expense classification, presentation of OCI items, cash flow method election where framework allows presentation choice). |
| **Ownership** | Tenant Finance Policy Owner via EFRE. |
| **Relationships** | Constrains Statement presentation choices and Disclosure/Notes content; does **not** replace Accounting measurement engines. |
| **Consumers** | Statement, Disclosure, Notes, Validation. |
| **Business Events** | `fre.policy.set_published`. |
| **Framework Boundaries** | Owns AccountingPolicySet versions for reporting. Does **not** own recognition/measurement (Accounting) or tax legislation constants (EGCP). |
| **Module Responsibilities** | Version policy elections; bind to ReportingPeriodCase; expose policy texts for notes. |
| **Future AI Readiness** | AI may suggest policy note wording vs framework examples; elections require human ownership. |

### 5.6 Comparative Figures Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Present prior-period and restated comparative columns consistently with the active Framework Pack, sourced only from sealed historical snapshots (or restatement editions). |
| **Ownership** | EFRE Comparative Steward. |
| **Relationships** | Reads prior FactSnapshotSeals and PublishedPackVersions; feeds Statement and Notes columns. |
| **Consumers** | Statement Engine, Notes Engine, Validation, Auditors. |
| **Business Events** | (Emitted via statement/note assembly; restatement via `fre.pack.restated`.) |
| **Framework Boundaries** | Owns comparative column composition. Does **not** rewrite closed-period journals (Accounting owns reopen/restatement of books). |
| **Module Responsibilities** | Align comparative taxonomy; apply reclassification presentation when mapping/policy editions differ with disclosure of restatement. |
| **Future AI Readiness** | AI may highlight restatement bridges; cannot invent comparative amounts. |

### 5.7 Cross Reference Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Maintain bidirectional links among statement lines, notes, disclosures, working papers, and evidence objects for navigation and audit. |
| **Ownership** | EFRE Cross Reference Steward. |
| **Relationships** | Connects Statement, Notes, Disclosure, Validation findings, Publication artefacts; may point to EGCP Evidence IDs / DMS blobs. |
| **Consumers** | Reviewers, Auditors, Publication (TOC / note refs), Audit workpaper consumers. |
| **Business Events** | Implicit in assembly/publication payloads; no separate mutating ledger. |
| **Framework Boundaries** | Owns link graph metadata. Does **not** own document storage product. |
| **Module Responsibilities** | Enforce referential integrity of note numbers and disclosure IDs within a pack version. |
| **Future AI Readiness** | AI may suggest missing cross-refs; cannot delete published link graphs. |

### 5.8 Materiality Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Define quantitative thresholds and qualitative factors that scope aggregation, omitting immaterial line items, and disclosure focus — without altering sealed recognition amounts. |
| **Ownership** | Tenant Finance under EFRE Materiality Steward. |
| **Relationships** | Informs Mapping unmapped-account handling, Disclosure N/A rationales, Statement aggregation, Validation severity. |
| **Consumers** | Mapping, Disclosure, Statement, Validation, Review. |
| **Business Events** | `fre.materiality.decided`. |
| **Framework Boundaries** | Owns MaterialityProfile and decisions for a case. Does **not** change Accounting amounts. |
| **Module Responsibilities** | Store profiles; record decisions with rationale; surface materiality basis in notes/disclosures where required. |
| **Future AI Readiness** | AI may propose threshold benchmarks from sealed totals; decisions remain attributable. |

### 5.9 Validation Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Prove articulation (e.g. statement of financial position balances, cash flow links, note totals vs statements) and completeness against the Framework Pack checklist for the period case. |
| **Ownership** | EFRE Validation Steward. |
| **Relationships** | Consumes Statement, Notes, Disclosure, Comparative, Cross Reference, Materiality; gates Review submission. |
| **Consumers** | Review Workflow, Publication (must not publish on blocking fails), Auditors. |
| **Business Events** | `fre.validation.passed`, `fre.validation.failed`. |
| **Framework Boundaries** | Owns ValidationRun results. Does **not** silently correct GL imbalances (report fail; Accounting remediates books). |
| **Module Responsibilities** | Execute framework ValidationRules; classify blocking vs advisory; seal run ID onto PublishedPackVersion. |
| **Future AI Readiness** | AI may triage advisory findings; cannot override blocking validation without governed exception. |

### 5.10 Review Workflow

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Govern Prepare → Review → Approve (and Reject/Return) lifecycle for a ReportingPeriodCase pack before publication. |
| **Ownership** | Tenant Finance / Audit Committee via EFRE; authority limits from EGCP DoA when implemented. |
| **Relationships** | Requires Validation pass (blocking); emits review events; unlocks Publication on approve. |
| **Consumers** | Preparers, Reviewers, Approvers, Audit trail. |
| **Business Events** | `fre.review.submitted`, `fre.review.approved`, `fre.review.rejected`. |
| **Framework Boundaries** | Owns workflow state for reporting packs. Does **not** execute cash/bank payments or reopen GL periods. |
| **Module Responsibilities** | Enforce state machine; record actors and comments; respect SoD (preparer ≠ sole approver where DoA requires). |
| **Future AI Readiness** | AI may summarise review findings; cannot approve or advance state. |

### 5.11 Publication Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Emit immutable Published Pack Versions with distribution metadata (audience, channel, timestamp) for statutory, board, and auditor consumption. |
| **Ownership** | EFRE Publication Steward. |
| **Relationships** | Consumes approved pack contents; may use V3.6 exporters for CSV/PDF/Excel/JSON artefacts; notifies EGCP obligations where filings apply. |
| **Consumers** | Board, Regulators (via gateway later), Auditors, Archives. |
| **Business Events** | `fre.pack.published`, `fre.pack.superseded`. |
| **Framework Boundaries** | Owns publication seals and artefact indexes. Does **not** expose live mutable preview GL as “published”. |
| **Module Responsibilities** | Seal content hash; freeze content refs (framework, mapping, fact seal, policy, validation, approver); ban in-place edit. |
| **Future AI Readiness** | AI may generate reader summaries of published packs; cannot publish. |

### 5.12 Version Control

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Maintain lineage of Reporting Pack editions: supersession chains and restatement editions with clear relationship to Accounting book history. |
| **Ownership** | EFRE Version Control Steward. |
| **Relationships** | Tracks PublishedPackVersion graph; restatement triggers Comparative and Disclosure of changes. |
| **Consumers** | Auditors, Publication, Comparative Figures Engine. |
| **Business Events** | `fre.pack.restated`, `fre.pack.superseded`. |
| **Framework Boundaries** | Owns pack edition lineage. Does **not** own Accounting period reopen (Accounting). |
| **Module Responsibilities** | Assign edition IDs; link predecessor/successor; prevent silent replace of published editions. |
| **Future AI Readiness** | AI may produce restatement narrative bridges; amounts still from sealed facts + mappings. |

### 5.13 XBRL Readiness

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Ensure every taxonomy line and material disclosure can bind to an XBRL (or equivalent) concept under a taxonomy version — enabling future machine filing without redesigning EFRE. |
| **Ownership** | EFRE XBRL Steward + Framework Pack authors. |
| **Relationships** | Extends Mapping and Framework TaxonomyLines with `XbrlConceptBinding`; Publication may emit `fre.xbrl.export_ready`. |
| **Consumers** | Future filing gateways, Auditors, Regulators. |
| **Business Events** | `fre.xbrl.export_ready`. |
| **Framework Boundaries** | Owns tagging model and export contracts. Does **not** ship a complete commercial taxonomy product or regulator gateway in V6.0.0 definitional scope. |
| **Module Responsibilities** | Require concept bindings for published mandatory lines; version taxonomy references with Framework Pack. |
| **Future AI Readiness** | AI may suggest concept matches; bindings require steward publication. |

### 5.14 Framework Management

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Platform registry of versioned Framework Packs (IFRS, IFRS for SMEs, GRAP, Modified Cash Standard, IPSAS, Future) including statement, taxonomy, disclosure, note, validation, and XBRL binding definitions. |
| **Ownership** | Platform Framework Steward (AdminLess Fin Architecture Board). Tenants bind; tenants do not mutate platform packs. |
| **Relationships** | Feeds all EFRE engines; tenant FrameworkBinding selects pack per ReportingEntity/period. |
| **Consumers** | All EFRE domains; Mapping (defaults); Validation; XBRL Readiness. |
| **Business Events** | `fre.framework.pack_published`, `fre.framework.version_activated`, `fre.framework.binding_set`. |
| **Framework Boundaries** | Owns Framework Pack content & versions. Does **not** own country tax legislation packs (EGCP) or payroll statutory constants. |
| **Module Responsibilities** | Register packs; effective-date versions; resolve by framework_key + version + reporting date; attach provenance. |
| **Future AI Readiness** | AI may diff pack versions for impact analysis; cannot silently activate packs. |

---

## 6. Supported Framework Packs

| Pack | Presentation role |
|------|-------------------|
| **IFRS** | Full IFRS primary statements, notes, disclosures |
| **IFRS for SMEs** | Reduced disclosure / SME statement set |
| **GRAP** | South African public-sector GRAP presentation |
| **Modified Cash Standard** | Modified cash basis presentation rules |
| **IPSAS** | International public-sector presentation |
| **Future Packs** | Additive registration without Accounting change |

One active FrameworkBinding per ReportingEntity per ReportingPeriodCase.

---

## 7. Dual-Track Reporting (Operational + Enterprise)

AdminLess Fin retains the existing Financial Statements capability under Reports as **Operational Financial Reporting**. It is **not** deprecated, deleted, or removed.

| Track | Owner | Path |
|-------|-------|------|
| **Operational Financial Reporting** | Existing Reports / Financial Statements | Accounting → Operational Reports → live Financial Reports (IS, BS, Cash Flow, TB, Ratios) |
| **Enterprise Financial Reporting** | EFRE | Accounting → EFRE → Statement Preparation → Disclosures → Notes → Comparatives → Validation → Review → Publication |

Both consume Accounting as the single source of balances. Neither recalculates recognition. Statutory/standards packs are EFRE-authoritative; live operational statements remain Operational Financial Reporting–authoritative.

Full migration contract: [08_MIGRATION_STRATEGY.md](./08_MIGRATION_STRATEGY.md).

---

## 8. Multi-Company & Future Consolidation

| Capability | V6.0.0 |
|------------|--------|
| Tenant isolation by `company_id` | Required |
| Optional `reporting_entity_id` (default = company) | Reserved |
| Group consolidation / eliminations | Future pack capability — reserved in domain model, not required to certify V6.0.0 |

---

## 9. Certification

Enterprise Financial Reporting Architecture (all 14 domains) is **CERTIFIED**.

Implementation designs must cite this document domain-by-domain and must not collapse EFRE into Accounting or EGCP.
