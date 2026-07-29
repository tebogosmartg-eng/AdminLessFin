# 02 — Entity Relationship Diagram

**Version:** 7.1.0  
**Notation:** Logical ERD (Crow’s Foot). Physical table names may use `efs_` / `frdm_` prefixes per migration strategy.

---

## 1. Core reporting spine

```mermaid
erDiagram
  Framework ||--o{ FrameworkPack : versions
  FrameworkPack ||--o{ ReportingTaxonomyNode : owns
  FrameworkPack ||--o{ StatementDefinition : owns
  FrameworkPack ||--o{ DisclosureDefinition : owns
  FrameworkPack ||--o{ DocumentSectionDefinition : owns
  FrameworkPack ||--o{ XbrlConceptBinding : binds

  ReportingTaxonomyNode ||--o{ ReportingTaxonomyNode : parent_of
  ReportingTaxonomyNode ||--|| StatementLineDefinition : presents_as
  StatementLineDefinition ||--o{ LineCalculationRule : calculated_by
  StatementLineDefinition ||--o{ CrossReferenceRule : links_to_note

  DisclosureDefinition ||--o{ DisclosureCondition : gated_by
  DisclosureDefinition ||--o{ DisclosureSectionDefinition : has

  Company ||--o{ ReportingEntity : scopes
  ReportingEntity ||--o{ ReportingPeriod : has
  ReportingEntity ||--o{ FrameworkBinding : binds
  FrameworkBinding }o--|| FrameworkPack : uses
  ReportingPeriod ||--|| ReportingWorkspace : engagement

  ReportingWorkspace ||--o{ CtbSource : sources
  CtbSource ||--o| CanonicalTrialBalance : seals
  CanonicalTrialBalance ||--o{ CanonicalTbLine : contains
  CanonicalTbLine }o--o| ReportingTaxonomyNode : mapped_to

  ReportingWorkspace ||--o{ SnapshotVersion : freezes
  SnapshotVersion ||--|| FactSnapshot : seals
  SnapshotVersion ||--o{ ComparativeBinding : prior
  SnapshotVersion ||--o{ ReportingAdjustment : overlays
  ReportingAdjustment ||--o{ ReportingAdjustmentLine : lines

  FactSnapshot ||--o{ AmountFact : projects
  AmountFact }o--|| ReportingTaxonomyNode : for
  AmountFact }o--|| ReportingEntity : entity_dim
  AmountFact }o--|| ReportingPeriod : period_dim

  ReportingWorkspace ||--o{ StatementInstance : generates
  StatementInstance ||--o{ StatementLineAmount : lines
  StatementLineAmount }o--|| StatementLineDefinition : of
  StatementLineAmount }o--o| AmountFact : sourced_from

  ReportingWorkspace ||--o{ DisclosureInstance : authors
  DisclosureInstance }o--|| DisclosureDefinition : of
  DisclosureInstance ||--o{ DisclosureSection : sections
  DisclosureSection ||--o{ DisclosureParagraph : paragraphs
  DisclosureSection ||--o{ DisclosureTable : tables

  ReportingWorkspace ||--|| DocumentInstance : assembles
  DocumentInstance ||--o{ DocumentSectionInstance : sections
  DocumentSectionInstance }o--o| StatementInstance : embeds
  DocumentSectionInstance }o--o| DisclosureInstance : embeds

  ReportingWorkspace ||--o{ ValidationRun : validates
  ReportingWorkspace ||--o| PackReview : reviews
  PackReview ||--o| PublicationPack : publishes
  PublicationPack }o--|| DocumentInstance : renders
```

---

## 2. Mapping & adjustments

```mermaid
erDiagram
  ChartMappingSet ||--o{ MappingLine : contains
  MappingLine }o--|| ReportingTaxonomyNode : targets
  FrpMappingSet ||--o{ FrpMappingRule : contains
  TbImportLine }o--o| FrpMappingRule : resolved_by
  TbImportLine ||--o| CanonicalTbLine : becomes

  ReportingAdjustmentLine }o--|| CanonicalTbLine : from_or_to
  ReportingAdjustmentLine }o--|| ReportingTaxonomyNode : presentation_target
```

---

## 3. Working papers & cross-refs

```mermaid
erDiagram
  StructureNode ||--o{ AttachmentPoint : sockets
  AttachmentPoint ||--o{ WorkingPaper : binds
  AttachmentPoint ||--o{ LeadSchedule : binds
  LeadSchedule ||--o{ LeadScheduleLine : lines
  LeadScheduleLine }o--o| AmountFact : ties_out

  CrossReference }o--o| StatementLineDefinition : statement_end
  CrossReference }o--o| DisclosureInstance : note_end
  CrossReference }o--o| WorkingPaper : wp_end
  CrossReference }o--o| DocumentSectionInstance : doc_end
```

---

## 4. Reserved consolidation & XBRL

```mermaid
erDiagram
  ReportingEntity ||--o{ OwnershipInterest : owns
  ConsolidationScope ||--o{ ReportingEntity : includes
  ConsolidationScope ||--o{ EliminationEntry : eliminates
  EliminationEntry }o--|| AmountFact : adjusts_scenario

  StatementLineDefinition ||--o{ XbrlConceptBinding : tagged
  DisclosureDefinition ||--o{ XbrlConceptBinding : tagged
  PublicationPack ||--o| IxbrlDocument : future_export
```

---

## 5. Cardinality summary

| From | To | Cardinality | Notes |
|------|-----|-------------|-------|
| FrameworkPack | ReportingTaxonomyNode | 1:N | Tree per pack |
| TaxonomyNode | StatementLineDefinition | 1:0..1 | Leaf/presentation nodes |
| Workspace | CanonicalTrialBalance | 1:N | Supersession allowed |
| SnapshotVersion | AmountFact | 1:N | Dimensional projection |
| StatementInstance | StatementLineAmount | 1:N | Replaces opaque jsonb long-term |
| DisclosureDefinition | DisclosureCondition | 1:N | OR/AND groups allowed |
| DocumentInstance | DocumentSectionInstance | 1:N | Ordered assembly |
| PackReview | PublicationPack | 1:N | Versioned publications |
