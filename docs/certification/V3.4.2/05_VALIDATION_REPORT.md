# Validation Report

**Product:** AdminLess Fin · **Version:** 3.4.2 · **Date:** 2026-07-12

## verifyLegislation()

Fails startup when:

- package metadata incomplete
- constant provenance incomplete / checksum mismatch
- duplicate IRP5 codes within a package
- duplicate EMP201 codes within a package
- overlapping effective dates (per country)
- gaps between consecutive versions (per country)
- document catalogue missing required filenames
- package checksum invalid

Wired via `assertLegislationRepositoryValid()` in `main.tsx` and `npm run verify:legislation`.

## Result

`ok: true` (warnings only: NA/BW empty stubs; PDF binaries pending for implemented packages).

## Validation gate: PASS
