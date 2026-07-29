# 6. Supporting Schedules UX Standard

**Version:** 6.6.3  
**Surface:** Supporting Schedules (experience over Working Papers platform)

## Principle

Display **accounting schedules**, never Statement Nodes.

## Topics

Cash · Trade Receivables · Inventory · Property Plant & Equipment · Trade Payables · Borrowings · Revenue · Expenses · Taxation · Equity / Net Assets · Employee Benefits · Other

## Expansion model (per topic)

Each topic expands into:

- Lead Schedule  
- Supporting Evidence  
- Schedules & Working Context (Prepared By, Reviewed By, Cross References)  
- Review notes summary when outstanding  

## Backend ownership (unchanged)

Creation still uses certified Working Paper / Close Evidence APIs (`CREATE_WORKING_PAPER`, `GET_CLOSE_EVIDENCE_DASHBOARD`, etc.). UX language is accountant-facing only.

## Forbidden

Structure node codes, attachment point terminology, and pipeline diagnostics on this surface.
