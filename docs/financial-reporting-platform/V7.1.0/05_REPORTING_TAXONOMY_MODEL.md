# 05 — Reporting Taxonomy Model

**Version:** 7.1.0  
**Industry analogue:** CaseWare mapping database; Draftworx links; CCH/IRIS chart maps

---

## 1. Purpose

Provide a **framework-owned, hierarchical presentation taxonomy** that:

- Is independent of any client Chart of Accounts  
- Drives statement lines, note slots, lead schedules, and future XBRL tags  
- Supports IFRS, IFRS for SMEs, GRAP, IPSAS, NPO, Trusts, Companies, Municipalities via pack metadata  

---

## 2. ReportingTaxonomyNode attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `taxonomy_node_id` | UUID | Yes | Surrogate key |
| `framework_pack_id` | UUID | Yes | Owning pack |
| `taxonomy_code` | text | Yes | Stable code e.g. `SFP.ASSETS.CA.TRADE_RECEIVABLES` |
| `parent_id` | UUID | No | Hierarchy parent |
| `depth` | int | Yes | 0-based depth |
| `path` | text | Yes | Materialised path for queries |
| `sort_order` | int | Yes | Presentation order among siblings |
| `label_default` | text | Yes | Default English label |
| `normal_balance` | enum | Yes | `debit` \| `credit` |
| `statement_ownership` | enum/text | Yes | `financial_position` \| `financial_performance` \| `changes_in_equity` \| `cash_flows` \| `none` |
| `disclosure_ownership` | text | No | Primary `disclosure_code` owner |
| `line_behaviour` | enum | Yes | `header` \| `detail` \| `subtotal` \| `total` \| `spacer` \| `note_only` |
| `sign_behaviour` | enum | Yes | `as_is` \| `invert_display` \| `absolute` \| `credit_as_positive` |
| `current_noncurrent` | enum | No | `current` \| `non_current` \| `n/a` |
| `amount_basis` | enum | Yes | `balance` \| `activity` \| `derived` \| `manual_input` \| `cash_flow` |
| `zero_suppress` | bool | Yes | Suppress when all dimension amounts = 0 |
| `framework_applicability` | jsonb | Yes | e.g. `{ "IFRS_SME": true, "GRAP": true }` |
| `industry_tags` | text[] | No | Industry pack filters |
| `jurisdiction_tags` | text[] | No | Jurisdiction filters |
| `xbrl_binding_id` | UUID | No | Optional readiness link |
| `status` | enum | Yes | `active` \| `deprecated` |

---

## 3. Hierarchy rules

1. Root nodes are statement classes (`SFP`, `PL`, `OCI`, `EQ`, `CF`) or `DISC` / `POL`.  
2. Parent-child must preserve statement_ownership consistency (child inherits unless `note_only`).  
3. Only `detail` and `manual_input` nodes may receive **direct** CTB mappings.  
4. `subtotal` / `total` / `derived` nodes obtain amounts via `LineCalculationRule`.  
5. Deprecation never deletes codes (XBRL/history stability).

---

## 4. Mapping into taxonomy

| Source | Mechanism | Persistence |
|--------|-----------|-------------|
| Native CoA account | `MappingLine` → taxonomy_code | ChartMappingSet versioned |
| Imported TB line | `FrpMappingRule` / queue → taxonomy_code | FrpMappingSet; carry forward by account_code |
| Type default | `DefaultTypeMap` (Asset→…) | Pack seed; overrideable |
| Industry | IndustryPack adds/hides nodes | Overlay, not fork |

Roll-forward: mapping by `source_account_code` + `source_system` persists across periods (Draftworx/CaseWare pattern).

---

## 5. Sign & normal balance

Aligned with FRP V7.0.0 sign rules and extended:

| Account nature | Normal balance | Display on credit-normal statement line |
|----------------|----------------|----------------------------------------|
| Asset | debit | as_is |
| Liability | credit | as_is (credit shown positive on SFP) |
| Equity | credit | as_is |
| Income | credit | invert_display on expense-style layouts if required |
| Expense | debit | as_is |

`sign_behaviour` is **presentation**; sealed CTB stores signed closing_balance consistently.

---

## 6. Cross references from taxonomy

`CrossReferenceRule`:

| Field | Meaning |
|-------|---------|
| `from_taxonomy_code` | Statement line |
| `to_disclosure_code` | Note |
| `role` | `primary_note` \| `also_see` \| `policy` |
| `auto_number` | bool |
| `suppress_if_zero` | bool |

---

## 7. Framework applicability without engine redesign

Taxonomy nodes carry applicability flags. Statement Engine **consumes** the active pack’s node set filtered by:

`framework_binding` ∩ `industry_pack` ∩ `jurisdiction_pack` ∩ `entity_type`

No per-framework code fork of calculation engines.
