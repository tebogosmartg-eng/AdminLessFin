# 07 — Disclosure Model

**Version:** 7.1.0  
**Industry analogue:** CaseWare Knowledge Library notes; Draftworx auto-opened policies/notes; IRIS/CCH interactive notes

---

## 1. DisclosureDefinition (platform)

| Attribute | Description |
|-----------|-------------|
| `disclosure_code` | Stable e.g. `DISC.PPE`, `NOTE.POLICIES` |
| `framework_pack_id` | Owner |
| `kind` | `accounting_policy` \| `note` \| `directors` \| `auditor` \| `other` |
| `title_default` | Default title |
| `hierarchy_parent` | Optional parent disclosure |
| `sort_order` | Default note order |
| `requirement_level` | `required` \| `conditional` \| `optional` |
| `numbering_scheme` | `sequential_notes` \| `policy_alpha` \| `fixed` \| `none` |
| `zero_balance_suppress` | bool |
| `framework_variants` | jsonb keyed by framework_key |
| `xbrl_binding_id` | Optional |

---

## 2. DisclosureCondition (dynamic / conditional)

| Attribute | Description |
|-----------|-------------|
| `predicate_id` | Identity |
| `disclosure_code` | Target |
| `predicate_kind` | `taxonomy_nonzero` \| `taxonomy_mapped` \| `entity_type` \| `jurisdiction` \| `materiality` \| `manual_flag` \| `and` \| `or` |
| `taxonomy_codes[]` | For balance tests |
| `entity_types[]` | company, trust, npo, municipality, … |
| `parameters` | jsonb thresholds etc. |
| `on_true` | `include` \| `exclude` |
| `on_false` | inverse |

**Examples**

- Include `DISC.PPE` if any `SFP.ASSETS.PPE.*` AmountFact ≠ 0  
- Include related-party note if `manual_flag.related_parties=true` or balances on RP taxonomy  
- Suppress contingent liabilities if N/A election + zero exposures  

---

## 3. Content structure

```
DisclosureInstance
├── status (draft → ready → locked)
├── content_hash
├── DisclosureSection*
│     ├── title
│     ├── DisclosureParagraph* (narrative; rich text/markdown constrained)
│     └── DisclosureTable*
│           ├── columns[] (period/scenario aware)
│           ├── rows[] (taxonomy-bound or manual)
│           └── calc footnotes
└── ContentReferences* (structure / WP / policy)
```

Existing `efs_disclosure_sections` / `_paragraphs` / `_tables` remain; conditions and variants are additive.

---

## 4. Accounting policies

| Object | Role |
|--------|------|
| `AccountingPolicySet` | Workspace election set |
| `AccountingPolicy` | Individual policy narrative + `policy_code` |
| `PolicyLinkage` | Policy ↔ DisclosureDefinition / taxonomy |

Policies are **not** recognition rules; they are presentation/disclosure content (boundary preserved).

---

## 5. Framework-specific variants

Same `disclosure_code` may resolve different title/body templates:

```json
{
  "IFRS_SME": { "title": "Property, plant and equipment", "template_ref": "sme.ppe.v1" },
  "GRAP": { "title": "Property, plant and equipment", "template_ref": "grap.ppe.v1" },
  "IPSAS": { "title": "Property, plant and equipment", "template_ref": "ipsas.ppe.v1" }
}
```

Engine selects variant from FrameworkBinding — no code fork.

---

## 6. Movement & supporting schedules (disclosure tables)

Table templates bind columns to dimensions:

| Column role | Dimension |
|-------------|-----------|
| Opening | period=opening, measure=closing_balance prior |
| Additions | measure=period_activity (additions taxonomy) |
| Disposals | disposals taxonomy |
| Closing | period=current, measure=closing_balance |

Lead schedules may **feed** disclosure tables via AmountFact tie-out, supporting professional working papers without duplicating ledgers.

---

## 7. Suppression rules

1. Conditional predicate fails → disclosure omitted.  
2. `zero_balance_suppress` and all bound taxonomy amounts zero → omit.  
3. Required disclosures with missing content → Validation blocking issue.  
4. Suppressed disclosures do not consume note numbers (renumber at assemble).
