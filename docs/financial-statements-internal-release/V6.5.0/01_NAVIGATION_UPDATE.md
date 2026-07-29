# 01 — Navigation Update

**Pack:** Financial Statements Internal Preview  
**Version:** 6.5.0  
**File:** `src/components/SidebarNav.tsx`  
**Gate:** `shouldShowFinancialStatementsNav()` in `src/lib/financialStatements/flags.ts`

---

## 1. Approved change

Insert top-level group **Financial Statements** immediately **below Accounting** and **above Assets & Loans**.

```
…
Accounting
Financial Statements          ← NEW (Internal Preview, flag + persona gated)
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
  └── Financial Statements    ← operational live path — UNCHANGED
…
```

---

## 2. Visibility rules

| Condition | Sidebar group |
|-----------|---------------|
| `VITE_EFS_NAV_SIDEBAR` ≠ true | Hidden |
| Module / Workspace UI flags off | Hidden |
| Role `owner` or `admin` | Visible (when flags on) |
| Role `member` + allowlist match | Visible |
| All other users | Hidden |

Publication, XBRL, and AI Assistance are **not** listed.

---

## 3. Explicit non-changes (quality gates)

| Gate | Result |
|------|--------|
| Existing Accounting nav tree | Unchanged |
| Existing Reports nav tree (incl. operational Financial Statements) | Unchanged |
| Existing Payroll / Assets / Sales / Purchases / Work Management | Unchanged |
| Only approved sidebar addition | ✅ |

---

## 4. Routes

| Nav label | Destination |
|-----------|-------------|
| All Internal Preview children | `/financial-statements-workspace` (+ optional `?surface=` hint) |
| Engagement dashboard | `/financial-statements-workspace/:workspaceId` |

Operational `/financial-statements` remains under Reports only.

---

## 5. Rollback

Set `VITE_EFS_NAV_SIDEBAR=false` → group disappears; no other navigation regresses.
