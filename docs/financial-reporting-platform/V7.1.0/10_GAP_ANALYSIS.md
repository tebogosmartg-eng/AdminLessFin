# 10 — Gap Analysis against AdminLess Fin (current)

**Version:** 7.1.0  
**Baseline:** EFS V6.4.0–V6.10.3 + FRP V7.0.0 schema & engines  
**Evidence:** migrations `20260713*`–`20260718*`; domain V6.0.0/V6.0.1; inventory board review

---

## 1. Summary

| Area | Current | FRDM target | Gap class |
|------|---------|-------------|-----------|
| Canonical TB | Implemented | Retained | None |
| Flat taxonomy lines (~20) | Implemented | Hierarchical taxonomy tree | **Major** |
| Structure nodes | Implemented | Align codes to taxonomy | Minor |
| Statement calc rules table | Missing (hardcoded engine) | LineCalculationRule | **Major** |
| StatementLineAmount rows | jsonb blob | First-class amounts | Major |
| Comparative columns | Binding only; limited engine use | Full period dimension | **Major** |
| Reporting Adjustments | Logical V6.0.1 only | Physical tables | **Major** |
| Amount dimensions / scenarios | Missing | Entity×Period×Scenario×Measure | **Critical** |
| Disclosure conditions engine | requirement_level only | DisclosureCondition predicates | Major |
| DocumentInstance | Implicit in PDF | First-class document model | **Major** |
| Cross-ref automation rules | Manual refs | CrossReferenceRule + auto numbers | Major |
| XBRL bindings | Deferred / missing | XbrlConceptBinding readiness | Major (future) |
| Consolidation objects | Reserved flag only | Scope / ownership / eliminations | Future |
| Framework packs | Seeded keys | Deep content + NPO/Trust | Major (content) |
| WP / leads / review / publication | Implemented | Retained + schedule tie-out to AmountFact | Minor |
| Mapping persistence | FRP rules exist | Explicit roll-forward contract | Minor |

---

## 2. Detailed gaps

### Critical (blocks decade-ready Accounts Production without redesign if skipped)

| ID | Gap | Risk if ignored |
|----|-----|-----------------|
| G1 | No dimensional AmountFact | Comparatives, budgets, consolidations force engine redesign later |
| G2 | Taxonomy too shallow | Notes/movement schedules cannot be taxonomy-driven |

### Major (required for professional AFS parity)

| ID | Gap | Notes |
|----|-----|-------|
| G3 | No LineCalculationRule store | Logic trapped in `statementEngine.ts` |
| G4 | No physical ReportingAdjustment | V6.0.1 certified logically; not in DDL |
| G5 | Weak comparative presentation | `efs_comparative_bindings` unused for multi-column lines |
| G6 | No DocumentInstance | Composer/PDF invents structure each render |
| G7 | Conditional disclosures thin | Cannot auto-open/suppress like Draftworx |
| G8 | No CrossReferenceRule automation | Manual only |
| G9 | No XbrlConceptBinding tables | XBRL later would reshape taxonomy |

### Minor

| ID | Gap |
|----|-----|
| G10 | Tick-mark UX vs catalogue |
| G11 | Mapping roll-forward UX contract |
| G12 | Label overlays incomplete for all packs |

### Not gaps (retain as-is)

- Accounting journals / ledger / CoA  
- CTB import + mapping queue (V7)  
- Validation / Review / Publication seals  
- Working paper attachment discipline  
- Accountant UX language layer  

---

## 3. Classification vs investigation areas

| Investigation area | Status vs FRDM |
|--------------------|----------------|
| 1 Reporting Taxonomy | Partial → needs hierarchy + behaviours |
| 2 Statement Lines | Partial → needs calc/visibility/comparative attrs |
| 3 Disclosure Objects | Partial → needs conditions/variants |
| 4 Reporting Dimensions | Missing → must add |
| 5 Relationships | Partial → spine exists; AmountFact/Document links missing |
| 6 Document Structure | Partial (PDF) → needs model |
| 7 Cross Referencing | Partial → needs automation |
| 8 Professional features | Partial → movements/comparatives/conditions |
| 9 Framework support | Partial seeds → metadata strategy defined |
| 10 Future expansion | Reserved verbally → model objects specified |

---

## 4. Board conclusion on gaps

Gaps are **additive schema/content gaps**, not proof that the architecture must be redesigned. Certified modules remain consumers/producers at existing boundaries. Therefore the **model** can be marked ready for implementation; the **platform** remains not CaseWare-class until Priority work lands (separate from this pack).
