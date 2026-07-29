# Historical Integrity Report

**Product:** AdminLess Fin · **Version:** 3.5.4 · **Date:** 2026-07-12

---

## Migration phase (pre → post B → post A)

| Fingerprint | Pre | Post B | Post A |
|-------------|-----|--------|--------|
| Finalized runs | `9a6f5e0930f42d85ac862178a0443111` | identical | identical |
| Payslips (all) | `25a136cc433736018f2133a6b702152c` | identical | identical |
| Payslip items | `a5f9bfc79a11bf3707049dfde7318341` | identical | identical |
| JE items amount sum | `280864.00` | identical | identical |
| Finalized count | 6 | 6 | 6 |

**Conclusion:** Neither migration mutated historical payroll, payslips, or journals.

---

## Post-E2E phase (original finalized runs)

Baseline: `finalizedBefore` captured at E2E start (`evidence/03-payroll-e2e.json`).

| Check | Result |
|-------|--------|
| Original finalized count | 6 |
| Run field mismatches (status, journal_entry_id, processed_at, approved_at) | **0** |
| Runs unchanged | ✓ |
| Historical journals balanced | ✓ (`306cfe16…` 10000/10000; `78d1966f…` 10200/10200) |
| Decision | **PASS** |

Evidence: `evidence/04-historical-integrity-verified.json`

---

## Immutability statement

Existing finalized payroll runs remain:

- unchanged in identity fields  
- immutable in status (`finalized`)  
- journals balanced and still linked  
- historical payslips retained (6 payslips / 16 items on original finalized runs)

New E2E run `4474253a-…` is an additive certification artifact, not a rewrite of history.
