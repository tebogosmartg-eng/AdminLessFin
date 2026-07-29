# 2. Financial Statements Workspace Standard

**Version:** 6.10.0

## Workspace composition

The engagement workspace contains only:

| Tab | Purpose |
|---|---|
| Overview | Accountant dashboard and guided next action |
| Information | Company / engagement information |
| Financial Statements | AFS workspace — Generate / Refresh / view statements |
| Supporting Schedules | Accounting schedules by topic |
| Notes & Disclosures | Disclosure topics (note numbers at publication) |
| Validation | Readiness, issues, recommended actions |
| Review | Manager / Partner review, queries, digital sign-off |
| Publication | Ready status, generate outputs, download, archive |

No engineering panels. No developer cards on the standard path.

## Financial Statements tab

### Before generation

Display:

> Annual Financial Statements have not yet been prepared.  
> Complete the required preparation steps below and generate the statements.

Primary action: **Generate Annual Financial Statements**

No references to snapshots, pipelines, or advanced instructions.

### After generation

Replace Generate with **Refresh Financial Statements**.  
The platform decides internally whether regeneration requires snapshots or other orchestration.  
The accountant never needs to know.

### Implementation

- `src/pages/financialStatements/experience/EngagementStatements.tsx`
- Silent orchestration: `prepareStatements` mutation in `FinancialStatementsWorkspaceDashboard.tsx` (certified APIs only)

## Status messages (accounting wording)

| Internal concept | Accountant wording |
|---|---|
| No Snapshot | Financial Statements have not yet been generated / prepared |
| Publication not_ready | Not yet ready for publication |
| Snapshot sealed / facts_sealed | Statements prepared successfully |

## Pass criteria

The Financial Statements tab feels like an Annual Financial Statements workspace, not an engineering console.
