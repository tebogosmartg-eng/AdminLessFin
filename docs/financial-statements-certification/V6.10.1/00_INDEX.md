# V6.10.1 — Financial Statements Generation Experience Certification

**Product:** AdminLess Fin  
**Board:** Independent Principal Enterprise Accounting Experience Board  
**Scope:** Generation / refresh experience only (accountant-facing)  
**Architecture status:** FROZEN (Statement Engine, Reporting Snapshots, Version Manager, Working Papers, Validation, Review, Publication, Database, APIs, Edge Functions)

---

## Final status

# FINANCIAL STATEMENTS GENERATION EXPERIENCE CERTIFIED

An accountant can generate and refresh Annual Financial Statements without ever seeing or understanding Reporting Snapshots, Snapshot Versions, Lineage, Framework Binding, or any other enterprise implementation concept, while every certified backend component remains completely unchanged.

---

## Certified accountant journey

```
No statements prepared
  → "Annual Financial Statements have not yet been prepared."
  → Generate Annual Financial Statements
  → Platform silently creates/reuses lineage + versions + seals + generates + validates

Statements prepared + accounting unchanged
  → "Financial Statements are up to date."
  → View statements · Supporting Schedules · Review Notes · Downloads

Statements prepared + accounting changed
  → "…already been prepared. Accounting information has changed…"
  → Refresh Financial Statements | Cancel | View Financial Statements
```

Developer / Internal Reporting Snapshot tools require `VITE_EFS_DEVELOPER_TOOLS=true` **and** an approved internal persona.

## Deliverables index

| # | Deliverable | Document |
|---|---|---|
| 1 | Financial Statements Generation UX Standard | [01_generation_ux_standard.md](./01_generation_ux_standard.md) |
| 2 | Refresh Experience Standard | [02_refresh_experience_standard.md](./02_refresh_experience_standard.md) |
| 3 | Internal Snapshot Isolation Standard | [03_internal_snapshot_isolation_standard.md](./03_internal_snapshot_isolation_standard.md) |
| 4 | Version Management Experience Standard | [04_version_management_experience_standard.md](./04_version_management_experience_standard.md) |
| 5 | Accountant Messaging Standard | [05_accountant_messaging_standard.md](./05_accountant_messaging_standard.md) |
| 6 | Regression Assessment | [06_regression_assessment.md](./06_regression_assessment.md) |
| 7 | Architecture Compliance Report | [07_architecture_compliance_report.md](./07_architecture_compliance_report.md) |

## Experience-layer implementation (V6.10.1)

| Concern | Implementation |
|---|---|
| Generation mode automation | `src/lib/financialStatements/generationExperience.ts` |
| Accounting-change detection | `src/hooks/useAccountingChangesDetected.ts` |
| Statements UX | `experience/EngagementStatements.tsx` |
| Banner messaging | `components/financialClose/AccountingChangesBanner.tsx` |
| Silent prepare chain | `FinancialStatementsWorkspaceDashboard.tsx` (`prepareStatements`) |
| Developer console gate | `efsFlags.developerTools()` → `VITE_EFS_DEVELOPER_TOOLS` |

## Quality gates (all PASS)

- No Statement Engine / Snapshot / Version Manager / Database / API redesign
- No calculation redesign
- No duplicate snapshots (lineage reuse remains platform responsibility)
- Existing version management and lineage preserved
- Experience layer only
- Zero engineering terminology on accountant surfaces
