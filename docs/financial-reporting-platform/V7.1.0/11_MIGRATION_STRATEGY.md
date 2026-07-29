# 11 — Additive Migration Strategy

**Version:** 7.1.0  
**Constraint:** Certified accounting modules **unchanged**. Statement Engine, Validation, Review, Publication **ownership preserved**; extend via additive tables and dual-write.

---

## 1. Principles

1. **Additive DDL only** — new tables / nullable columns; no drop of certified tables.  
2. **Dual-write then cutover** — keep `efs_statement_instances.lines` jsonb until StatementLineAmount proven.  
3. **Pack content versioning** — deepen taxonomy in new FrameworkPack versions (`2026.2+`), do not mutate published `2026.1` immutably-bound engagements.  
4. **Feature flags** — `EFS_FRDM_V710_*` gates for gradual enablement.  
5. **No live GL reads in publication** — preserved.  
6. **Reporting Adjustments** physicalise V6.0.1 without posting journals.

---

## 2. Phased implementation (future work — not this pack)

### Phase A — Dimensional substrate (Critical)

| Deliverable | Action |
|-------------|--------|
| `efs_amount_facts` | New table; project from CTB on seal |
| Dimension enums | entity, period_role, scenario, measure, currency |
| Backfill | From existing fact_snapshots.dataset |

**Consumers:** none broken; projection optional until Phase B.

### Phase B — Taxonomy depth

| Deliverable | Action |
|-------------|--------|
| `efs_reporting_taxonomy_nodes` | Hierarchical tree per pack |
| Migrate | Map existing `efs_taxonomy_lines` → leaf nodes |
| `efs_line_calculation_rules` | Move hardcoded totals to data |
| Statement Engine | Prefer rules when flag on; fallback to current functions |

### Phase C — Statement amounts & comparatives

| Deliverable | Action |
|-------------|--------|
| `efs_statement_line_amounts` | Dual-write beside jsonb |
| Comparative columns | Populate prior via comparative_bindings |
| Validation | Cross-cast on AmountFact / line amounts |

### Phase D — Reporting Adjustments

| Deliverable | Action |
|-------------|--------|
| `efs_reporting_adjustments` / `_lines` | Physical V6.0.1 |
| Bridge report API | Fact → adjustments → lines |
| Scenario | `adjusted` AmountFacts |

### Phase E — Disclosures & document

| Deliverable | Action |
|-------------|--------|
| `efs_disclosure_conditions` | Predicate store |
| `efs_document_instances` / `_sections` | Assembly model |
| Publication | Render from DocumentInstance (presentation only) |
| `efs_cross_reference_rules` | Auto note numbers |

### Phase F — Readiness extensions

| Deliverable | Action |
|-------------|--------|
| `efs_xbrl_concept_bindings` | Readiness only |
| Consolidation reserved tables | Scope/ownership/eliminations empty until engine pack |
| NPO/Trust framework packs | Content authoring |

---

## 3. Mapping of FRDM objects → physical names (proposed)

| FRDM object | Proposed table | Status |
|-------------|----------------|--------|
| ReportingTaxonomyNode | `efs_reporting_taxonomy_nodes` | New |
| StatementLineDefinition | extend `efs_taxonomy_lines` + FK to node | Alter additive |
| LineCalculationRule | `efs_line_calculation_rules` | New |
| AmountFact | `efs_amount_facts` | New |
| ReportingAdjustment | `efs_reporting_adjustments` | New |
| DisclosureCondition | `efs_disclosure_conditions` | New |
| DocumentInstance | `efs_document_instances` | New |
| DocumentSectionInstance | `efs_document_section_instances` | New |
| CrossReferenceRule | `efs_cross_reference_rules` | New |
| XbrlConceptBinding | `efs_xbrl_concept_bindings` | New |
| ConsolidationScope | `efs_consolidation_scopes` | New (reserved) |

Existing CTB, WP, validation, review, publication tables: **unchanged ownership**.

---

## 4. Regression gates (must stay green)

| Gate | Evidence path |
|------|---------------|
| Native GL → CTB → statements | V7.0.0 FRP tests |
| Professional AFS PDF IFRS SME | V6.10.3 e2e |
| Validation does not mutate GL | V6.4.5 invariant |
| Publication requires partner sign-off | V6.4.7 / V6.5.3 |
| Operational `/financial-statements` reports | Untouched |

---

## 5. What this pack authorises

| Authorised | Not authorised |
|------------|----------------|
| Implement Phases A–F as additive migrations | Redesign GL / journals / CoA |
| Deepen framework pack content | Claim CaseWare-class certification yet |
| Dual-write statement amounts | Break sealed publication fingerprints without version bump |
| Introduce AmountFact dimensions | Store a second economic ledger in EFRE |

---

## 6. Success criteria for “model implemented”

FRDM implementation may be considered complete when:

1. Hierarchical taxonomy drives statements **and** note tables.  
2. Comparatives populate from AmountFact period dimension.  
3. Reporting Adjustments bridge to publication.  
4. DocumentInstance is the assembly source for publication.  
5. Disclosure conditions auto include/suppress.  
6. XBRL bindings exist for mandatory lines (export still optional).  
7. All quality gates in `00_INDEX.md` remain PASS on regression.
