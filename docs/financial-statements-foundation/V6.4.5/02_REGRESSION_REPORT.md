# 02 — Regression Report (Phase D1)

**Version:** 6.4.5  

| Gate | Result |
|------|--------|
| Validation never changes financial data | ✅ PASS — engines write only `efs_validation_*`; CHECK `mutates_financial_data = false` |
| Validation reads Reporting Snapshots only | ✅ PASS — snapshot version + fact seal; no GL queries |
| Validation consumes Statement Structure | ✅ PASS — structure nodes / statements in technical engine |
| Validation consumes Disclosure Platform | ✅ PASS — disclosure instances + framework disclosure mappings |
| Validation consumes Working Papers | ✅ PASS — WP completeness + evidence refs |
| No Accounting changes | ✅ PASS |
| No Statement Engine changes | ✅ PASS — `efsStatementEngine/*` untouched |
| Navigation unchanged | ✅ PASS — `shouldShowFinancialStatementsNav()` = false |
| No Manager/Partner Review / Publication / XBRL / AI | ✅ PASS |
| Feature flags default OFF | ✅ PASS |

| Check | Result |
|-------|--------|
| `tsc --noEmit` | PASS |
| C1–C3 triggers/platforms retained | RETAINED |

## Verdict

**Phase D1 regression gates: PASS**
