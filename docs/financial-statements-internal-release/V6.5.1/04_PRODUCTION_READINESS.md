# 04 — Production Readiness (Navigation)

**Pack:** Financial Statements Navigation Recovery  
**Version:** 6.5.1  
**Scope:** Navigation readiness for Internal Preview — not public GA

---

## Verdict

| Audience | Decision |
|----------|----------|
| Internal Preview (owner / admin / allowlisted testers) | **NAVIGATION READY** |
| Public / all-tenant default ON | **NOT READY** (unchanged from V6.5.0) |

---

## Readiness criteria

| Criterion | Status |
|-----------|--------|
| Sidebar item registered | ✅ |
| Flags correctly evaluated (static Vite) | ✅ |
| Local `.env` Internal Preview ON | ✅ |
| Permission matrix enforced | ✅ |
| Tree position certified | ✅ |
| Workspace route gated & registered | ✅ |
| Kill-switch retained | ✅ |
| Publication / XBRL / AI still hidden | ✅ |
| Operational Accounting & Reports intact | ✅ |

---

## Residual operations

1. Restart Vite after any `.env` change.  
2. For Accountant / Internal Tester (`member`), set `VITE_EFS_ALLOWLIST`.  
3. Staging/production hosts must set the same `VITE_EFS_*` build-time vars — code alone cannot invent sidebar visibility when flags are absent.  
4. Edge secret `EFS_MODULE=true` remains required for backend methods (orthogonal to sidebar).

---

## Board declaration

**NAVIGATION READY**

Financial Statements Internal Preview navigation is recovered, evidenced, and permission-gated. Architecture remains frozen.
