# Provenance Report

**Product:** AdminLess Fin · **Version:** 3.4.2 · **Date:** 2026-07-12

## StatutoryConstant contract

Every constant exposes:

- value
- authority
- sourceDocument
- pageNumber
- sectionReference
- effectiveFrom
- effectiveTo
- legislationVersion
- checksum

No bare SARS numbers are permitted.

## Reverse lookup

`lookupProvenance('rebates.primary', package)` / `lookupProvenanceForPayDate(path, payDate, countryCode)`.

## Provenance gate: PASS
