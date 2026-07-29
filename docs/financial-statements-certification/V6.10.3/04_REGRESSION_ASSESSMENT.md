# Regression Assessment — V6.10.3

## Preserved (unchanged)

| Component | Status |
|-----------|--------|
| General Ledger | UNCHANGED |
| Statement Engine | UNCHANGED |
| Journal Engine | UNCHANGED |
| Reporting Snapshot Engine | UNCHANGED |
| Validation Engine | UNCHANGED |
| Working Papers | UNCHANGED |
| Accounting calculations / business logic | UNCHANGED |
| Database architecture / migrations | UNCHANGED |
| Edge function API contracts | UNCHANGED |
| Canonical amount extraction / hashing | UNCHANGED |

## Changed (presentation only)

| Component | Change |
|-----------|--------|
| `generatePdfArtifact` | Professional multi-page IFRS AFS layout |
| DOCX / XLSX cover & labels | Human framework label; numbered notes; no fingerprint / line codes on cover |
| Publication metadata | Adds period dates, currency, framework_label for presentation |

## Unit regression

`tests/unit/efs-publication.test.ts` — 7/7 PASS (canonical rounding, disclosure filtering, professional layout, articulation).

## Live export note

`GET_PUBLICATION_ARTIFACT` renders PDF/DOCX/XLSX from the sealed pack dataset at download time. Immutable artefact rows are not altered (DB trigger `EFS_PUBLICATION_ARTIFACT_IMMUTABLE`). New publications store professional presentation bytes at seal time.

## Verdict

**Regression: PASS — no certified engine behaviour altered**
