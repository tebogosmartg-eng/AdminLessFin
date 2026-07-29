# 03 — Validation Engine Report

**Version:** 3.6.1

## 1. Isolation principle

Validation modules **do not** extract PAYE/UIF/SDL from snapshots for calculation. They inspect the generated `StatutoryReturn` declaration and source-gate issues.

| Return | Validator path |
|--------|----------------|
| EMP201 | `returns/emp201/validator.ts` |
| EMP501 | `returns/emp501/validator.ts` |
| IRP5 / Tax Cert | `returns/irp5/validator.ts` |

Shared helpers remain in `src/lib/statutoryReturns/validate.ts` (input / finalized-run gates).

## 2. EMP501 reconciliation

`EMP501_PAYE_RECON_MISMATCH` lives **only** in the validator — generation builds `monthlyBreakdown` + `reconciliation`; validation proves roll-up.

## 3. Pipeline

`runStatutoryReturnPipeline` stage `validate` calls `plugin.validate` independently after `plugin.generate`.

## 4. Verdict

**CERTIFIED** — Validation engine isolated from generation.
