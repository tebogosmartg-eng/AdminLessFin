# 3. Smart Interview Workflow

**Version:** 6.6.3  
**Surface:** `NewEngagementWizard.tsx`

## Interview shape

| Step | Title | Intent |
|---|---|---|
| 1 | Engagement | Minimum professional judgement |
| 2 | Entity Information | Confirm auto-retrieved facts; fill Missing Information |
| 3 | Generate Annual Financial Statements | One-click orchestration |

## Step 1 — Engagement (ask only what cannot be inferred)

| Field | Default behaviour |
|---|---|
| Reporting Framework | Selected from available packs (required) |
| Financial Year | Derived from company financial year settings |
| Comparative Year | Prior financial year |
| Reporting Currency | Default ZAR |
| Functional Currency | Default = reporting currency |
| Prepared By | Signed-in user |
| Reviewed By (Manager) | Accountant input / prior engagement |
| Partner | Accountant input / prior engagement |
| Approval Date | Accountant input |
| Authorisation Date | Accountant input |

## Step 2 — Entity Information

Auto-retrieved; empty values show **Missing Information** with space to complete.  
No blank enterprise forms.

## Step 3 — Smart Generate

Single action triggers the certified orchestration sequence (entity → period → workspace → engagement info → snapshot draft → seal → certify → statements → disclosures/policies → validation → review context). Progress copy uses accounting language only.

## Design rule

Before asking the accountant for any field, retrieve from Company, Governance, Accounting, Reporting Framework, Financial Close, and prior engagements.
