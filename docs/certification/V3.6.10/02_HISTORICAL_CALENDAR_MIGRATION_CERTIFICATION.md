# Historical Calendar Migration Certification

**Board:** Chief ERP Architect / Principal Migration Architect  
**Product:** AdminLess Fin  
**Date:** 2026-07-29  
**Status:** CERTIFIED  
**Prerequisite:** V3.6.10 Reporting Context · V3.6.11 Historical Integrity

---

## Mission

Provide an explicit migration workflow for Financial Statement engagements created
before the Enterprise Financial Calendar — without automatic binding.

---

## 1. Migration flow

```
Detect legacy (financial_year_id IS NULL OR linked FY missing)
        ↓
Show "Legacy Financial Statement Engagement" card
        ↓
User chooses ONE of:
  1) Create matching historical Financial Year → link
  2) Link to existing historical Financial Year
  3) Keep as legacy engagement (no bind; dismiss card)
        ↓
Draft only: MIGRATE_LEGACY_REPORTING_PERIOD
Published / archived: informational card only (immutable)
```

Server: creates/links `financial_years` metadata and sets `efs_reporting_periods.financial_year_id`.  
Does **not** mutate journals, sealed packs, PDFs, or review history.

Auto-bind on LIST/GET dashboard for unbound periods: **removed**.

---

## 2. Before vs After UX

| Before | After |
|--------|-------|
| Badge: “Engagement period not linked to Enterprise Financial Calendar” | Badge + card: **Legacy Financial Statement Engagement** |
| Generic unbound warning | Why unbound · implications · recommended action |
| Silent auto-bind to active open FY (drafts) | **No auto-bind** — explicit wizard only |
| No path to create historical FY from engagement dates | Create matching year (e.g. FY2026 · 01 Apr 2025 – 31 Mar 2026) |
| Published looked like an error | Published: historically fixed notice; no mutate actions |

---

## 3. Components / files modified

| File | Change |
|------|--------|
| `calendarYearBinding.ts` | `isLegacyUnbound`, display labels, suggest helpers, keep-legacy ack |
| `financial-statements/index.ts` | Stop auto-bind; `MIGRATE_LEGACY_REPORTING_PERIOD` |
| `api.ts` | `migrateLegacyReportingPeriod` |
| `LegacyEngagementMigrationCard.tsx` | Migration card + wizard |
| `FinancialStatementsWorkspaceDashboard.tsx` | Card + legacy badge |
| `FinancialStatementsWorkspaceHome.tsx` | Legacy list labelling |
| `EngagementOverview.tsx` | Legacy badge copy |
| Unit tests | Legacy detection + link-only resolution |
| This certification doc | — |

---

## 4. Validation

| Check | Result |
|-------|--------|
| Draft can create/link | Edge allows when workspace not sealed |
| Published remains immutable | Edge rejects migrate; UI shows fixed notice |
| Journals untouched | Migration only upserts `financial_years` + updates period link |
| Keep as legacy | localStorage dismiss; no server bind |

---

## Final Certification

**HISTORICAL CALENDAR MIGRATION CERTIFIED**
