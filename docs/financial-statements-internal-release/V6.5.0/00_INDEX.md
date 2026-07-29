# Financial Statements — Internal Preview Release V6.5.0

**Board:** Independent Principal Enterprise Release Board  
**Version:** 6.5.0  
**Date:** 2026-07-13  
**Release class:** Internal Preview (NOT public production)  
**Status:** **INTERNAL RELEASE APPROVED**

---

## Verdict

The Financial Statements module is **approved for controlled internal use**. Publication, XBRL, and AI Assistance remain under implementation and are hidden.

---

## Deliverables

| # | Artefact | Path |
|---|----------|------|
| 1 | Internal Release (this index) | `00_INDEX.md` |
| 2 | Navigation Update | `01_NAVIGATION_UPDATE.md` |
| 3 | Permission Matrix | `02_PERMISSION_MATRIX.md` |
| 4 | Regression Report | `03_REGRESSION_REPORT.md` |
| 5 | Production Readiness Assessment | `04_PRODUCTION_READINESS_ASSESSMENT.md` |
| — | Evidence pack | `evidence/internal-preview-release-evidence.json` |

---

## Release train

| Gate | Prerequisite | Result |
|------|--------------|--------|
| Foundation | V6.4.0 | ✅ certified |
| Statement Engine | V6.4.1 | ✅ certified |
| Statement Structure | V6.4.2 | ✅ certified |
| Working Paper Platform | V6.4.3–C2 | ✅ certified |
| Disclosure Platform | V6.4.4–C3 | ✅ certified |
| Validation Platform | V6.4.5–D1 | ✅ certified |
| Review Workflow | V6.4.6–D2 | ✅ certified |
| Architecture freeze | Board mandate | ✅ frozen |
| Internal Preview nav unlock | This pack | ✅ approved |

---

## Exposed surfaces

| Surface | Status |
|---------|--------|
| Reporting Workspaces | Exposed |
| Reporting Periods | Exposed |
| Reporting Snapshots | Exposed |
| Statement Dashboard | Exposed |
| Working Papers | Exposed |
| Lead Schedules | Exposed |
| Disclosures | Exposed |
| Validation | Exposed |
| Review Workflow | Exposed |
| Publication | **Hidden** — under implementation |
| XBRL | **Hidden** — under implementation |
| AI Assistance | **Hidden** — under implementation |

---

## Enablement (operators)

```
VITE_EFS_MODULE=true
VITE_EFS_WORKSPACE_UI=true
VITE_EFS_NAV_SIDEBAR=true
VITE_EFS_ALLOWLIST=<accountant and tester emails>
EFS_MODULE=true   # edge secret
```

Kill-switch: set `VITE_EFS_NAV_SIDEBAR=false` (or module/workspace UI off). Feature flags remain available.

---

## Dual-track reminder

| Path | Purpose | Change in V6.5.0 |
|------|---------|------------------|
| Reports → Financial Statements (`/financial-statements`) | Live operational TB/IS/BS/CF | **Unchanged** |
| Financial Statements (sidebar) → `/financial-statements-workspace` | Statutory engagement workspace | **Added** (flagged) |

---

## Final status

# INTERNAL RELEASE APPROVED

The Financial Statements module is approved for controlled internal use while Publication, XBRL, and AI remain under implementation.
