# 02 — Fixes Applied

**Pack:** Financial Statements Navigation Recovery  
**Version:** 6.5.1  
**Architecture:** Frozen — no redesign

---

## Fix 1 — Static Vite env evaluation

**File:** `src/lib/financialStatements/flags.ts`

- Replaced dynamic `import.meta.env[key]` with static `import.meta.env.VITE_EFS_*` reads.
- Added `diagnoseFinancialStatementsNavGates()` for future evidence / console diagnosis.

## Fix 2 — Enable Internal Preview flags in local `.env`

Set (verified post-write):

```
VITE_EFS_MODULE=true
VITE_EFS_WORKSPACE_UI=true
VITE_EFS_NAV_SIDEBAR=true
VITE_EFS_SNAPSHOT_PIPELINE=true
VITE_EFS_WORKING_PAPERS=true
VITE_EFS_DISCLOSURES=true
VITE_EFS_VALIDATION=true
VITE_EFS_REVIEW_WORKFLOW=true
```

Allowlist remains optional for `owner`/`admin`. Members (Accountant / Internal Tester) still require `VITE_EFS_ALLOWLIST`.

## Fix 3 — `.env.example` recipe

Documented the Internal Preview ON pattern and kill-switch for new environments.

## Fix 4 — Evidence generator

**File:** `scripts/efs-nav-recovery-evidence.mjs`  
**Output:** `docs/financial-statements-internal-release/V6.5.1/evidence/navigation-recovery-evidence.json`

---

## Post-fix gate results (simulated with local `.env`)

| Persona | Mapping | Nav visible |
|---------|---------|-------------|
| System Administrator | `owner` | ✅ true |
| Finance Manager | `admin` | ✅ true |
| Accountant (member, no allowlist) | `member` | ❌ false (by design) |
| Accountant / Internal Tester (allowlisted) | `member` + allowlist | ✅ when allowlist configured |
| Other / guest | — | ❌ false |

Tree order: Accounting → Financial Statements → Assets & Loans ✅

---

## Required operator action

Restart the Vite dev server (`npm run dev` / equivalent) so env reinjects. Soft refresh alone may keep stale `import.meta.env` values.
