# 06 — Statement Line Model

**Version:** 7.1.0

---

## 1. StatementLineDefinition

| Attribute | Required | Description |
|-----------|----------|-------------|
| `line_code` | Yes | Unique per FrameworkPack (stable) |
| `taxonomy_node_id` | Yes | Backing taxonomy node |
| `display_name` | Yes | Default caption |
| `display_name_overrides` | No | Per-jurisdiction / language jsonb |
| `statement_type` | Yes | financial_position \| financial_performance \| changes_in_equity \| cash_flows \| other |
| `section` | Yes | Presentation section key |
| `current_noncurrent` | No | Classification |
| `is_total` | Yes | Total/subtotal flag |
| `sort_order` | Yes | Within statement |
| `indent_level` | Yes | Typography hint for composer |
| `bold` / `underline` / `page_break_before` | No | Presentation hints |
| `comparative_mode` | Yes | `none` \| `prior_one` \| `prior_n` \| `opening_closing` |
| `visibility_mode` | Yes | `always` \| `if_nonzero` \| `if_mapped` \| `conditional` |
| `visibility_predicate_id` | No | Link to condition |
| `calculation_rule_id` | No | Required if amount_basis=derived |
| `cross_cast_group` | No | Articulation group key |
| `note_ref_rule_id` | No | Auto note column |

---

## 2. LineCalculationRule

| Attribute | Description |
|-----------|-------------|
| `rule_id` | Identity |
| `target_line_code` | Line being calculated |
| `expression_kind` | `sum_children` \| `sum_codes` \| `difference` \| `formula` |
| `operand_line_codes[]` | Inputs |
| `formula` | Optional safe expression AST/json (no arbitrary code) |
| `rounding_mode` | `none` \| `half_up_2` \| `statement_unit` |
| `balance_check` | Optional articulation assertion |

**Examples**

- `sfp.total_assets` = `sum_children` of `SFP.ASSETS.*` detail nodes  
- `sfp.total_liabilities_and_equity` = `sum_codes(sfp.total_liabilities, sfp.total_equity)`  
- Period result = Income activity − Expense activity (existing V6.4.1 behaviour generalised)

---

## 3. StatementLineAmount (instance)

| Attribute | Description |
|-----------|-------------|
| `statement_instance_id` | Parent |
| `line_code` | Definition |
| `entity_id` | Dimension |
| `period_role` | `current` \| `prior_1` \| … |
| `scenario` | `actual` \| `adjusted` \| `consolidated` \| … |
| `measure` | `closing_balance` \| `period_activity` \| … |
| `amount` | numeric(18,2) |
| `amount_fact_ids[]` | Provenance |
| `display_note_number` | Resolved at assemble |
| `suppressed` | bool |

Replaces long-term reliance on opaque `efs_statement_instances.lines` jsonb while allowing dual-write during migration.

---

## 4. Comparative rules

| Mode | Columns produced |
|------|------------------|
| `prior_one` | Current + Prior |
| `prior_n` | Current + Prior1..N (N from engagement config) |
| `opening_closing` | Opening, Movements, Closing (equity / PPE) |
| `none` | Current only |

Prior amounts resolve via `ComparativeBinding` → prior SnapshotVersion → AmountFacts for same taxonomy_code.

---

## 5. Visibility & suppression

1. Evaluate `visibility_mode`.  
2. If `if_nonzero`, suppress when all comparative amounts = 0.  
3. Parent headers suppress if all children suppressed (optional pack flag).  
4. Conditional disclosures may force line visibility even if zero (rare).

---

## 6. Subtotal & cross-casting

- Subtotals use calculation rules, not stored CTB mappings.  
- Cross-cast groups validate Σ section = total (Validation Engine).  
- Rounding differences post to a designated taxonomy node (CaseWare-style rounding account) via Reporting Adjustment — never silent GL invent.
