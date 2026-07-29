# AdminLess Fin V16.4 — EAM Certification Remediation

**Program:** Certification remediation (V16.3 smoke test findings)  
**Status:** See `npm run certify:eam` evidence in `docs/eam-v164/`

## Remediation summary

| Finding | Resolution |
|---------|------------|
| Server-side scalability | `GET_REGISTER`, `GET_REGISTER_FACETS` on `fixed-assets` edge; paginated Asset Register UI |
| Category intelligence | `categoryDefaults.ts` + `AssetForm` auto-fill (overridable) |
| Asset numbering | `allocate_asset_code` / `AST-YYYY-NNNNNN` on POST when code omitted |
| Enterprise seed | `npm run seed:eam` with `EAM_SEED_ALLOW=true` (non-production guards) |
| Certification runner | `npm run certify:eam` |
| Screenshot evidence | `docs/eam-v164/` HTML (+ optional PNG via Playwright) |
| GL validation | Trial balance + acquisition JE checks in runner |
| Performance | Register query benchmarks in evidence JSON |
| Regression suite | `tests/unit/eam-v164-certification.test.ts` |
| Lifecycle | Automated in `tests/e2e/run-eam-certification.ts` |

## Deploy prerequisites

1. Apply migration `20260722120000_eam_v164_certification_remediation.sql`
2. Deploy updated `fixed-assets` Edge Function
3. Set `E2E_EMAIL` / `E2E_PASSWORD` in `.env`

## Commands

```bash
npm run test:eam
npm run certify:eam
# Optional scale seed (never production):
# EAM_SEED_ALLOW=true EAM_SEED_SIZE=1000 npm run seed:eam
# Optional UI PNG capture (vite preview on :4173):
# EAM_CERT_SCREENSHOTS=true npm run certify:eam
```

## Frozen (unchanged)

Depreciation engine, dispose RPC, acquisition/disposal journal structure, reporting calculations.
