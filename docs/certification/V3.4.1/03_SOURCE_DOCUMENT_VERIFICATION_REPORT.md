# Source Document Verification Report

**Product:** AdminLess Fin · **Version:** 3.4.1 · **Date:** 2026-07-12

## Evidence model

Each package owns `versions/<year>/evidence/`:

- `evidence-manifest.json` — required document catalog
- `README.md` — placement instructions
- Official PDFs (audit artefacts; **never parsed at runtime**)

Required document ids: budget, paye-gen, ita, 7th, uif, sdl, bcea, gazette.

## Status policy

| metadata.status | PDF binaries |
|-----------------|--------------|
| `implemented` | Manifest required; PDFs may be pending (startup warning) |
| `certified` | Manifest + PDF presence expected before production certification |

Current packages: **status = implemented** with complete manifests; PDF upload pending business/legal supply.

## Source document gate: PASS (manifest complete)
