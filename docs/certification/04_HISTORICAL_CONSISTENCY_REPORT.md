# 4. Historical Consistency Report

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05

---

## Objective

Verify that payroll calculations using a prior SARS tax year produce identical results when recalculated later, regardless of newer tax tables being available.

---

## Versioning Architecture

| Version Type | Storage | Immutable |
|--------------|---------|-----------|
| Tax year label | `StatutoryRuleSet.taxYearLabel` | ✅ Append-only |
| Rule version | `StatutoryRuleSet.ruleVersion` (e.g. `2024.1.0`) | ✅ Never overwritten |
| Engine version | `ENGINE_VERSION` (`3.0.0`) | Logged in snapshot |
| Formula version | Embedded in audit `formula` field | Per-step |

**Registry:** `VERSIONED_RULE_SETS` contains separate objects for 2024/2025 and 2025/2026. New years are appended; existing entries are not modified.

**Database:** `payroll_tax_year_config` uses `ON CONFLICT DO NOTHING` — historical rows preserved.

---

## Certification Tests

| Test ID | Description | Result |
|---------|-------------|--------|
| hist_tax_year | Pay date 2024-06-15 resolves `2024/2025` | ✅ PASS |
| hist_rule_version | Rule version `2024.1.0` returned | ✅ PASS |
| hist_reproducible_paye | Two runs with same 2024 rule set → identical PAYE | ✅ PASS |
| hist_new_year_unchanged | 2024 calculation unchanged when 2025/2026 exists | ✅ PASS |
| hist_forced_year_label | Forcing 2025 rule set on 2024 date uses 2025 label (controlled test) | ✅ PASS |

---

## Reproducibility Evidence

**Input:** Employee, R20,000 gross, pay date 2024-06-15, rule set 2024/2025

**Run 1 (resolveRuleSetForDate):** PAYE = certified value  
**Run 2 (RULE_SET_2024_2025 direct):** PAYE = identical  
**Net pay:** Identical across runs

---

## Risk: Identical Brackets Across Years

**Finding:** 2024/2025 and 2025/2026 rule sets currently share identical bracket/rebate/medical values. This matches SARS published data (no changes announced for 2025/2026 rebates per SARS website, 12 March 2025).

**Risk:** If SARS publishes different values for a future year, only the new rule set entry must be added. Historical payslips store `tax_year` and `rule_version` in `calculation_snapshot` for replay.

---

## Historical Consistency Conclusion

**VERIFIED** — Versioned rule resolution works. Recalculation with the same rule set produces identical results. Snapshot stores tax year and rule version for audit replay.
