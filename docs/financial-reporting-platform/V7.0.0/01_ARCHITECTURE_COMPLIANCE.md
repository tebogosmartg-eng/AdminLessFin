# Architecture Compliance — FRP V7.0.0

## Certified modules preserved (no redesign)

| Module | Status |
|--------|--------|
| General Ledger | Unchanged |
| Chart of Accounts | Unchanged |
| Journals | Unchanged |
| Financial Close (EFCP) | Unchanged |
| Enterprise Reconciliation | Unchanged |
| Fixed Assets | Unchanged |
| Reporting Snapshot | Additive column `canonical_tb_id` only |
| Statement Engine | Unchanged consumer of sealed facts |
| Working Papers | Unchanged |
| Validation | Unchanged |
| Review | Unchanged |
| Publication | Unchanged presentation; provenance additive |

## Additive FRP objects

- `efs_ctb_sources`
- `efs_tb_imports` / `efs_tb_import_lines`
- `efs_frp_mapping_sets` / `efs_frp_mapping_rules` / `efs_frp_sign_rules` / `efs_frp_mapping_queue`
- `efs_canonical_trial_balances` / `efs_canonical_tb_lines`

## Primary principle

Reporting never cares whether the Canonical Trial Balance originated from AdminLess GL or an imported Trial Balance. Both project into the same Fact Snapshot dataset shape consumed by the Statement Engine.
