# V6.6.2 — Accountant-First Experience Certification

Enterprise architecture, Statement Engine, Working Papers, Disclosure Platform,
Validation, Review Workflow and Publication Platform remain FROZEN. This release
changes the experience layer only, plus additive engagement fields.

---

## 1. Accountant Experience Blueprint

The accountant never interacts with software architecture. The journey is:

```
Financial Statements
  -> New Annual Financial Statements
  -> Engagement (minimum professional inputs)
  -> Entity Information (auto-retrieved; complete Missing Information)
  -> Generate Annual Financial Statements (one action)
  -> Overview -> Information -> Financial Statements -> Working Papers
     -> Notes & Disclosures -> Validation -> Review -> Publication
```

Design rule: hide software, expose accounting. No snapshot IDs, structure IDs,
publication pack IDs, node IDs, hashes, pipeline controls, or diagnostics appear
in the accountant-facing surfaces.

## 2. Smart Interview Workflow

The wizard behaves like an interview and asks only what cannot be inferred.

Step 1 — Engagement (accountant judgement only):
- Reporting Framework (required)
- Financial Year (auto, editable)
- Comparative Period (auto = prior year)
- Reporting Currency / Functional Currency (auto default ZAR)
- Prepared By (auto = signed-in user)
- Reviewer (Manager), Partner
- Approval Date, Authorisation Date

Step 2 — Entity Information: retrieved automatically; empty items render as
"Missing Information" and can optionally be completed.

Step 3 — Smart Generate: a single "Generate Annual Financial Statements" action.

Implementation: [NewEngagementWizard.tsx](src/pages/financialStatements/NewEngagementWizard.tsx)

## 3. Automatic Data Population Matrix

| Field | Source | Behaviour |
|---|---|---|
| Registered Name | `companies.name` | Prefilled |
| Business / Registered Office Address | `companies.address` | Prefilled |
| Income Tax Number | `companies.tax_id` | Prefilled |
| Financial Year End | `profiles.financial_year_end_month/day` | Prefilled |
| Reporting Period dates | `profiles.current_financial_year_start` + FYE | Derived |
| Comparative Period | Derived (prior FY) | Derived |
| Reporting / Functional Currency | Default ZAR | Prefilled |
| Prepared By | Signed-in profile / email | Prefilled |
| Reporting Framework | `LIST_FRAMEWORK_PACKS` | Selected |
| Registration No, VAT No, Directors, Auditor, Secretary, Bankers, Share Info | Prior engagement record | Prefilled; else "Missing Information" |
| Reviewer, Partner, Approval/Authorisation dates | Accountant input | Interview |

Fields without a system source are shown as "Missing Information" rather than
empty inputs — see [EngagementInformation.tsx](src/pages/financialStatements/experience/EngagementInformation.tsx).

## 4. Workspace Navigation Standard

Eight accountant-facing tabs, no engineering panels:

Overview · Information · Financial Statements · Working Papers ·
Notes & Disclosures · Validation · Review · Publication

Implementation: [FinancialStatementsWorkspaceDashboard.tsx](src/pages/financialStatements/FinancialStatementsWorkspaceDashboard.tsx).
Internal pipeline tools remain available only behind the existing persona/allowlist
gate as a collapsed "Advanced" area.

## 5. SME User Journey

A first-time accountant with limited systems knowledge:
1. Opens Financial Statements, clicks New Annual Financial Statements.
2. Answers a short interview (framework + sign-off roles/dates).
3. Reviews auto-retrieved entity information; fills any Missing Information.
4. Clicks Generate Annual Financial Statements.
5. Works through Overview and the seven review tabs, resolving validation issues,
   completing manager and partner review, then publishing.

No knowledge of snapshots, structures, attachment points, or fingerprints is required.

## 6. Automation Orchestration Report

The single Generate action runs the certified backend sequence via
[orchestrator.ts](src/lib/financialStatements/orchestrator.ts):

Reporting entity -> reporting period -> reporting workspace -> engagement info ->
snapshot draft -> fact seal -> certify -> statement generation ->
disclosure assembly + accounting policy set -> validation -> review context.

Publication context is created by the existing publication path when review is
complete. Progress is reported in accounting language only.

## 7. Regression Assessment

| Surface | Status |
|---|---|
| Statement Engine / Snapshots / Validation / Review / Publication / Working Papers / Disclosures | Unchanged |
| Accounting RPCs, Journal Engine, GL, Chart of Accounts | Unchanged |
| Existing dispatcher methods | Unchanged |
| Existing migrations (V6.4.x, V6.6.1) | Unchanged |
| Existing routes and `VITE_EFS_*` flags | Preserved |
| Additive migration `efs_v662_engagement_minimum_information` | New columns only |
| UPSERT method | Extended to persist new additive fields |

No duplicated calculations, no duplicated ownership; experience layer only.

## 8. Architecture Compliance Report

| Gate | Evidence |
|---|---|
| Existing architecture unchanged | No shared engine modules edited |
| Existing APIs unchanged | Prior methods intact; additive fields only |
| Existing database preserved | Additive `ALTER TABLE ADD COLUMN IF NOT EXISTS` |
| Statement Engine / Validation / Review / Publication unchanged | Not modified |
| Existing routes / migrations / feature flags preserved | Confirmed |
| No duplicated calculations / ownership | Generation still owned by `GENERATE_STATEMENTS` |
| Experience layer only | Wizard, tabs, presentation, orchestration, docs |

---

## Final status

**ACCOUNTANT EXPERIENCE CERTIFIED**

A first-time accountant can prepare a complete Annual Financial Statements
engagement without understanding any internal platform architecture.
