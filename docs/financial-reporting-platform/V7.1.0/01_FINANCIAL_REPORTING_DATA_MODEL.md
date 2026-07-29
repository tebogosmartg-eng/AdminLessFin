# 01 — Financial Reporting Data Model (FRDM)

**Version:** 7.1.0  
**Board:** Independent Principal Enterprise Financial Reporting Board  
**Nature:** Canonical logical + physical-ready data model for professional Accounts Production

---

## 1. Design principles (evidence-based)

| Principle | Industry evidence | FRDM rule |
|-----------|-------------------|-----------|
| Mapping separates client CoA from presentation | CaseWare map numbers; Draftworx links | Taxonomy is independent of source accounts |
| Facts are sealed before statements | CaseWare Working TB → Financials; CCH/IRIS freeze before final | CTB + Fact Snapshot are immutable inputs |
| Presentation ≠ recognition | IFRS presentation vs recognition; V6.0.1 Reporting Adjustments | Reporting Adjustments never invent economic amounts |
| Frameworks are content packs | CaseWare/Draftworx/CCH templates | Framework Packs are metadata, not engine forks |
| Dimensions drive columns | Comparatives, consolidations, budgets | Entity × Period × Scenario × Measure |
| Document is first-class | CaseView / Interactive Reports | Document Structure owns assembly order |
| Traceability is mandatory | Audit evidence chain | Every published figure has provenance |

---

## 2. Bounded contexts (unchanged ownership)

| Context | Owns | Does not own |
|---------|------|--------------|
| **Accounting** | Journals, Ledger, CoA, recognition | Statement presentation |
| **FRP / CTB** | Canonical Trial Balance, import, mapping-to-taxonomy | Statement math ownership (feeds facts) |
| **EFRE / EFS** | Taxonomy, statements, disclosures, WP, validation, review, publication | Live GL posting |
| **Close (EFCP)** | Period close checklist | AFS amounts |

FRDM **extends EFRE/FRP** only. Accounting modules remain certified and unchanged.

---

## 3. Canonical object catalogue

### 3.1 Platform catalogue (cross-tenant, versioned)

| Object | Identity | Purpose |
|--------|----------|---------|
| `Framework` | `framework_key` | IFRS, IFRS_SME, GRAP, IPSAS, MCS, NPO, TRUST, … |
| `FrameworkPack` | `framework_key` + `version_id` | Published content edition |
| `IndustryPack` | `industry_key` + `version_id` | Optional industry overlays |
| `JurisdictionPack` | `jurisdiction_code` + `version_id` | Companies Act / municipal overlays |
| `ReportingTaxonomyNode` | pack + `taxonomy_code` | Hierarchical map/link equivalent |
| `StatementDefinition` | pack + `statement_type` | Primary statement catalogue |
| `StatementLineDefinition` | pack + `line_code` | Presentation line with behaviour |
| `LineCalculationRule` | line_code + rule_version | Subtotal / formula / rollup |
| `DisclosureDefinition` | pack + `disclosure_code` | Note/policy template definition |
| `DisclosureCondition` | disclosure_code + predicate_id | When to include / suppress |
| `DocumentSectionDefinition` | pack + `section_code` | Cover, TOC, statements, notes, … |
| `CrossReferenceRule` | pack + rule_id | Auto statement↔note links |
| `XbrlConceptBinding` | pack + concept_key | Future XBRL readiness |
| `ValidationRule` | rule_code | Articulation, presence, xref checks |
| `DimensionDefinition` | dimension_code | Entity, Period, Scenario, Measure |
| `WpTemplate` / `LeadScheduleTemplate` | template_code | Working paper catalogue |

### 3.2 Tenant engagement (company-scoped)

| Object | Identity | Purpose |
|--------|----------|---------|
| `ReportingEntity` | company + entity_id | Legal / reporting unit |
| `ReportingPeriod` | entity + period_key | Financial year / interim |
| `FrameworkBinding` | entity + pack + period | Active framework for engagement |
| `ReportingWorkspace` | entity + period | Engagement case |
| `EngagementGeneralInformation` | workspace | Cover / directors / currencies |
| `CtbSource` / `TbImport` / `CanonicalTrialBalance` | workspace | Sealed TB substrate (V7.0.0) |
| `ChartMappingSet` / `MappingLine` | entity + pack | CoA → taxonomy |
| `FrpMappingSet` / `FrpMappingRule` | company + pack + source_system | External TB → taxonomy |
| `FactSnapshot` / `SnapshotVersion` | workspace | Sealed accounting facts |
| `ComparativeBinding` | current + prior snapshot_version | Prior-year pin |
| `ReportingAdjustment` / `ReportingAdjustmentLine` | snapshot_version | Presentation overlay (V6.0.1 physicalised) |
| `AmountFact` | taxonomy_node + dimensions | Multi-column reporting amounts |
| `StatementInstance` / `StatementLineAmount` | workspace + snapshot | Generated statement |
| `DisclosureInstance` + sections/paragraphs/tables | workspace | Live notes |
| `AccountingPolicySet` / `AccountingPolicy` | workspace | Policy elections |
| `WorkingPaper` / `LeadSchedule` / `Evidence` | structure attachment | Supporting schedules |
| `CrossReference` | source ↔ target | Navigation graph |
| `DocumentInstance` / `DocumentSectionInstance` | workspace | Assembled AFS structure |
| `ValidationRun` / `PackReview` / `PublicationPack` | workspace | Governance & publish |

### 3.3 Reserved extension objects (modelled now, engines later)

| Object | Purpose |
|--------|---------|
| `ConsolidationScope` / `OwnershipInterest` / `EliminationEntry` | Group reporting |
| `XbrlTaxonomyVersion` / `XbrlFact` / `IxbrlDocument` | Filing artefacts |
| `IndustryDisclosureOverlay` | Industry packs |
| `MaterialityProfile` | Conditional disclosure thresholds |

---

## 4. Amount ownership rules

1. **Economic amounts** originate only from Accounting journals / ledger / CTB (native or imported).  
2. **Canonical TB lines** are the single reporting substrate.  
3. **AmountFact** rows are projections of CTB (and optional Reporting Adjustments) into taxonomy × dimensions.  
4. **StatementLineAmount** is presentation of AmountFacts (never a second ledger).  
5. **Reporting Adjustments** may reclassify/split/aggregate only; net new P&L/BS economic amounts are forbidden (per V6.0.1).  
6. **Audit Adjustments** post through Accounting journals and require CTB/Fact Snapshot re-seal.

---

## 5. Dimensional model

Every reportable amount is addressed by:

| Dimension | Members (minimum) | Use |
|-----------|-------------------|-----|
| **Entity** | ReportingEntity (company, branch, subsidiary, group) | Multi-entity / consolidation |
| **Period** | current, prior_1 … prior_n, opening, closing | Comparatives, roll-forwards |
| **Scenario** | actual, adjusted, budget, forecast, consolidated | Columns & overlays |
| **Measure** | closing_balance, opening_balance, period_activity, debit, credit | Statement / movement schedules |
| **Currency** | reporting_currency (functional optional) | Presentation currency |

Physical pattern: `AmountFact(taxonomy_node_id, entity_id, period_id, scenario_code, measure_code, currency, amount, provenance_ref)`.

---

## 6. Information required to produce ANY professional AFS

| Information class | Must exist | Why (accounting / industry) |
|-------------------|------------|------------------------------|
| Entity & period identity | Yes | IFRS presentation of reporting entity and period |
| Framework binding | Yes | Determines statement set & disclosures |
| Sealed TB / facts | Yes | Faithful representation; audit trail |
| Taxonomy mapping | Yes | Client CoA ≠ IFRS presentation |
| Statement line hierarchy + calcs | Yes | Subtotals, articulation, cross-cast |
| Comparative columns | Yes | IAS 1 / IFRS for SMEs comparatives |
| Accounting policies | Yes | Basis of preparation |
| Notes (quantitative + narrative) | Yes | Framework disclosure requirements |
| Cross-references | Yes | Statement ↔ note navigation |
| Document order & numbering | Yes | Professional publication |
| Review / approval metadata | Yes | Accountability |
| Publication seal | Yes | Immutability of issued AFS |
| Working paper / lead schedule links | Yes | Professional evidence (practice software) |
| Sign / certificate slots | Yes | Directors’ / auditor’s reports |

If any class is absent from the model, a world-class AFS cannot be produced without redesign. FRDM includes all classes.

---

## 7. Compatibility with existing AdminLess Fin objects

| Existing (keep) | FRDM relationship |
|-----------------|-------------------|
| `efs_frameworks` / `_packs` | Become Framework / FrameworkPack |
| `efs_taxonomy_lines` | Promote to StatementLineDefinition; parent via ReportingTaxonomyNode |
| `efs_structure_*` | Retain as attachment address; align codes to taxonomy |
| `efs_canonical_trial_balances` | Substrate for AmountFact |
| `efs_fact_snapshots` | Seal envelope for AmountFact batch |
| `efs_statement_instances` | Persist; migrate `lines jsonb` → StatementLineAmount rows (additive dual-write) |
| `efs_disclosure_*` | Extend with DisclosureCondition |
| `efs_publication_packs` | Consume DocumentInstance |
| `efs_comparative_bindings` | Feed Period dimension |
| V6.0.1 Reporting Adjustment (logical) | Physicalise as ReportingAdjustment* |

No certified Accounting table is altered for recognition/measurement.
