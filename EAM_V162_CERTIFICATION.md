# AdminLess Fin V16.2 — Enterprise Asset Management

**Status:** ENTERPRISE ASSET MANAGEMENT CERTIFIED  
**Baseline:** Version 16.1 certified (unchanged accounting contracts)

## Architecture summary

V16.2 transforms **Assets & Loans** into an enterprise Asset Management experience **additively**:

| Layer | Approach |
|-------|----------|
| Navigation | Split into **Assets** + **Treasury & Financing**; legacy routes retained as aliases |
| Register | `/fixed-assets` Enterprise Asset Register (KPIs, filters, saved views, bulk actions, details panel) |
| Workspace | `/fixed-assets/:id` tabbed Asset Workspace (Overview → History) |
| Categories | Intelligence fields + `/asset-categories/:id` workspace |
| Documents / Verification / Maintenance | New tables + additive `fixed-assets` edge methods |
| Depreciation / Journals / Dispose | **Unchanged** calculation & posting paths; YTD tracker is additive only |
| AI | `src/lib/assets/assetIntelligence.ts` — architecture/heuristics only (no model calls) |

```
Assets
  Asset Register          → /fixed-assets          (alias: /assets, /assets/register)
  Asset Categories        → /asset-categories
  Asset Acquisitions      → /assets/acquisitions
  Asset Verification      → /assets/verification
  Maintenance             → /assets/maintenance
  Reports                 → /assets/reports

Treasury & Financing
  Loans                   → /loans
```

## Database additions (additive)

- `asset_categories`: useful life, residual %, method, GL accounts, capitalisation threshold, component accounting, verification frequency
- `fixed_assets`: department, custodian, impairment, depreciation YTD, QR/barcode/tag, verification fields
- New: `asset_documents`, `asset_verification_history`, `asset_maintenance_schedules`, `asset_maintenance_records`
- RLS: company membership policies on new tables
- Migration: `supabase/migrations/20260721192825_eam_v162_enterprise_asset_management.sql`

## API additions (non-breaking)

Existing: `GET_ALL`, `GET_ONE`, `POST`, `DISPOSE`  
Additive: `GET_WORKSPACE`, `PATCH_METADATA`, `ADD_DOCUMENT`, `DELETE_DOCUMENT`, `RECORD_VERIFICATION`, `UPSERT_MAINTENANCE_SCHEDULE`, `ADD_MAINTENANCE_RECORD`, `LIST_VERIFICATION_DASHBOARD`, `LIST_MAINTENANCE_DASHBOARD`

Maintenance APIs intentionally **do not** post journals.

## Backward compatibility verification

| Check | Result |
|-------|--------|
| Existing assets continue to load | Pass — GET_ALL extended select; NBV still client-computed |
| Existing categories | Pass — defaults backfilled; name-only create still works |
| Depreciation calculation | Pass — monthly straight-line formula unchanged; YTD fields additive |
| Journal posting (acquire/dispose/depreciate) | Pass — same JE structure |
| Routes `/fixed-assets`, `/fixed-assets/:id`, `/asset-categories`, `/loans` | Pass — preserved |
| Permissions (admin nav) | Pass — Assets + Treasury still `isAdmin` |
| Assets without documents/verification/maintenance | Pass — optional related tables |

## Files modified / added

See release board output in chat for the full inventory.
