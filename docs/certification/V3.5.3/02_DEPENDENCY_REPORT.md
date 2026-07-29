# Dependency Report

**Product:** AdminLess Fin · **Version:** 3.5.3 · **Date:** 2026-07-12  
**Board:** Independent Principal Enterprise Database Governance Board

---

## Cross-dependency between A and B

| Question | Result |
|----------|--------|
| Does `20260707120000` (B) depend on `20260707140000` (A)? | **No** |
| Does `20260707140000` (A) depend on `20260707120000` (B)? | **No** |

They touch **disjoint objects**:

- B → enum `payslip_item_type`
- A → table `payroll_tax_year_config`

Either order is **functionally valid**.

---

## ONLY safe execution order

For Supabase migration versioning and chronological governance, the **only approved order** is:

```text
1) 20260707120000_payslip_item_employer_contribution   (Migration B)
2) 20260707140000_tax_year_2026_2027                    (Migration A)
```

Rationale: filename timestamps encode order (`120000` before `140000`). Applying A before B would diverge from repo history and confuse `migration list` / repair tooling even though SQL would still succeed.

---

## Runtime dependency (application, not SQL)

Unblocking payroll end-to-end requires **both**:

1. B — so `payslip_items.type = 'employer_contribution'` inserts succeed  
2. A — so pay dates ≥ `2026-03-01` resolve a tax year  

Neither SQL file requires the other to *apply*, but both are required for the V3.5.2 blockers to clear.

---

## Migration history drift (deployment path risk)

`supabase migration list --linked` (certification time):

| Version | Local | Remote |
|---------|-------|--------|
| `20260707120000` (B) | present | **missing** |
| `20260707140000` (A) | present | **missing** |
| Other local-only | `20260703140000`, `20260703150000`, `20260705180000` (×2 filenames), `20260707150000` | missing |
| Remote-only | — | `20260708071540` |

**Implication:** A full unattended `db push` is **not** certified as the apply vehicle for A/B alone. Targeted application of B then A (SQL + history repair marking those two applied) is required.

Duplicate local version `20260705180000` (`statutory_payroll_engine.sql` and `employee_identity_platform.sql`) is out of scope for this certification but must not be pulled into this deployment window.
