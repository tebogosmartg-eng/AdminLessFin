# 01 — Root Cause

**Pack:** Financial Statements Navigation Recovery  
**Version:** 6.5.1  
**Method:** Direct evidence — no speculation

---

## Primary root cause (confirmed)

**Internal Preview feature flags were unset in `.env`.**

Evidence (pre-fix inspection):

| Key | Observed |
|-----|----------|
| `VITE_EFS_MODULE` | `(unset)` |
| `VITE_EFS_WORKSPACE_UI` | `(unset)` |
| `VITE_EFS_NAV_SIDEBAR` | `(unset)` |
| `VITE_EFS_ALLOWLIST` | `(unset)` |

`shouldShowFinancialStatementsNav()` requires:

1. `efsFlags.navSidebar()` === true  
2. `efsFlags.module()` **or** `efsFlags.workspaceUi()` === true  
3. Approved persona (`owner` / `admin` / allowlisted member)

With all three flags unset, step 1 and 2 fail → **sidebar group never renders**.

This is not a missing NavGroup. `SidebarNav.tsx` correctly registers Financial Statements between Accounting and Assets & Loans behind `showFinancialStatementsNav`.

---

## Secondary root cause (latent defect)

**Dynamic Vite env access could not evaluate flags even after `.env` was set.**

Pre-fix code:

```ts
function envFlag(key: string, fallback = false): boolean {
  const raw = import.meta.env[key]; // dynamic key — Vite does not statically replace
  ...
}
```

Vite only reliably injects **static** property access (`import.meta.env.VITE_EFS_NAV_SIDEBAR`). Dynamic `import.meta.env[key]` resolves to `undefined` → always falls back to `false`.

Even if operators set `.env` correctly, navigation could remain hidden without a code fix.

---

## Ruled out (with evidence)

| Hypothesis | Evidence | Verdict |
|------------|----------|---------|
| Nav item not registered | `title="Financial Statements"` present; conditional render present | Ruled out |
| Wrong tree position | `accountingIndex < financialStatementsIndex < assetsAndLoansIndex` | Ruled out |
| Route missing | `/financial-statements-workspace` + Gate in `router.tsx` | Ruled out |
| Owner/Admin permission bug | Persona bridge returns true for `owner`/`admin` when flags ON | Ruled out as primary |
| Accounting/Reports regression blocking FS | Reports operational FS link still present; Accounting trees untouched | Ruled out |

---

## Causal chain

```
V6.5.0 approved Internal Preview (code + docs)
        ↓
.env never received VITE_EFS_* = true
        ↓
navSidebar()/module()/workspaceUi() → false
        ↓
shouldShowFinancialStatementsNav() → false
        ↓
{showFinancialStatementsNav && (...)} skipped
        ↓
Sidebar shows no Financial Statements group
```

Plus latent: dynamic `import.meta.env[key]` would have kept nav hidden after partial .env enablement.
