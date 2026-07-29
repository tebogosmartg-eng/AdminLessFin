# 03 — Regression Report

**Pack:** Financial Statements Navigation Recovery  
**Version:** 6.5.1  
**Verdict:** PASS

---

## Quality gates

| Gate | Result | Evidence |
|------|--------|----------|
| Accounting unchanged | ✅ PASS | No edits to Accounting links / CoA / journals paths |
| Reports unchanged | ✅ PASS | Operational `/financial-statements` link under Reports retained |
| Sidebar unchanged except approved addition | ✅ PASS | Only FS group remains the approved V6.5.0 addition; recovery fixed gates, not IA |
| Feature flags remain available | ✅ PASS | Kill-switch `VITE_EFS_NAV_SIDEBAR=false` still hides group |
| Permission-based access enforced | ✅ PASS | Owner/Admin yes; member needs allowlist; others no |
| No duplicated accounting calculations | ✅ PASS | No engine changes |
| No live GL for statutory statements | ✅ PASS | No statement-generation changes |
| Workspace route reachable | ✅ PASS | `/financial-statements-workspace` registered + `FinancialStatementsGate` |

---

## Verification checklist (completed)

| # | Check | Result |
|---|-------|--------|
| 1 | Financial Statements registered in SidebarNav | PASS |
| 2 | Flags evaluated (static Vite access) | PASS |
| 3 | Owner / Admin receive nav | PASS |
| 3b | Member without allowlist hidden | PASS |
| 3c | Non-personas hidden | PASS |
| 4 | Order Accounting → FS → Assets & Loans | PASS |
| 5 | Workspace route present | PASS |
| 6 | Operational Reports FS untouched | PASS |

---

## Code touch list (V6.5.1 only)

| Path | Purpose |
|------|---------|
| `src/lib/financialStatements/flags.ts` | Static env + diagnose helper |
| `.env` | Enable Internal Preview flags (local) |
| `.env.example` | Operator recipe |
| `scripts/efs-nav-recovery-evidence.mjs` | Evidence generator |
| `docs/financial-statements-internal-release/V6.5.1/*` | This pack |
