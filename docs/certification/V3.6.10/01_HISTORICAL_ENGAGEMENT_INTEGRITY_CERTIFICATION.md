# Historical Engagement Integrity Certification

**Board:** Chief ERP Architect / Principal Financial Reporting Auditor  
**Product:** AdminLess Fin  
**Date:** 2026-07-29  
**Status:** CERTIFIED  
**Prerequisite:** V3.6.10 Financial Statements Reporting Context Certified

---

## Mission

Prove that historical Financial Statement engagements remain immutable while draft /
open engagements always consume the canonical Financial Calendar.

---

## 1. Engagement lifecycle matrix

AFS uses three status layers. The board-facing lifecycle maps as follows.

| Board status | System mapping | Can FY change (rebind to Current FY)? | Consume ReportingPeriodContext? | Historically fixed? |
|--------------|----------------|----------------------------------------|----------------------------------|---------------------|
| Draft | Workspace `opened` + review `draft` | No if already bound; unbound live → auto-bind active open FY | Yes — labels via `resolveEngagementReportingPeriod` | No (live calendar consumer) |
| In Progress | `facts_sealed` … `validated` / review mid-flow | Same as Draft | Yes | No |
| Ready for Review | review `validation_complete` | Same as Draft | Yes | No |
| Manager Review | review `manager_review` / `manager_approved` | Same as Draft | Yes | No |
| Partner Review | review `partner_review` / `partner_approved` / `publication_ready` | Same as Draft | Yes | No |
| Published | workspace `published` (+ pack sealed) | **No** — sealed gate blocks active-FY auto-rebind | Yes — display from **linked** `financial_year_id` | **Yes** |
| Archived | workspace `archived` | **No** | Yes — linked FY only | **Yes** |

Sealed workspace statuses (edge + client contract):

`published` · `certified` · `closed` · `locked` · `archived`

---

## 2. Historical vs active reporting behaviour

| Event | Draft / open (unbound) | Draft / open (bound) | Published / Archived |
|-------|------------------------|----------------------|----------------------|
| Change Current FY in Settings | Cache invalidate → reconcile may bind to new active open FY | Stays on linked FY; UI may show Historical | Stays on linked FY; Historical badge; **no rebind** |
| Sync label/dates from linked `financial_years` | Yes | Yes | Yes (same FY identity — not a Current-FY rebind) |
| Sealed PDF / pack / artefacts | N/A | N/A | **DB-immutable** |
| Review history / sign-offs | Mutable until seal | Mutable until seal | **DB-immutable** |
| Publication metadata | Pending | Pending | **Immutable** (idempotent re-publish returns existing) |

Authority chain:

```
ReportingPeriodContext
        ↓
financial_years
        ↓
resolveEngagementReportingPeriod()
        ↓
Workspace · Document · PDF · Filename · Certification · Publication · Review · Cover · Headings
```

---

## 3. Remaining year-reference classification

| Pattern | Classification | Notes |
|---------|----------------|-------|
| `financial_years.year_code` / `period_key` | ✓ Canonical | Sole FY identity |
| `resolveEngagementReportingPeriod` / `ReportingPeriodContext` | ✓ Canonical | Display SoT |
| `reportingPeriodCoverTitle(end_date)` → `FOR THE YEAR ENDED …` | ✓ Canonical | Derived from calendar end date |
| `formatFinancialYearEnd` (month/day settings) | ✓ Canonical | Profile FY-end config, not engagement identity |
| Test fixtures `2025/26`, `31 March 2026` | ⚠ Historical | Prove demotion of frozen slash labels |
| Cert evidence JSON / V6.10.3 docs | ⚠ Historical | Point-in-time certification artefacts |
| Sample / composition fixtures (`Year ended 31 March 2026`) | ⚠ Historical | Demo models only |
| E2E `Financial Year 2025/26` seed labels | ⚠ Historical | Edge sync rewrites to `year_code` |
| Live UI fallback to `Financial Year 2025/26` | ✗ Hardcoded | **Removed** — never promoted as display identity |

No production AFS surface hardcodes a calendar year as engagement identity.

---

## 4. Document generation period chain

| Surface | Derivation |
|---------|------------|
| Workspace home / dashboard | `useReportingPeriod` → `resolveEngagementReportingPeriod` |
| Engagement overview / document workspace | Same |
| Document model period | Dashboard period after edge sync (`year_code` / `period_key`) |
| Cover title | `reportingPeriodCoverTitle(calendar end_date)` |
| PDF / DOCX presentation | `canonicalDocumentView` ← model period from calendar |
| Filename / certification meta | Pack dataset sealed at publication; presentation may re-render bytes without mutating artefact rows |
| Review / publication panels | Workspace + pack status; period labels from resolver |

---

## 5. Phase 5 simulation (proof)

Unit suite `tests/unit/afs-calendar-year-binding.test.ts` — Historical engagement integrity:

1. Create engagement bound to FY2027 → resolves active, cover `28 FEBRUARY 2027`
2. Advance Current FY to FY2028 → same period still FY2027, `isHistorical === true`, cover unchanged
3. New draft on FY2028 → follows active calendar
4. Archived FY2026 → remains historically fixed

Edge: `reconcileReportingPeriodWithCalendar` refuses active-FY auto-bind when workspace status is sealed.

DB: `trg_efs_publication_*_immutable`, `trg_efs_pack_review_*_immutable`, fact-snapshot immutability.

Settings: `FinancialYearSettings` invalidates `financial_years` / `efs_*` only — no bulk rewrite of published FY identity.

---

## 6. Files touched (this certification)

- `src/lib/financialStatements/calendarYearBinding.ts` — sealed-status contract helper
- `tests/unit/afs-calendar-year-binding.test.ts` — Phase 5 integrity proofs
- `supabase/functions/financial-statements/index.ts` — sealed-gate alignment comment
- `docs/certification/V3.6.10/01_HISTORICAL_ENGAGEMENT_INTEGRITY_CERTIFICATION.md`
- `docs/certification/V3.6.10/00_CERTIFICATION_INDEX.md`

---

## 7. Build status

- Unit tests: `afs-calendar-year-binding` historical suite — see CI / local vitest
- No schema change
- No accounting / journal / BOE changes

---

## Final Certification

**HISTORICAL REPORTING ARCHITECTURE CERTIFIED**
