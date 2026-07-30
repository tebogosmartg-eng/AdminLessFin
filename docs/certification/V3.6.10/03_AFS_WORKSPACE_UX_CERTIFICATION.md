# Annual Financial Statements Workspace Certification

**Board:** Chief Product Architect / Principal UX Architect  
**Product:** AdminLess Fin  
**Date:** 2026-07-29  
**Status:** CERTIFIED (experience layer)  
**Prerequisite:** Calendar · Reporting Context · KPI · Historical Integrity · Legacy Migration FROZEN

---

## 1. Workspace workflow map

```
Information → Trial Balance → Financial Statements → Supporting Schedules
    → Notes & Disclosures → Validation → Manager Review → Partner Review → Publication
```

Overview shows a soft progress strip + truthful checklist. Primary **Continue** always routes to the next incomplete step.

| Step | Nav | Checklist id | Next-action when due |
|------|-----|--------------|----------------------|
| Company Information | Information | entity / framework / financial_year | Complete / confirm |
| Trial Balance | Trial Balance | trial_balance | Capture or import |
| Statements | Financial Statements | statements | Generate AFS |
| Schedules | Supporting Schedules | schedules | Review (not false-complete) |
| Notes | Notes & Disclosures | notes | Review notes |
| Validation | Validation | validation | Run checks (not false-clear) |
| Manager / Partner | Review | manager / partner | Start review |
| Publish | Publication | publication | Publish |

---

## 2. UX issues addressed (this session)

| Priority | Issue | Fix |
|----------|-------|-----|
| P0 | Schedules/Validation false-complete | Truthful statuses in `engagementPreparation.ts` |
| P0 | TB / Notes missing from next-action | Added checklist targets + CTAs |
| P0 | Fake Download PDF/Word/Excel buttons | Replaced with Open Publication |
| P0 | Notes empty dead end | CTA → Financial Statements |
| P0 | Flag-off one-liners | CapabilityDisabledPanel + Back to Overview |
| P1 | TB copy pointed at Overview refresh | Points to Statements Generate/Refresh |
| P1 | V16.1 badge for all users | Developer tools persona only |
| P1 | Document awaiting TB | Open Trial Balance / Generate Statements |
| P1 | Validation “Check again” before first run | “Run validation checks” |
| P2 | Publication “legacy engine” wording | Professional archive language |
| P2 | Duplicate Continue CTA text | Label + Continue button |

---

## 3. Missing capabilities (deferred — not blocking certification)

- Document search / page navigation inside Live Preview
- Soft tab gating (visual only; hard locks not required)
- Notes tab policy body loading (stub query remains)
- AI disclosure drafting (`efsDeferredCapabilities.aiAssistance`)
- Home “Create engagement” primary CTA wired to calendar picker

---

## 4. Automation opportunities

- After Generate success, Overview next-action advances to Schedules/Notes/Validation automatically (checklist-driven — done)
- Detect accounting change on Overview (banner already on workspace)
- Optional: auto-run validation on entering Validation when never run

---

## 5. AI opportunities (deferred)

- Plain-language next-step coach on Overview
- Draft note wording from TB topics
- Explain validation findings
- Rank engagements by readiness on Home

---

## 6. Files modified

- `src/lib/financialStatements/engagementPreparation.ts`
- `src/lib/financialStatements/generationExperience.ts`
- `src/pages/financialStatements/experience/EngagementOverview.tsx`
- `src/pages/financialStatements/experience/EngagementStatements.tsx`
- `src/pages/financialStatements/experience/EngagementNotesDisclosures.tsx`
- `src/pages/financialStatements/experience/EngagementValidation.tsx`
- `src/pages/financialStatements/experience/EngagementDocumentWorkspace.tsx`
- `src/pages/financialStatements/experience/EngagementPublication.tsx`
- `src/pages/financialStatements/FinancialStatementsWorkspaceDashboard.tsx`
- `src/pages/financialStatements/FinancialStatementsWorkspaceHome.tsx`
- `src/pages/financialStatements/TrialBalanceSourcePanel.tsx`
- `tests/unit/afs-engagement-preparation.test.ts`
- `docs/certification/V3.6.10/03_AFS_WORKSPACE_UX_CERTIFICATION.md`

No accounting engine, BOE, or Financial Calendar changes.

---

## Final Certification

**ANNUAL FINANCIAL STATEMENTS WORKSPACE CERTIFIED**
