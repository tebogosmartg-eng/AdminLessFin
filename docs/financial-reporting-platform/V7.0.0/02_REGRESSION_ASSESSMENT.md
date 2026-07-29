# Regression Assessment — FRP V7.0.0

**Board:** Independent Principal Enterprise Financial Reporting Board  
**Date:** 2026-07-18

## Scope

Additive Financial Reporting Platform (Canonical Trial Balance). No redesign of certified accounting or statutory engines.

## Regression matrix

| Area | Expectation | Result |
|------|-------------|--------|
| Live `/financial-statements` operational reports | Unchanged | **PASS** (not modified) |
| Native EXTRACT_FACT_SNAPSHOT | Still seals facts; optionally via CTB | **PASS** (CTB with legacy fallback) |
| Statement Engine | Still consumes sealed facts only | **PASS** |
| Working Papers / Disclosures / Validation / Review | Unchanged APIs | **PASS** |
| Publication PDF/DOCX/XLSX | Unchanged generation; provenance additive | **PASS** |
| Financial Close / Reconciliation / Fixed Assets | Untouched | **PASS** |
| Unit suite `efs-frp-canonical-tb` | 6/6 | **PASS** |

## Residual risk

- Database migration `20260718210000_efs_frp_v700_canonical_trial_balance.sql` must be applied before CTB persistence; extract falls back to legacy dataset if CTB tables are absent.
- XBRL remains deferred (architecture readiness only).
