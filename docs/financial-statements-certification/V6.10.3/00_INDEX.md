# Professional Annual Financial Statements Certification — V6.10.3

**Product:** AdminLess Fin  
**Board:** Independent Principal Enterprise Financial Reporting Board  
**Date:** 2026-07-18  
**Version:** 6.10.3  
**Company under test:** Spaceman  
**Framework:** IFRS for SMEs  
**Reporting period:** FY2025/26 (year ended 31 March 2026)

## FINAL STATUS

# PROFESSIONAL ANNUAL FINANCIAL STATEMENTS CERTIFIED

The exported Annual Financial Statements PDF is a publication-quality IFRS for SMEs pack with professional cover, contents, statement captions, numbered notes, headers/footers and page numbering — without developer markers, DISC.* codes, fingerprints, snapshot/lineage terminology or internal IDs.

Live E2E (`npm run certify:efs`): **0 failed steps** — PDF downloaded through authenticated publication artifact API.

---

## Deliverables

| # | Deliverable | Location / Result |
|---|-------------|-------------------|
| 1 | Professional PDF (live export) | `evidence/AFS_V6.10.3_Spaceman_run1.pdf` |
| 2 | Accounting validation report | `01_ACCOUNTING_VALIDATION_REPORT.md` |
| 3 | Layout validation report | `02_LAYOUT_VALIDATION_REPORT.md` |
| 4 | IFRS presentation assessment | `03_IFRS_PRESENTATION_ASSESSMENT.md` |
| 5 | Regression assessment | `04_REGRESSION_ASSESSMENT.md` |

Runtime evidence: `evidence/e2e-certification-evidence.json`

---

## Scope (presentation only)

**Modified:** Publication PDF/DOCX/XLSX presentation layer; download-time presentation render from sealed pack (immutable artefact rows preserved).

**Not modified:** General Ledger, Statement Engine, Journal Engine, Reporting Snapshot Engine, Validation Engine, Working Papers, accounting calculations, database architecture.

---

## Quality gates

| Gate | Result |
|------|--------|
| Professional layout | PASS |
| Correct accounting presentation | PASS |
| Numbered notes | PASS |
| No debug information | PASS |
| No developer terminology | PASS |
| No internal identifiers | PASS |
| Balanced financial statements | PASS |
| Publication-ready PDF | PASS |
| Live end-to-end export | PASS |
