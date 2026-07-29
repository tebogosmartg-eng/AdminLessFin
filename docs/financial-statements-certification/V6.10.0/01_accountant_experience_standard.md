# 1. Accountant Experience Standard

**Version:** 6.10.0  
**Audience:** Small / medium businesses, accounting firms, internal accountants, financial managers

## Principle

The accountant prepares Annual Financial Statements.  
AdminLess Fin performs enterprise orchestration invisibly.  
The accountant must never be exposed to enterprise implementation details.

## Questions the interface answers

1. What am I preparing?
2. What information is still missing?
3. What should I do next?
4. Am I ready for review?
5. Am I ready for publication?

Everything else is internal.

## Canonical journey

1. Open **Annual Financial Statements**.
2. Create a new engagement (Smart Interview) or open an existing one.
3. Use the **Overview** dashboard to see status, readiness, and next action.
4. On **Financial Statements**, choose **Generate Annual Financial Statements** or **Refresh Financial Statements**.
5. Complete **Supporting Schedules**, **Notes & Disclosures**, **Validation**, **Review**, and **Publication** using accounting language only.

## Professional judgement vs automation

| Accountant decides | Platform automates |
|---|---|
| Reporting framework | Trial balance capture / statement generation chain |
| Financial year | Statement structure, notes assembly, validation runs |
| Prepared by / reviewers | Snapshot draft, extract, certify, freeze internals |
| Sign-off and publication timing | IDs, hashes, fingerprints, pipeline controls |

## Forbidden accountant-facing concepts

Never expose: Reporting Snapshot, Snapshot Status, Snapshot Pipeline, Framework Pack, Bind Framework, Extract & Seal Facts, Seal Facts, Draft Version, Generate From Snapshot, Freeze, Certify, Hashes, Fingerprints, Internal IDs, Developer / Pipeline terminology.

These remain available only behind the existing Developer / Internal Advanced gate.

## Pass criteria

A CaseWare / Draftworx / CCH-trained accountant can complete the engagement without learning AdminLess Fin architecture terminology.
