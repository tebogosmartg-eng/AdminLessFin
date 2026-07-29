# 6. Regression Assessment

**Version:** 6.10.1

## Scope

Experience-layer changes only. Certified platforms must remain behaviourally intact.

## Regression matrix

| Area | Result | Evidence |
|---|---|---|
| Statement Engine | PASS | Untouched — still invoked via `GENERATE_STATEMENTS` |
| Reporting Snapshot Engine | PASS | Untouched — still invoked via draft/extract/certify chain |
| Snapshot Version Manager | PASS | Untouched; lineage reuse remains DB + existing method behaviour |
| Working Papers | PASS | Routes/panels unchanged; accountant nav label Supporting Schedules |
| Validation | PASS | `RUN_VALIDATION` still called after prepare; UI unchanged |
| Review | PASS | Experience panels unchanged |
| Publication | PASS | Download PDF/Word/Excel labels preserved |
| Database / Migrations | PASS | No migrations in V6.10.1 |
| Edge Functions / APIs | PASS | No method contracts changed for this certification |
| Calculations | PASS | No calculation code changed |
| V6.10.0 Overview / Navigation | PASS | Accountant nav and Overview checklist retained |
| Duplicate snapshots | PASS | Accountant Generate/Refresh never asks for second lineage; platform reuses `primary` |

## Experience deltas (intentional)

| Change | Risk | Mitigation |
|---|---|---|
| Advanced console gated by `VITE_EFS_DEVELOPER_TOOLS` | Internal testers may not see Advanced | Document flag in `.env.example`; default false for accountants |
| Refresh no longer always visible as permanent button | Users may miss refresh | Banner + refresh_required prompt when accounting changed |
| Prepare errors humanized | Less technical detail for accountants | Developer console still available when flag on |

## Pass criteria

No certified backend regression. Experience changes are additive isolation only.
