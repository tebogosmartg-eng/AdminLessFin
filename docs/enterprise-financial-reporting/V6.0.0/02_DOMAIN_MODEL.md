# 02 — Domain Model

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Define the logical enterprise domain model for EFRE. This is a **business domain** model — not a physical schema, ORM, or API design.

---

## 2. Ubiquitous Language

| Term | Meaning |
|------|---------|
| **Framework Pack** | Versioned, platform-published set of statement, taxonomy, disclosure, note, validation, and XBRL binding definitions for a reporting framework |
| **Framework Binding** | Tenant selection of a Framework Pack version for a Reporting Entity and period |
| **Reporting Entity** | Legal or reporting unit that prepares statements (defaults to company; future group parent reserved) |
| **Reporting Period Case** | Work object for preparing a pack for a specific period under a binding |
| **AccountingFact Snapshot** | Sealed, immutable copy/reference of Accounting balances and period activity used as EFRE input |
| **Fact Snapshot Seal** | Cryptographic/content identity binding a snapshot to period, company, and time |
| **Taxonomy Line** | Framework-defined presentation line (statement section/row) |
| **Chart Mapping Set** | Versioned set of mappings from CoA accounts/tags to Taxonomy Lines and XBRL concepts |
| **Accounting Policy Set** | Versioned tenant elections affecting presentation/classification/disclosure (not recognition) |
| **Statement Instance** | Concrete primary statement for a period case |
| **Disclosure Instance** | Concrete disclosure item status and content for a period case |
| **Note Instance** | Concrete note assembly for a period case |
| **Materiality Profile** | Thresholds and qualitative factors for scoping |
| **Validation Run** | Sealed result of applying Validation Rules to a period case |
| **Review Workflow Case** | Prepare → Review → Approve state machine for a pack |
| **Published Pack Version** | Immutable published edition of statements, notes, disclosures, and metadata |
| **Restatement Edition** | New Published Pack Version that supersedes a prior edition with disclosed changes |
| **XBRL Concept Binding** | Link from Taxonomy Line / disclosure to a concept in a named taxonomy version |
| **Cross Reference** | Bidirectional link among line, note, disclosure, workpaper, evidence |

---

## 3. Aggregate Map

```
Company (tenant)
└── ReportingEntity* (default = company; consolidation parent reserved)
      ├── FrameworkBinding (framework_pack_id, effective_periods)
      ├── AccountingPolicySet*
      ├── ChartMappingSet*
      │     └── MappingLine* (account_id | account_tag → taxonomy_line | xbrl_concept)
      ├── MaterialityProfile*
      └── ReportingPeriodCase*
            ├── FactSnapshotSeal → AccountingFact Snapshot
            ├── StatementInstance*
            ├── DisclosureInstance*
            ├── NoteInstance*
            ├── CrossReference*
            ├── ValidationRun*
            ├── ReviewWorkflowCase
            └── PublishedPackVersion* (immutable)
                  └── EditionLink (predecessor / restatement_of)

Platform (cross-tenant)
└── FrameworkRegistry
      └── FrameworkPack* (IFRS | IFRS_SME | GRAP | MCS | IPSAS | FUTURE)
            ├── StatementDefinition*
            ├── TaxonomyLine*
            ├── DisclosureDefinition*
            ├── NoteDefinition*
            ├── ValidationRule*
            ├── XbrlConceptBinding*
            └── ProvenanceRecord*
```

---

## 4. Core Entities (logical)

### 4.1 Platform entities

| Entity | Identity | Key attributes | Invariants |
|--------|----------|----------------|------------|
| `Framework` | framework_key | name, jurisdiction_scope, status | Immutable key |
| `FrameworkPackVersion` | framework_key + version_id | effective_from, effective_to, content_ref, status | No ambiguous active overlap without supersession rule |
| `StatementDefinition` | pack_version + statement_type | structure_ref, required_flag | Must reference TaxonomyLines |
| `TaxonomyLine` | pack_version + line_code | label, statement_section, rollup_rules | Unique line_code per pack version |
| `DisclosureDefinition` | pack_version + disclosure_code | applicability_rules, evidence_hints | Version-immutable once published |
| `NoteDefinition` | pack_version + note_code | template_ref, quantitative_slots | Numbering scheme owned by pack |
| `ValidationRule` | pack_version + rule_id | severity (blocking/advisory), expression_ref | Blocking rules gate review |
| `XbrlConceptBinding` | pack_version + line_or_disclosure | taxonomy_ns, concept_name, taxonomy_version | Required for mandatory published lines (readiness) |
| `ProvenanceRecord` | pack_version + source_id | citation, document_ref | Required for pack publish |

### 4.2 Tenant entities

| Entity | Identity | Key attributes | Invariants |
|--------|----------|----------------|------------|
| `ReportingEntity` | company_id + entity_id | name, entity_type, parent_ref? | Scoped by company; parent reserved for future consolidation |
| `FrameworkBinding` | entity_id + binding_id | framework_pack_version_id, period_from, period_to | One active binding per entity per overlapping period |
| `AccountingPolicySet` | entity_id + policy_set_id + version | elections[], effective_from | Published versions immutable |
| `ChartMappingSet` | entity_id + mapping_set_id + version | framework_pack_version_id | Must target compatible framework version |
| `MappingLine` | mapping_set + line_id | source (account/tag), taxonomy_line, xbrl_concept? | No duplicate source keys; amounts not stored |
| `MaterialityProfile` | entity_id + profile_id | bases, thresholds, qualitative_factors | Used by decisions, not by GL |
| `ReportingPeriodCase` | entity_id + period_key | framework_binding_id, status | Unique open case per entity/period/edition intent |
| `FactSnapshotSeal` | case_id + seal_id | accounting_period_ref, hash, sealed_at, source_rpc_refs | Immutable; published packs require seal |
| `StatementInstance` | case_id + statement_type | lines[], generated_at, mapping_version_id | Amounts from seal + mapping only |
| `DisclosureInstance` | case_id + disclosure_code | status (applicable/N/A), payload, evidence_refs, materiality_ref? | N/A requires rationale |
| `NoteInstance` | case_id + note_code | number, narrative, quantities[], cross_refs | Totals must reconcile under Validation |
| `ValidationRun` | case_id + run_id | results[], blocking_pass, sealed_at | Required for review submit |
| `ReviewWorkflowCase` | case_id | state, preparer, reviewers[], approver, comments | SoD when DoA requires |
| `PublishedPackVersion` | entity_id + edition_id | content_hash, seal_id, mapping_version, policy_version, validation_run_id, approver, published_at | Immutable; corrections via new edition |
| `EditionLink` | from_edition + to_edition | link_type (supersedes \| restates) | No cycles |

---

## 5. State Machines (logical)

### 5.1 ReportingPeriodCase

`opened → facts_sealed → content_assembled → validated → in_review → approved → published`  
Alternate: `in_review → rejected → content_assembled`  
Terminal restatement: `published → restatement_case_opened` (new case/edition)

### 5.2 FrameworkPackVersion

`draft → published → active → deprecated`  
Deprecated packs remain readable for historical PublishedPackVersions.

### 5.3 ChartMappingSet / AccountingPolicySet

`draft → published → superseded`  
Published sets immutable; supersession creates new version_id.

---

## 6. Anti-Duplication Invariants

| Forbidden | Reason |
|-----------|--------|
| Second ledger of account balances inside EFRE | Accounting owns balances |
| Framework statement layouts embedded in Accounting modules | EFRE owns presentation |
| Recalculating PAYE/VAT into statement lines | Use GL-recognised amounts only |
| Mutating a PublishedPackVersion in place | Version Control + Publication immutability |
| Tenant mutation of platform Framework Packs | Platform stewardship |
| Using live unsealed journals as publish source | FactSnapshotSeal required |

---

## 7. Amount Provenance Rule

For every amount on a Statement Instance, Note quantitative slot, or Disclosure quantitative slot in a Published Pack:

1. Trace to FactSnapshotSeal  
2. Trace to MappingLine (or explicit Materiality aggregation rule)  
3. Trace to Framework TaxonomyLine  
4. Optionally trace to XbrlConceptBinding  

Absence of (1)–(3) is a blocking Validation fail for publication.

---

## 8. Multi-Company & Consolidation Reservation

| Concept | V6.0.0 |
|---------|--------|
| `company_id` scoping | Mandatory on all tenant aggregates |
| `ReportingEntity` | Present; default maps 1:1 to company |
| Consolidation / eliminations / NCI | Reserved entities/attributes only — not certified for implementation scope |

---

## 9. Certification

Domain Model is **CERTIFIED** as the logical enterprise model for EFRE V6.0.0. Physical schema is out of scope until Implementation Approval.
