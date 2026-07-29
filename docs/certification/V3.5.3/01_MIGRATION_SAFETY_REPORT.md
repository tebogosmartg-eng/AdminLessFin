# Migration Safety Report

**Product:** AdminLess Fin  
**Version:** 3.5.3  
**Board:** Independent Principal Enterprise Database Governance Board  
**Date:** 2026-07-12  
**Constraint:** No migrations applied; certification only

---

## Migration A — `20260707140000_tax_year_2026_2027`

### Source

```sql
INSERT INTO payroll_tax_year_config (...)
VALUES ('2026/2027', '2026-03-01', '2027-02-28', 'ZA', …)
ON CONFLICT (country_code, tax_year_label) DO NOTHING;
```

### Objects affected

| Object class | Object | Action |
|--------------|--------|--------|
| Table | `public.payroll_tax_year_config` | **INSERT** one row |
| Enums | — | none |
| Constraints | uses existing `UNIQUE (country_code, tax_year_label)` | conflict target only |
| Indexes | unique index backing that constraint | unchanged |
| Foreign keys | — | none |
| Updates | — | none |
| Deletes | — | none |
| Functions | — | none |
| Triggers | — | none |
| RLS | existing `payroll_tax_year_config_select` | unchanged (SELECT USING true) |

### Columns written

`tax_year_label`, `effective_from`, `effective_to`, `country_code`, `brackets`, `rebates`, `medical_credits`, `uif_ceiling_monthly`, `sdl_rate`, `uif_rate`  
Defaults applied by table: `id`, `is_active=true`, `created_at`

### Phase 2 checklist — Migration A

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Idempotent | ✓ YES | `ON CONFLICT (country_code, tax_year_label) DO NOTHING` |
| Transaction safe | ✓ YES | Single INSERT; Postgres 17 |
| Rollback safe | ✓ YES | Post-commit reverse: `DELETE FROM payroll_tax_year_config WHERE country_code='ZA' AND tax_year_label='2026/2027'` (only if no dependent business reliance) |
| Backward compatible | ✓ YES | Additive seed; no column/type change |
| Existing-data safe | ✓ YES | No UPDATE/DELETE; date range adjacent to existing `2025/2026` (`…02-28` → `03-01`), no overlap |
| Production safe | ✓ YES | Matches prior seed pattern (`20260702170000` / `20260705180000`) |

**Migration A: VALIDATED**

---

## Migration B — `20260707120000_payslip_item_employer_contribution`

### Source

```sql
ALTER TYPE payslip_item_type ADD VALUE IF NOT EXISTS 'employer_contribution';
```

### Objects affected

| Object class | Object | Action |
|--------------|--------|--------|
| Enum type | `public.payslip_item_type` | **ADD VALUE** `employer_contribution` |
| Table | `payslip_items.type` (udt) | gains allowed label; no row rewrite |
| Constraints | — | none added/dropped |
| Indexes | — | none |
| Foreign keys | — | none |
| Data inserts/updates/deletes | — | none |
| Functions / triggers | — | none |

### Live enum before deploy

| enumlabel | sortorder |
|-----------|-----------|
| earning | 1 |
| deduction | 2 |
| company_contribution | 3 |
| reimbursement | 4 |

`employer_contribution` is absent (proven). Existing `payslip_items` rows: 17 `earning`, 32 `deduction` only.

### Phase 2 checklist — Migration B

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Idempotent | ✓ YES | `IF NOT EXISTS` |
| Transaction safe | ✓ YES | Postgres ≥12 allows `ADD VALUE` inside a transaction; production is **Postgres 17** |
| Rollback safe | ⚠ PARTIAL | **Uncommitted TX:** rollback removes the value. **Post-commit:** Postgres cannot drop an enum label without type rebuild. Residual: label remains inert if unused |
| Backward compatible | ✓ YES | Additive label; existing values and rows unchanged |
| Existing-data safe | ✓ YES | No rewrite of `payslip_items`; counts unchanged |
| Production safe | ✓ YES | Additive enum extension; required by edge engine persistence |

**Strict Phase 2 note:** Post-commit rollback is not fully reversible. This is a known PostgreSQL enum limitation, not a defect in the migration text. Residual risk rated **LOW** (inert additive label). **No STOP for redesign** — architecture locked; additive enum is the correct fix.

**Migration B: VALIDATED (forward-only rollback documented)**

---

## Production simulation answers (Phase 3)

| Question | Answer |
|----------|--------|
| Will migration succeed without manual intervention? | **SQL yes** when each file is executed against production. **Blind `db push` of entire local history: NO** — migration history drift (see Dependency Report) |
| Will migration fail if executed twice? | **No** — both are no-ops on re-run |
| Will existing payroll runs remain valid? | **Yes** — no mutation of `payroll_runs` |
| Will finalized payroll remain immutable? | **Yes** — neither migration touches run status, journals, or snapshots |
| Will historical payslips remain unchanged? | **Yes** — no UPDATE/DELETE on `payslips` / `payslip_items` |

Live inventory at certification time: 19 payslips, 49 items, 6 finalized/paid runs, 12 draft runs — none rewritten by these migrations.
