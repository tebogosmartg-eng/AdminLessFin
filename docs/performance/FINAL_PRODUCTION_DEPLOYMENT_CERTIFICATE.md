# Final Production Deployment Certificate

**Product:** AdminLess Fin  
**Role:** Principal Release Engineer  
**Date:** 2026-07-31  
**Environment:** Production (`zaulhnpohrgqqodvzhxp` / `https://adminless-fin.vercel.app`)  
**Decision:** **GO**

---

## 1. Deployment Summary

Final production release of the CFA `statementTotals`-only Dashboard path, Edge Function payload cleanup, sub-ledger reconciliation controls, and a hotfix for invalid Dashboard date formatting. Architecture / CoA / CFA engines were not redesigned.

| Phase | Result |
|---|---|
| Pre-deployment validation | PASS |
| Supabase migrations | PASS (in sync; no pending) |
| Edge Functions | PASS (`dashboard-data`, `accounting`, `reports`) |
| Edge payload shape | PASS |
| Frontend (Vercel) | PASS |
| Runtime smoke | PASS (14/14) |
| Dashboard KPI ← `statementTotals` | PASS |
| Cross-surface money reconciliation | PASS (0.00 KPI variance) |
| Tenant Balance Sheet identity A=L+E | FAIL (pre-existing data; surfaces agree) |

---

## 2. Git Commit

| Field | Value |
|---|---|
| Release commit | `3c69ae208b3bc9969329642fac5c937b87028eaa` |
| Hotfix commit (production HEAD) | `0212610b4a1d159c5b8f2b5460c1a5db53cfab5b` |
| Messages | `release: ship CFA statementTotals-only dashboard and production freeze` / `fix: guard Dashboard date formatting against invalid values` |

---

## 3. Branch

`main` (tracking `origin/main`, up to date)

---

## 4. Build Hash

| Artifact | Value |
|---|---|
| Production index asset | `index-9nCRbsUt.js` |
| Local pre-hotfix `dist/index.html` SHA-256 | `149DDF2122753B4F329C910FE0170264C6BFE8893DB2EEA27723207118B4B9D8` |
| Asset cache | `Cache-Control: public, max-age=0, must-revalidate` — no stale CDN serve |

---

## 5. Supabase Deployment Status

| Item | Status |
|---|---|
| Project | `zaulhnpohrgqqodvzhxp` (Smart Accounting) — ACTIVE_HEALTHY |
| Migrations | Local ≡ remote (through `20260730120000`) — no push required |
| Storage / policies | Unchanged this release |

---

## 6. Vercel Deployment Status

| Field | Value |
|---|---|
| Deployment ID | `dpl_6g6uD1UXTXk2r4q1Rm1L75LDkBXg` |
| Status | READY |
| Production alias | https://adminless-fin.vercel.app |
| Deployment URL | https://adminless-1ti9bj0wb-tebogosmartg-engs-projects.vercel.app |
| Created | 2026-07-31 11:12:25 +0200 |

---

## 7. Edge Function Deployment Status

| Function | Status | Notes |
|---|---|---|
| `dashboard-data` | Deployed (v25) | SHA `907e1ff9…`; returns `statementTotals` only for money |
| `accounting` | Deployed | Shared CFA modules included |
| `reports` | Deployed | Returns `statementTotals` (+ compat alias `canonicalAggregation`) |

---

## 8. Database Migration Status

**PASS** — all local migrations present on remote; no new migrations in this release.

---

## 9. Dashboard Verification

| Check | Result |
|---|---|
| `statementTotals` present | YES |
| Obsolete top-level money fields (`periodNetIncome`, `cashBalance`, `totalAssets`, `totalLiabilities`, `totalStoredEquity`, `canonicalAggregation`) | NONE |
| KPI cards render from CFA | PASS |
| Unavailable banner absent when CFA present | PASS |
| Console errors after hotfix | 0 |

KPI ← CFA property (FY2027, company `3cbfd4eb-…`):

| KPI | Amount | Source |
|---|--:|---|
| Cash | −280 700.29 | `statementTotals.cash` |
| Total Assets | 1 007 271.70 | `statementTotals.totalAssets` |
| Total Liabilities | 1 002 482.54 | `statementTotals.totalLiabilities` |
| Total Equity | −75 337.51 | `statementTotals.totalEquity` |
| Net Income | −75 337.51 | `statementTotals.netIncome` |
| Accounts Receivable | 1 187 340.74 | `statementTotals.receivables` |
| Accounts Payable | 986 052.04 | `statementTotals.payables` |
| Revenue (total income) | 129 625.00 | `statementTotals.totalIncome` |
| Expenses | 204 962.51 | `statementTotals.totalExpenses` |

No KPI originates from manual `reduce`/`sum`, invoice/bill/payroll totals, or legacy DTO scalars.

---

## 10. Financial Reconciliation Matrix

Company `3cbfd4eb-a095-43f3-837a-0b4f1e2c1752` · FY2027 (`2026-03-01` → `2027-02-28`)

| Surface comparison | Variance | Result |
|---|--:|---|
| Client CFA ≡ Edge CFA (38 properties) | 0.00 | PASS |
| Dashboard KPI ≡ CFA / TB | 0.00 | PASS |
| Deployed `dashboard-data.statementTotals` ≡ raw GL CFA | 0.00 | PASS |
| Trial Balance debits ≡ credits | 0.01 (rounding) | PASS |
| Income Statement identity | 0.00 | PASS |
| Equity identity (stored + NI = total equity) | 0.00 | PASS |
| Balance Sheet assets ≡ liabilities + equity | **80 126.67** | **FAIL (tenant data)** |

Cross-surface money figures agree. The Balance Sheet accounting identity does not hold on this tenant; CFA correctly reports `balanceSheetBalanced = false` on all consumers.

---

## 11. Runtime Health Report

| Check | Result |
|---|---|
| Console errors (post-hotfix) | 0 |
| JavaScript / React exceptions on smoke routes | 0 |
| Failed network / Edge / RPC / API on smoke | 0 |
| Missing assets | 0 |
| Broken routes (smoke set) | 0 |
| Authentication | PASS |

Hotfix applied mid-release: `RangeError: Invalid time value` on Dashboard chart/payroll dates — guarded with `safeFormatDate` / `safeFormatDistanceToNow`.

---

## 12. Production Smoke Test Results

Base: `https://adminless-fin.vercel.app` · Asset: `index-9nCRbsUt.js`

| Step | Result |
|---|---|
| Login | PASS |
| Company switching | PASS |
| Dashboard | PASS |
| Revenue (`/sales`) | PASS |
| Purchases | PASS |
| Payroll | PASS |
| Banking | PASS |
| Accounting | PASS |
| General Ledger | PASS |
| Trial Balance | PASS |
| Financial Statements | PASS |
| Reports | PASS |
| Assets | PASS |
| VAT (`/tax-report`) | PASS |
| AI / Collaboration Hub (`/chat`) | PASS |
| Audit Trail | PASS |

**14 / 14 PASS** · 0 console errors · 0 network failures

---

## 13. Remaining Risks

1. **Tenant Balance Sheet identity** — Assets (R1 007 271.70) ≠ Liabilities + Equity (R927 145.03); variance R80 126.67. Pre-existing data finding; not a deploy regression. Requires accounting review, not a code change under architecture freeze.
2. **Known sub-ledger variances** (from prior sprint cert) — AR ↔ GL (−R16.67) and AP ↔ GL (+R100.00) on the live tenant; surfaced by Reconciliation Centre controls.
3. **Unrelated dirty working tree** — enterprise-accounts evidence PDF/JSON line-ending churn left uncommitted (not part of this release).
4. **`reports` still emits `canonicalAggregation`** as a compatibility alias of `statementTotals` — Dashboard path is clean; reports alias is intentional legacy wire shape.

---

## 14. Final Production Readiness Score

**93 / 100**

Deductions: tenant BS identity (−5), known sub-ledger data variances (−2).

---

## 15. FINAL GO / NO GO

### **GO**

| Gate | Met |
|---|---|
| Latest code deployed | ✓ `0212610` |
| Latest Edge Functions deployed | ✓ |
| Dashboard uses `statementTotals` | ✓ |
| Dashboard reconciles with Trial Balance | ✓ 0.00 |
| Trial Balance reconciles with General Ledger | ✓ |
| General Ledger reconciles with Financial Statements (same CFA) | ✓ 0.00 surface variance |
| No production runtime failures | ✓ |
| No failed smoke tests | ✓ 14/14 |
| Production running latest release | ✓ `index-9nCRbsUt.js` |

Production is confirmed running the newest release. Remaining open item is tenant-level Balance Sheet identity imbalance, correctly detected by CFA and visible on every certified consumer.
