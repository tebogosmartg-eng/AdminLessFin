# 04 — Relationship Matrix

**Version:** 7.1.0  
**Purpose:** Define every link in the mandatory traceability chain and professional support relationships.

---

## 1. Mandatory spine

| # | From | To | Relationship type | Cardinality | Invariant |
|---|------|-----|-------------------|-------------|-----------|
| 1 | Journal (Accounting) | Ledger | posts | N:1 account | Balanced JE; Accounting owns |
| 2 | Ledger | Trial Balance | aggregates | N:1 period | TB balances |
| 3 | Trial Balance / Import | Canonical Trial Balance | seals | N:1 workspace source | CTB content_hash immutable when sealed |
| 4 | CanonicalTbLine | ReportingTaxonomyNode | maps | N:1 (nullable until mapped) | Unmapped blocks publication |
| 5 | ReportingTaxonomyNode | StatementLineDefinition | presents | 1:0..1 | Leaf nodes present |
| 6 | StatementLineDefinition | StatementLineAmount | instantiates | 1:N per dimensions | Amounts from AmountFact / rules |
| 7 | StatementLineDefinition | DisclosureDefinition | cross_ref | N:M via rules | Auto note numbers |
| 8 | DisclosureInstance | DocumentSectionInstance | embeds | N:1 section | Ordered in NOTES |
| 9 | DocumentInstance | PublicationPack | renders | 1:N versions | Pack fingerprint includes document |

---

## 2. Extended professional relationships

| From | To | Type | Required for publication? |
|------|-----|------|---------------------------|
| CanonicalTbLine | AmountFact | projects | Yes |
| ReportingAdjustmentLine | AmountFact (scenario=adjusted) | overlays | If adjustments exist |
| AmountFact | LeadScheduleLine | tie_out | For WP completeness (practice) |
| StructureNode | AttachmentPoint | hosts | For WP/disclosure sockets |
| DisclosureInstance | AccountingPolicy | references | When policy-linked |
| StatementLineAmount | ComparativeBinding | prior_column | When comparative presented |
| ValidationRun | PackReview | gates | Yes |
| PackReview signoff | PublicationPack | authorises | Yes |
| StatementLineDefinition | XbrlConceptBinding | tags | Future XBRL (readiness now) |
| ReportingEntity | OwnershipInterest | consolidates | Future groups only |

---

## 3. Traceability resolution algorithm (logical)

Given a published figure `F` on a statement line in a PublicationPack:

1. Resolve `DocumentSectionInstance` → `StatementLineAmount`.  
2. Resolve `StatementLineAmount.amount_fact_id` (or calculation inputs).  
3. Resolve `AmountFact.scenario`:
   - `actual` → `CanonicalTbLine` via provenance  
   - `adjusted` → apply inverse ReportingAdjustment bridge → `actual` AmountFacts  
4. Resolve `CanonicalTbLine.source_ref` → native account / import line.  
5. If native: account → ledger → journals.  
6. Record path in provenance envelope (already partially present in V7 document_composer metadata).

---

## 4. Forbidden relationships (preserve architecture)

| Forbidden | Reason |
|-----------|--------|
| DisclosureInstance → live Journal | Must attach via Structure/CTB only |
| StatementLineAmount → live GL balance | Sealed facts only |
| ReportingAdjustment → invent net P&L | V6.0.1 invariant |
| PublicationPack → mutate CTB | Packs are immutable consumers |
| FrameworkPack fork of Statement Engine | Metadata overlays only |

---

## 5. Cross-reference automation matrix

| Source | Target | Trigger | Auto number? | Auto page ref? |
|--------|--------|---------|--------------|----------------|
| Statement line | Note | CrossReferenceRule on taxonomy | Yes (note seq) | At publish |
| Note table total | Statement line | Explicit link | Optional | At publish |
| Policy paragraph | Disclosure | PolicyLinkage | No | Optional |
| Lead schedule | Statement line | Structure attachment | No | Internal |
| TOC entry | Document section | Document order | Yes | At publish |

Page references are **publication-time** derived attributes, not stored economic facts.
