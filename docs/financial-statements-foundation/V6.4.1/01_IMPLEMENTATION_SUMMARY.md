# 01 — Implementation Summary (Phase B)

**Version:** 6.4.1  

## Financial Facts Adapter

- Input: `efs_fact_snapshots.dataset` + content hash  
- Output: immutable balances, prior balances, period activity, cash flow facts  
- Rejects missing seal; exposes `live_gl: false`  
- Edge: `GET_FINANCIAL_FACTS`

## Statement Engine

Primary statements (framework-neutral structure, pack-specific titles/labels):

1. Statement of Financial Position  
2. Statement of Financial Performance / Profit or Loss  
3. Statement of Cash Flows  
4. Statement of Changes in Equity / Net Assets  

Edge: `GENERATE_STATEMENTS`, `GET_STATEMENTS`  
Persists: `efs_statement_instances` pinned to `snapshot_version_id` + `fact_snapshot_id`

## Framework Mapping

Seeded for IFRS, IFRS_SME, GRAP, MCS, IPSAS:

- `efs_statement_definitions` (titles)  
- `efs_taxonomy_lines` (presentation lines)  
- `efs_default_type_maps` (Asset/Liability/Equity/Income/Expense → line codes)  

Packs alter **presentation only**. Accounting balances are never rewritten.

## Seal enrichment (still Accounting → Snapshot only)

`EXTRACT_FACT_SNAPSHOT` now also seals `get_period_activity` and `get_cash_flow_statement` into the Fact Snapshot at extract time. Statement generation does **not** call these RPCs.
