# 03 — Object Hierarchy

**Version:** 7.1.0

---

## 1. Platform content hierarchy

```
Framework
└── FrameworkPack (versioned)
      ├── IndustryPack overlays (optional)
      ├── JurisdictionPack overlays (optional)
      ├── ReportingTaxonomyNode (tree)
      │     ├── StatementLineDefinition
      │     │     ├── LineCalculationRule*
      │     │     ├── PresentationRule*
      │     │     └── VisibilityRule*
      │     └── CrossReferenceRule* → DisclosureDefinition
      ├── StatementDefinition*
      │     └── ordered StatementLineDefinition refs
      ├── DisclosureDefinition*
      │     ├── DisclosureCondition*
      │     ├── DisclosureSectionDefinition*
      │     │     ├── ParagraphTemplate*
      │     │     └── TableTemplate*
      │     └── PolicyLinkage*
      ├── DocumentSectionDefinition* (ordered)
      ├── ValidationRule bindings*
      └── XbrlConceptBinding* (readiness)
```

---

## 2. Tenant engagement hierarchy

```
Company
└── ReportingEntity*
      ├── FrameworkBinding*
      ├── ChartMappingSet* → MappingLine*
      ├── MaterialityProfile* (optional)
      └── ReportingPeriod*
            └── ReportingWorkspace (engagement)
                  ├── EngagementGeneralInformation
                  ├── CtbSource* → TbImport* → CanonicalTrialBalance → CanonicalTbLine*
                  ├── Snapshot / SnapshotVersion* → FactSnapshot
                  │     ├── ComparativeBinding*
                  │     ├── ReportingAdjustment* → ReportingAdjustmentLine*
                  │     └── AmountFact*
                  ├── StatementInstance* → StatementLineAmount*
                  ├── DisclosureInstance* → Section → Paragraph | Table
                  ├── AccountingPolicySet → AccountingPolicy*
                  ├── WorkingPaper* / LeadSchedule* / Evidence*
                  ├── CrossReference*
                  ├── DocumentInstance → DocumentSectionInstance*
                  ├── ValidationRun*
                  ├── PackReview → Decisions / Signoffs
                  └── PublicationPack → Artifacts (pdf/docx/xlsx[/xbrl])
```

---

## 3. Taxonomy depth (professional requirement)

Industry platforms use multi-level map/link codes (CaseWare components; Draftworx links). FRDM requires **at least four levels**:

| Level | Example code | Role |
|-------|--------------|------|
| L1 Statement class | `SFP` | Statement ownership |
| L2 Section | `SFP.ASSETS` | Section / current vs non-current |
| L3 Line group | `SFP.ASSETS.PPE` | Statement line / disclosure owner |
| L4 Detail / note slot | `SFP.ASSETS.PPE.COST` | Movement schedule / note table column |

Deeper industry levels (L5+) are allowed via child nodes without schema redesign.

---

## 4. Document hierarchy (publication assembly)

```
DocumentInstance
├── COVER
├── CONTENTS (auto from sections)
├── CERTIFICATES / APPROVALS (optional)
├── DIRECTORS_REPORT (optional / jurisdiction)
├── AUDITORS_REPORT | COMPILATION_REPORT (optional)
├── STATEMENT* (SoFP, SoPL/OCI, SoCE, SoCF, …)
├── ACCOUNTING_POLICIES
├── NOTES* (ordered DisclosureInstances)
├── SCHEDULES* (optional appendices / leads)
├── APPENDICES*
└── PUBLICATION_METADATA (seal, framework, period — not printed as debug)
```

---

## 5. Scenario hierarchy (amount layers)

```
Actual (from sealed CTB)
└── Adjusted (Actual + ReportingAdjustments)     ← default for statements
      └── Consolidated (Adjusted + Eliminations) ← reserved
Budget / Forecast                                 ← optional parallel scenarios
```

Statements publish from a chosen Scenario (default: `adjusted`). Bridge reports always reconcile to `actual`.
