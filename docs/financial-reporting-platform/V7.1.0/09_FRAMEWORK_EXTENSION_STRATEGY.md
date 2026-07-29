# 09 — Framework Extension Strategy

**Version:** 7.1.0  
**Goal:** Support IFRS, IFRS for SMEs, GRAP, IPSAS, NPO, Trusts, Companies, Municipalities — and future packs — **without redesigning the reporting engine**.

---

## 1. Metadata-driven pack architecture

```
Framework (key)
  └── FrameworkPack (version)
        ├── Taxonomy tree + StatementLineDefinitions + CalcRules
        ├── DisclosureDefinitions + Conditions + Variants
        ├── DocumentSectionDefinitions
        ├── ValidationRule bindings
        ├── CrossReferenceRules
        └── XbrlConceptBinding* (optional readiness)

Optional overlays (compose at bind time):
  IndustryPack  ∪  JurisdictionPack  ∪  EntityTypeProfile
```

**Engine contract (stable for a decade):**

1. Resolve active pack + overlays for workspace.  
2. Project CTB → AmountFacts via mapping.  
3. Apply ReportingAdjustments → scenario `adjusted`.  
4. Evaluate calculation rules → StatementLineAmounts.  
5. Evaluate disclosure conditions → DisclosureInstances set.  
6. Assemble DocumentInstance.  
7. Validate → Review → Publish.

New frameworks = new pack data, not new engines.

---

## 2. Entity-type profiles

| Entity type | Typical packs | Document deltas |
|-------------|---------------|-----------------|
| Companies | IFRS / IFRS_SME + Companies Act jurisdiction | Directors’ report optional |
| Trusts | IFRS_SME / local trust pack | Trustee report; capital notes |
| NPO | NPO pack / IFRS_SME | Funds accounting disclosures |
| Municipalities | GRAP / mSCOA overlays | Appropriation statements |
| Public sector | IPSAS / GRAP | Net assets / surplus terminology |

`ReportingEntity.entity_type` selects EntityTypeProfile filters on taxonomy/disclosure applicability.

---

## 3. Label overlays (not structure forks)

Existing `efs_structure_node_labels` pattern generalises:

| framework_key | Equity total label |
|---------------|--------------------|
| IFRS / IFRS_SME | Total equity |
| GRAP / MCS / IPSAS | Net assets |

Same `line_code`, different `display_name` via pack labels.

---

## 4. Adding a new framework (process)

1. Create `Framework` + `FrameworkPack` draft.  
2. Author taxonomy tree (reuse shared codes where IAS/IFRS aligned).  
3. Attach calc rules, disclosures, conditions, document sections.  
4. Bind validation rules.  
5. Optional XBRL concept bindings.  
6. Publish pack (`status=published`).  
7. Tenants bind via FrameworkBinding — zero engine deploy required for content-only packs.

---

## 5. Industry & jurisdiction packs

| Overlay | May | May not |
|---------|-----|---------|
| IndustryPack | Add taxonomy leaves, disclosures, schedules | Change recognition in Accounting |
| JurisdictionPack | Add legal front-matter, filing notes, iXBRL locale | Break articulation invariants |

Composition order: Base FrameworkPack → Industry → Jurisdiction → Tenant mapping overrides.

---

## 6. Future XBRL / iXBRL

| Model object | Role now | Role later |
|--------------|----------|------------|
| `XbrlConceptBinding` | Store taxonomy ns + concept + context dims | Drive instance document |
| `XbrlTaxonomyVersion` | Catalogue | Validate tags |
| `IxbrlDocument` | Reserved | Inline XBRL artifact beside PDF |

No filing gateway in this pack; bindings ensure **no redesign** when filing is implemented.

---

## 7. Future consolidations

| Object | Role |
|--------|------|
| `ConsolidationScope` | Set of entities |
| `OwnershipInterest` | % and method |
| `EliminationEntry` | Scenario=`consolidated` adjustments |
| AmountFact scenario | `consolidated` column |

Single-entity path remains default; group path activates reserved objects.

---

## 8. Compatibility with seeded AdminLess frameworks

| Existing key | FRDM treatment |
|--------------|----------------|
| IFRS | Full pack; deepen taxonomy from ~20 lines to hierarchical tree |
| IFRS_SME | Primary professional pack (V6.10.3 evidence path) |
| GRAP | Pack + public-sector labels + municipal entity profile |
| MCS | Cash-basis overlays |
| IPSAS | Public sector international pack |
| NPO / TRUST | New framework_keys + entity profiles (additive) |
