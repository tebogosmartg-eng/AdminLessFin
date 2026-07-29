# Risk Assessment

**Product:** AdminLess Fin · **Version:** 3.5.3 · **Date:** 2026-07-12  
**Board:** Independent Principal Enterprise Database Governance Board

---

## Risk register

| ID | Risk | Severity | Likelihood | Impact | Mitigation |
|----|------|----------|------------|--------|------------|
| R1 | Migration A insert conflicts with existing label | **NONE** | Rare | None | `ON CONFLICT DO NOTHING`; row absent in production today |
| R2 | Migration A date range overlaps `2025/2026` | **NONE** | N/A | Ambiguous tax-year resolve | Ranges abut: `…2026-02-28` / `2026-03-01…` — verified |
| R3 | Migration A seeds incorrect SARS figures | **LOW** | Low | Wrong PAYE for new periods only | Values align with locked legislation package pattern; historical snapshots untouched |
| R4 | Migration B enum add fails on old Postgres | **NONE** | N/A | Apply failure | Production is Postgres **17** |
| R5 | Migration B not reversible post-commit | **LOW** | Certain if rollback needed | Orphan enum label | Leave label in place (inert); do not rebuild type in emergency |
| R6 | Existing payslip rows corrupted | **NONE** | N/A | Data loss | Migrations perform no UPDATE/DELETE |
| R7 | Finalized runs lose immutability | **NONE** | N/A | Audit break | No writes to `payroll_runs` / journals / snapshots |
| R8 | Dual labels `company_contribution` + `employer_contribution` confuse reports | **LOW** | Possible | Display/filter gaps | Engine writes `employer_contribution`; live rows currently only earning/deduction |
| R9 | Blind `db push` applies unrelated unapplied locals / hits remote-only drift | **HIGH** | High if push used | Wrong objects changed | **Mandatory targeted apply of B then A only** |
| R10 | Apply A without B (or B without A) | **MEDIUM** | Medium if partial deploy | One blocker remains | Deploy **both** in one change window |
| R11 | Re-run migrations | **NONE** | Possible | None | Both idempotent |

---

## Highest residual risk

**R9 — deployment tooling**, not migration SQL. Content of A and B is low-risk; process must prevent collateral migrations.
