# 05 — Validation Report

**Version:** 3.6.6  
**Module:** `validation.ts`

## Checks (`validateVipWorkingPaper`)

| Check | Rule |
|-------|------|
| Employee uniqueness | Each employee number appears once |
| Component completeness | Every VIP component code present once per employee |
| No duplicate components | Line codes unique within employee |
| Annual totals | Sum(Mar…Feb) === Annual Total |
| Month columns | All SA FY months present on each line |
| Employee count | `employeeCount === employees.length` |

## Source integrity

- Facts only; snapshot checksums retained on report (`snapshotChecksums`)
- Totals (Gross / Net / CTC) read from `fact.totals` — not recalculated
- Statutory lines prefer engine_results via existing `measureFactItemAmount`

## Verdict

**CERTIFIED** — Validation gate passes on unit evidence.
