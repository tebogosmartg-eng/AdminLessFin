# AdminLess Fin — Release Blocker Register

Single source of truth for confirmed release blockers and their remediation.
Status lifecycle: `Open → InProgress → Fixed → Verified → Closed`.
A blocker reaches **Verified** only when its regression tests pass in CI.

Verification gates run per fix: `tsc --noEmit`, ESLint, `vitest run` (unit),
`vitest run --config vitest.dom.config.ts` (DOM), `vite build`.

| ID | Severity | Category | Status | Regression tests |
|----|----------|----------|--------|------------------|
| RB-001 | Critical | Reliability / Data Integrity | ✅ Closed | `tests/unit/rb-001-invalid-date-boundary.test.ts` |
| RB-002 | High | Reliability | ✅ Closed | `tests/unit/rb-002-safe-date-format.test.ts` (helpers + ratchet) |
| RB-003 | High | Reliability / Infra | ✅ Closed | `tests/dom/rb-003-global-error-handlers.test.tsx` |
| RB-004 | Medium | Reliability / UX | ✅ Closed | `tests/dom/rb-004-company-switch-error.test.tsx` |
| RB-005 | Medium | Data Integrity / i18n | ✅ Closed | `tests/unit/rb-005-no-us-date-format.test.ts` |
| RB-006 | High | Reliability / Architecture | ✅ Closed | `tests/dom/rb-006-error-boundary.test.tsx`, `tests/unit/rb-006-boundary-topology.test.ts` |
| RT-004 | High | Accounting / Data Integrity (backend) | ✅ Closed | `tests/unit/rt-004-fixed-assets-company-fk-migration.test.ts`; `tests/e2e/playwright/05-crud-workflows.spec.ts` (Fixed Assets acquire 5xx guard) |
| RT-005 | High | Purchasing / Bills workflow | ✅ Certified (test harness) | `tests/e2e/playwright/05-crud-workflows.spec.ts` (Bills create+void; self-contained supplier + non-COGS expense account) |

---

## Runtime-confirmed defects (black-box certification)

### RT-004 — Fixed Asset acquisition returns HTTP 500 (misdefined FK)
- **Observed (runtime):** acquiring an asset POSTs to the `fixed-assets` edge and receives **500** `DATABASE_FAILED`; `technicalMessage: insert or update on table "fixed_assets" violates foreign key constraint "fixed_assets_user_id_fkey"`. Frontend behaves correctly (keeps the dialog open, all fields valid).
- **Root cause (B — incomplete migration):** `fixed_assets_user_id_fkey` constrains **company_id → auth.users(id)** (not public.users). Migration `20260728100000` was applied but its DROP filter only matched `public.users`, so the bad FK survived alongside the correct `company_id → companies(id)`.
- **Fix:** migration `supabase/migrations/20260730120000_rt004_drop_fixed_assets_company_id_auth_users_fk.sql` drops any `company_id → auth.users|public.users` FK; applied to linked DB. Live probe: only `fixed_assets_company_id_fkey` remains.
- **Severity:** High — asset capitalisation was impossible on affected companies.
- **Status:** ✅ Closed — DB remediations applied; unit + Playwright regression guards in CI.

### RT-005 — Bills workflow
- **Classification:** Application correct; prior failures were test harness faults (supplier deleted by earlier CRUD test; COGS selected as expense account which the posting engine correctly rejects from Bills).
- **Status:** ✅ Certified when Bills create+void Playwright workflow passes.

### RT-001 — `recurring-invoices` edge returns 500 (not 401) to anonymous callers
- Access is correctly denied; only the status contract is wrong. Low severity, not a blocker. Backend/edge fix + deploy.

### Test-harness faults repaired (app innocent — proven by runtime evidence)
- **Suppliers CRUD:** list button renamed "New Vendor"→"New Supplier"; test selector updated.
- **Bills:** (a) test depended on a supplier the Suppliers-DELETE test removed — Bills now creates its own supplier; (b) test picked "Cost of Goods Sold" as the expense account, which the accounting engine **correctly** rejects from the Bills module — test now selects a non-inventory operating-expense account.
- **Invoices / Fixed Assets / 05b:** unscoped `getByRole('dialog').toBeHidden()` matched a closed Radix Popover (role="dialog") → strict-mode abort; assertions now scoped to the named form dialog. (Invoice create also had a render-timing flake, resolved.)

---

### RB-001 — Malformed date white-screens the entire app
- **Root cause:** `parseISO('2026-02-30')` returns a truthy Invalid Date; the provider's `!financialYearStart` guard let it through; `format()` threw `RangeError` in `ReportingPeriodProvider`, above every error boundary → white screen on all routes.
- **Fix:** `parseIsoDateSafe()` (returns `null` for invalid) at the provider boundary. `src/lib/reportingPeriod/presets.ts`, `src/contexts/ReportingPeriodContext.tsx`.
- **Class kill:** every string→Date at the reporting authority now nulls invalid input; existing truthiness guards hold.

### RB-002 — Invalid-date-format class across pages (~178 sites)
- **Root cause:** `format(new Date(x))` throws on malformed-but-truthy values; presence guards don't protect.
- **Fix:** `src/lib/dates.ts` — `safeFormatDate` / `safeFormatDistanceToNow` / `toValidDate` (never throw). Migrated the fully-unguarded Dashboard `formatDistanceToNow` site.
- **Class kill:** RATCHET test locks the raw-usage count (baseline 178 / 6) — it may only decrease. New code must use the safe helpers. Remaining legacy sites are boundary-contained (RB-006) and tracked for migration.

### RB-003 — No global unhandled-rejection / error net
- **Root cause:** React boundaries can't catch async/event-handler rejections; no `window` listeners → silent failures, no telemetry.
- **Fix:** `src/lib/platform/globalErrorHandlers.ts` (dedup, idempotent) installed in `src/main.tsx`; forwards to `trackError`.

### RB-004 — Company switch: fire-and-forget rejection
- **Root cause:** `onSelect={() => switchCompany(id)}` unawaited/uncaught; `switchCompany` rethrows → unhandled rejection, silent stale company.
- **Fix:** guarded async handler + error toast. `src/components/CompanySwitcher.tsx`.

### RB-005 — US date format on ZA statements
- **Root cause:** `format(new Date(t.date), 'MM/dd/yyyy')` — ambiguous US format on en-ZA documents.
- **Fix:** `dd MMM yyyy` in `CustomerDetail.tsx` and `VendorDetail.tsx` (sibling found by the static guard).
- **Class kill:** static guard fails if any `MM/dd/yyyy` literal reappears under src/.

### RB-006 — Last-resort boundary below the providers
- **Root cause:** `ErrorBoundary` wrapped only `<AppRouter/>`; a provider throw was uncatchable → white screen (enabler of RB-001's severity).
- **Fix:** outer app-level `ErrorBoundary` hoisted above the provider stack in `src/App.tsx`.
- **Class kill:** topology guard asserts the boundary opens before `AuthProvider` and closes after it.
