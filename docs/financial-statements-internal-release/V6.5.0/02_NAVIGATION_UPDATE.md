# 02 — Navigation Update

**Pack:** Financial Statements Internal Preview  
**Version:** 6.5.0  
**File:** `src/components/SidebarNav.tsx`  
**Verdict:** CERTIFIED  

---

## 1. Approved addition

Top-level order (finance-relevant excerpt):

```
…
Work Management
Accounting
Financial Statements      ← NEW (flag + persona gated)
  ├── Reporting Workspaces
  ├── Reporting Periods
  ├── Reporting Snapshots
  ├── Statement Dashboard
  ├── Working Papers
  ├── Lead Schedules
  ├── Disclosures
  ├── Validation
  └── Review Workflow
Assets & Loans
Reports
  └── … includes operational “Financial Statements” (unchanged)
…
```

**Location constraint satisfied:** immediately below Accounting, immediately above Assets & Loans.

---

## 2. Dual-track naming (intentional)

| Nav path | Route | Nature |
|----------|-------|--------|
| **Financial Statements** (top-level, V6.5.0) | `/financial-statements-workspace` | Statutory engagement workspace |
| Reports → Financial Statements | `/financial-statements` | Live operational TB/IS/BS/CF |

Operational Reports entry is **unchanged** (quality gate).

---

## 3. Hidden from sidebar

Publication · XBRL · AI Assistance — no child links; Publication Status widget not rendered.

---

## 4. Flag contract

| Flag | Effect |
|------|--------|
| `VITE_EFS_NAV_SIDEBAR=false` | Group absent (default) |
| `VITE_EFS_NAV_SIDEBAR=true` + module/workspace ON + persona | Group visible |
| Module / workspace OFF | Group absent even if nav flag mishap |

Implementation: `shouldShowFinancialStatementsNav()` in `src/lib/financialStatements/flags.ts`.
