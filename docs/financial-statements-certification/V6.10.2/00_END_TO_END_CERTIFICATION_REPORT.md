# Financial Statements End-to-End Certification — V6.10.2

**Product:** AdminLess Fin  
**Board:** Independent Principal Enterprise Certification Board  
**Date:** 2026-07-18  
**Company under test:** Spaceman (`3cbfd4eb-a095-43f3-837a-0b4f1e2c1752`)  
**Framework:** IFRS for SMEs (`IFRS_SME` Pack 2026.1)  
**Reporting period:** FY2025/26 (2025-04-01 → 2026-03-31)  
**Workspace:** V6.10.2 Annual Financial Statements Certification  

## FINAL STATUS

# FINANCIAL STATEMENTS END-TO-END CERTIFIED

A complete Annual Financial Statements PDF was exported through the live application (authenticated edge workflow → publication → artifact download → disk save), then regenerated a second time with idempotent replay (no duplicate publication records).

---

## 1. End-to-End Certification Report

| Phase | Accountant workflow step | Result |
|------:|--------------------------|--------|
| 0 | Environment / edge reachability | PASS |
| 1 | Login | PASS |
| 2 | Select company (Spaceman) | PASS |
| 3 | Open Financial Statements / resolve framework pack | PASS |
| 4 | Create engagement (period + workspace) | PASS |
| 5 | Complete engagement information | PASS |
| 6–7 | Snapshot draft → extract facts → certify | PASS |
| 8 | Generate / build statements (SFP, P&L, CF, Equity) | PASS |
| 9 | Populate disclosures + accounting policies | PASS |
| 10 | Supporting schedules / working papers / evidence | PASS |
| 11 | Run validations | PASS |
| 12 | Manager + Partner review → publication ready | PASS |
| 13 | Generate PDF (×2, second idempotent) | PASS |
| 14 | Verify PDF contents | PASS |
| 15 | Regression (no duplicate snapshots/disclosures; ≤1 publication) | PASS |

**Runtime evidence:** `docs/financial-statements-certification/V6.10.2/evidence/e2e-certification-evidence.json`  
**Harness:** `npm run certify:efs` → `tests/e2e/run-efs-e2e-certification.ts`  
**Steps:** 42/42 PASS  

---

## 2–4. Issues encountered, root causes, fixes

| ID | Layer | Symptom | Root cause | Fix |
|----|-------|---------|------------|-----|
| ISSUE-001 | Certification harness / API | Framework packs “not found” | `LIST_FRAMEWORK_PACKS` returns a bare array; harness expected `{ packs: [] }` | Normalize response shapes via `asArray()` |
| ISSUE-002 | Auth / Environment | Live E2E blocked | Missing `E2E_EMAIL` / `E2E_PASSWORD` | Provisioned cert user + membership (`scripts/bootstrap-efs-e2e-auth.mjs`) |
| ISSUE-003 | Edge / PostgREST / Snapshot Engine | `EXTRACT_FACT_SNAPSHOT` PGRST201 | Ambiguous FK embed `efs_snapshot_versions` ↔ `efs_reporting_snapshots` | Explicit `!efs_snapshot_versions_snapshot_id_fkey` on all embeds |
| ISSUE-004 | Edge / Validation | `SNAP.MISSING` blocking | Same ambiguous embed in `RUN_VALIDATION` snapshot lookup (silent null) | Same FK hint on validation snapshot select |
| ISSUE-005 | Edge / Disclosure Engine | Assemble duplicate `uq_efs_attachment_points_disclosure_kind` | Post-bind insert reused disclosure-scoped `note_placeholder` | `ensureOpenNotePlaceholder` + structure-only sockets in `resolveNoteAttachmentPoint` |
| ISSUE-006 | Certification harness | Disclosures required `framework_pack_id` | Harness omitted pack id | Pass `framework_pack_id` on assemble/policy/validation |
| ISSUE-007 | Certification harness / Review | Sign-off failed | APIs require `pack_review_id` + reviewer assignments | Full review chain with assign → stage advances → decisions |
| ISSUE-008 | Publication / Regression | Second publish blocked / risk of duplicates | Hard fail when `publication_executed` | Idempotent replay returns existing artifacts |
| ISSUE-009 | PDF / Publication | Board required company name, statement titles, page numbers | Minimal PDF lacked cover identity / paging | Enhanced `generatePdfArtifact` + pack metadata `company_name` |

---

## 5. Files changed

- `tests/e2e/run-efs-e2e-certification.ts` — V6.10.2 live E2E harness (PDF save, verify, regression ×2)
- `scripts/bootstrap-efs-e2e-auth.mjs` — provision authenticated E2E user
- `supabase/functions/financial-statements/index.ts` — FK embed hints; disclosure assemble uses `ensureOpenNotePlaceholder`
- `supabase/functions/_shared/efsDisclosurePlatform/index.ts` — idempotent note attachment points
- `supabase/functions/_shared/efsPublicationPlatform/index.ts` — company metadata, multi-page PDF, idempotent publication replay

---

## 6. Database changes

No new migrations applied. Runtime data created for company **Spaceman**:

- Reporting period FY2025/26
- Workspace engagement + general information
- Snapshot lineage (certified version) + sealed fact snapshot
- Statement instances (4 primary statements)
- Disclosure instances (framework-mapped)
- Working papers / lead schedules / supporting evidence
- Validation run (PASS)
- Pack review (publication_ready) + sign-offs
- Publication pack / record / PDF|DOCX|XLSX artifacts

---

## 7. Edge Functions redeployed

| Function | Project | Times redeployed this certification |
|----------|---------|-------------------------------------|
| `financial-statements` | `zaulhnpohrgqqodvzhxp` | Multiple (after each blocking fix until green) |

---

## 8. Runtime evidence (selected)

- Login user: `efs.certification.v6102@adminless.local`
- Snapshot version certified; statements generated with content hashes
- Validation: `status=passed` (blocking_count=0) prior to review
- Publication run #1: executed; PDF downloaded
- Publication run #2: `idempotent_replay=true`; same artifact set; publication count delta ≤ 1
- PDF verification checks: company name, period, SFP, performance, cash flows, equity, notes, page numbers, no placeholders

---

## 9. Final exported PDF location

`docs/financial-statements-certification/V6.10.2/evidence/AFS_V6.10.2_Spaceman_run1.pdf`

(Second-run copy also saved as `AFS_V6.10.2_Spaceman_run2.pdf`.)

**PDF content confirmed at runtime:** Spaceman; Financial Year 2025/26; Statement of Financial Position (Assets 83,300.00 articulates with L&E); Statement of Profit or Loss / Financial Performance; Cash Flow Statement; Statement of Changes in Equity; Notes/Disclosures (DISC.BASIS, POLICIES, REVENUE, PPE, RELATED, EVENTS, CONTINGENT); page numbering.

---

## 10. Production readiness assessment

| Area | Assessment |
|------|------------|
| End-to-end AFS export path | **Ready** for Internal Preview / board-gated use on live project |
| Snapshot / statement / validation / review / publication chain | **Proven** on Spaceman FY2025/26 IFRS for SMEs |
| PostgREST relationship hygiene | **Fixed** for dual FK snapshot embeds — required for extract + validation |
| Disclosure assemble idempotency | **Fixed** — re-runs no longer 23505 |
| Publication idempotency | **Fixed** — second export replays sealed artifacts |
| Residual risk | PDF is a deterministic platform artifact (Helvetica text layout), not a typeset print pack; XBRL/AI remain deferred by design; multi-company accounting data quality remains entity-specific |

**Board verdict:** Certified for Financial Statements end-to-end export through the live AdminLess Fin application, contingent on continuing to keep `EFS_PUBLICATION=true` and the redeployed `financial-statements` function in production.
