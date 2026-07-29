# 04 — Migration Plan

**Board:** Independent Principal Enterprise Implementation Board  
**Version:** 6.3.0  
**Verdict:** APPROVED  

---

## 1. Objectives

1. Relocate **navigation ownership** of live TB/IS/BS/CF/Ratios/GL to Accounting Reports.  
2. Introduce Financial Statements module for statutory path without removing live capability.  
3. Preserve all existing routes via compatibility.  
4. Zero calculation ownership changes.

---

## 2. Route Migration

| Current path | Disposition | Target nav |
|--------------|-------------|------------|
| `/financial-statements` | **Keep** (compat); live behaviour | Accounting → Accounting Reports |
| `/reports` | **Keep**; analytics hub | Reports → Operational Reports |
| `/comparative-pl` | **Keep** | Accounting Reports (operational comparative) |
| `/comparative-bs` | **Keep** | Accounting Reports |
| `/general-ledger` | **Keep** | Accounting Reports |
| `/financial-close` (new) | **Add** flag-gated | Financial Statements (Phase 2+) |
| New workspace child routes | **Add** flag-gated | Financial Statements |

**Redirects:** If any legacy deep links pointed at Reports as “home of live FS,” retain URL; change only sidebar group. Optional soft banner: “Live statements live under Accounting.”

---

## 3. Data / Calculation Migration

| Item | Action |
|------|--------|
| Balance RPC usage | **Unchanged** for live path |
| Snapshot store | **New** (Phase 3) — additive |
| Journal engine | **Unchanged** |
| Report generators (payroll etc.) | **Unchanged** under Reports |

**No data migration of historical journals required for Phase 1.**

---

## 4. User Migration

| Audience | Change | Training |
|----------|--------|----------|
| Accountants | Find live FS under Accounting | Short notice |
| Managers using Operational Reports analytics | Unchanged paths for analytics | None |
| Controllers (statutory) | New Financial Statements (Phase 4) | At expose |

---

## 5. Rollback per Phase

| Phase | Rollback |
|-------|----------|
| 1 | Revert nav group assignment; keep routes |
| 2–3 | Flags OFF — module invisible |
| 4 | Nav flag OFF; optional full flag OFF |

---

## 6. Compatibility Contract

- Existing users: no forced statutory Close  
- Bookmarks: no 404 on protected routes  
- Accounting remains sole balance authority  
- Reports remain enterprise reporting authority  

---

## 7. Certification

Migration Plan is **APPROVED**.
