# 03 — Regression Report

**Pack:** Financial Statements Internal Preview  
**Version:** 6.5.0  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** PASS (Internal Preview scope)

---

## 1. Quality gates

| Gate | Result | Evidence |
|------|--------|----------|
| Existing Accounting unchanged | ✅ PASS | No edits to Accounting routes, CoA, journals, reconcile, tax rates |
| Existing Reports unchanged | ✅ PASS | Reports links / `/financial-statements` operational path untouched |
| Existing Navigation unchanged except approved sidebar addition | ✅ PASS | Sole addition: FS group between Accounting and Assets & Loans |
| Feature flag remains available | ✅ PASS | `VITE_EFS_*` + `EFS_MODULE`; nav kill-switch retained |
| Permission-based access enforced | ✅ PASS | Persona bridge + allowlist + gate |
| No duplicated accounting calculations | ✅ PASS | Statement Engine still snapshot / Financial Facts Adapter only |
| No live GL reads for statutory statements | ✅ PASS | Generate path remains `live_gl=false` / certified snapshot |

---

## 2. Suites (static / architecture)

| Suite | Scope | Result |
|-------|-------|--------|
| A — Operational live FS | `/financial-statements` → `reports` edge | Unchanged |
| B — Statutory workspace | `/financial-statements-workspace*` + `financial-statements` edge | Flag + persona gated |
| C — Nav isolation | Sidebar order & dual-track labels | PASS |
| D — Deferred surfaces | Publication widget / XBRL / AI | Hidden (`efsDeferredCapabilities`) |
| E — Prior packs V6.4.0–V6.4.6 | Architecture freeze | No redesign |

---

## 3. Code touch list (expected)

| Path | Change type |
|------|-------------|
| `src/lib/financialStatements/flags.ts` | Unlock nav helper; persona bridge; deferred caps |
| `src/components/SidebarNav.tsx` | Approved FS NavGroup |
| `src/components/financialStatements/FinancialStatementsGate.tsx` | Pass `role` into access check |
| `src/pages/financialStatements/FinancialStatementsWorkspaceDashboard.tsx` | Hide Publication widget; panel flags |
| `src/pages/financialStatements/FinancialStatementsWorkspaceHome.tsx` | Internal Preview label |
| `.env.example` | V6.5.0 operator docs |
| `docs/financial-statements-internal-release/V6.5.0/*` | This pack |

---

## 4. Negative tests (operator checklist)

| # | Action | Expected |
|---|--------|----------|
| N1 | Flags default OFF | No FS sidebar; direct URL redirects home |
| N2 | Flags ON, role `member`, empty allowlist | No sidebar; route blocked |
| N3 | Flags ON, role `owner`/`admin` | Sidebar + workspace |
| N4 | Flags ON, member on allowlist | Sidebar + workspace |
| N5 | Nav flag OFF, module ON | Direct URL allowed for persona; **no** sidebar |
| N6 | Open Reports → Financial Statements | Live operational statements still work |

---

## 5. Residual risk

| Risk | Mitigation |
|------|------------|
| Label collision (“Financial Statements” under Reports vs top-level) | Documented dual-track; Internal Preview badge on statutory home |
| Member oversharing if allowlist misconfigured | Empty allowlist denies members |
| Accidental public exposure | Defaults OFF; nav kill-switch |
