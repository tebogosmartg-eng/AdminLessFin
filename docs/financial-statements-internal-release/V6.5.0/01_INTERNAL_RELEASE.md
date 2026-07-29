# 01 — Internal Release

**Pack:** Financial Statements Internal Preview  
**Version:** 6.5.0  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** INTERNAL RELEASE APPROVED  

---

## 1. Decision

Release the Financial Statements statutory module to **internal users only**.

This is **not** a public production release.

---

## 2. Completed platforms (frozen architecture)

| Platform | Pack |
|----------|------|
| Foundation | V6.4.0 |
| Statement Engine | V6.4.1 |
| Statement Structure | V6.4.2 |
| Working Paper Platform | V6.4.3–C2 |
| Disclosure Platform | V6.4.4–C3 |
| Validation Platform | V6.4.5–D1 |
| Review Workflow | V6.4.6–D2 |

---

## 3. What changes in V6.5.0

| Change | Detail |
|--------|--------|
| Sidebar | New top-level **Financial Statements** group (below Accounting, above Assets & Loans) |
| Nav unlock | `shouldShowFinancialStatementsNav()` honours `VITE_EFS_NAV_SIDEBAR` + persona gate |
| Access | Owners / admins always (when flags ON); members via allowlist |
| UI | Publication Status widget forced hidden; Publication / XBRL / AI deferred helpers return false |
| Labels | Workspace marked **Internal Preview** |

## 4. What does not change

- `/financial-statements` operational live statements under **Reports**  
- Accounting CoA / journals / reconcile paths  
- Reports group contents and order (except no removal of operational FS link)  
- Snapshot-only statutory calculation path  
- Database schema / edge method surface (no redesign)

---

## 5. Audience

Controlled internal: System Administrators, Finance Managers, Accountants, Internal Testers — see Permission Matrix.
