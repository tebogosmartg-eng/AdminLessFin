# 1. Accountant Workflow Standard

**Version:** 6.6.3  
**Audience:** Small / medium businesses, accounting firms, internal accountants, financial managers

## Principle

The accountant prepares an Annual Financial Statements engagement.  
AdminLess Fin performs enterprise orchestration automatically.  
Software architecture is invisible.

## Canonical journey

1. Open **Financial Statements** (Annual Financial Statements).
2. Click **New Annual Financial Statements**.
3. **Step 1 — Engagement:** supply only professional-judgement fields.
4. **Step 2 — Entity Information:** review auto-retrieved company / governance / tax data; complete **Missing Information** where required.
5. **Step 3 — Generate Annual Financial Statements:** one button; platform creates workspace, period, snapshot, statements, notes, validation and review context.
6. Land on the **Engagement Dashboard** with **Continue Preparing Annual Financial Statements**.
7. Follow the next logical task through Information → Financial Statements → Supporting Schedules → Notes & Disclosures → Validation → Review → Publication.

## Professional judgement vs automation

| Accountant decides | Platform automates |
|---|---|
| Reporting framework | Reporting workspace / period / snapshot lifecycle |
| Financial year (confirm) | Framework mapping, statement structure, generation |
| Comparative year (confirm) | Accounting policies load, disclosures assembly |
| Reporting / functional currency | Working paper / lead / disclosure / validation / review / publication contexts |
| Prepared by / Manager / Partner | Sealing, certification, and publication internals |
| Approval / authorisation dates | IDs, hashes, fingerprints, pipeline controls |

## Forbidden accountant-facing concepts

Never expose: Reporting Snapshot IDs, Workspace IDs, Statement Node IDs, Publication Pack IDs, hashes, fingerprints, pipeline controls, internal diagnostics, attachment nodes, framework internals, enterprise IDs.

## Pass criteria

A CaseWare / Draftworx / Excel-trained accountant can complete the engagement without learning AdminLess Fin architecture terminology.
