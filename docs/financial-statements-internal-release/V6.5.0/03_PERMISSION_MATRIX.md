# 03 — Permission Matrix

**Pack:** Financial Statements Internal Preview  
**Version:** 6.5.0  
**Verdict:** CERTIFIED  

---

## 1. Persona → platform role bridge

Company RBAC remains `owner` | `admin` | `member`. Release personas map as follows:

| Release persona | Platform role | Allowlist required? | Sidebar + route |
|-----------------|---------------|---------------------|-----------------|
| System Administrator | `owner` | No | ✓ when flags ON |
| Finance Manager | `admin` | No | ✓ when flags ON |
| Accountant | `member` | **Yes** (`VITE_EFS_ALLOWLIST`) | ✓ when flags ON + listed |
| Internal Tester | any + list | **Yes** | ✓ when flags ON + listed |
| All other users | — | — | **Hidden** |

Implementation: `isFinancialStatementsInternalPersona()` / `canAccessFinancialStatementsWorkspace()` / `shouldShowFinancialStatementsNav()`.

---

## 2. Feature surfaces

| Surface | SysAdmin | Finance Mgr | Accountant* | Tester* |
|---------|----------|-------------|-------------|---------|
| Reporting Workspaces | R/W | R/W | R/W | R/W |
| Reporting Periods | R/W | R/W | R/W | R/W |
| Reporting Snapshots | R/W | R/W | R/W | R/W |
| Statement Dashboard | R/W | R/W | R/W | R/W |
| Working Papers | R/W | R/W | R/W | R/W |
| Lead Schedules | R/W | R/W | R/W | R/W |
| Disclosures | R/W | R/W | R/W | R/W |
| Validation | R/W | R/W | R/W | R/W |
| Review Workflow | R/W | R/W | R/W | R/W |
| Publication | — | — | — | — |
| XBRL | — | — | — | — |
| AI Assistance | — | — | — | — |

\* Require allowlist entry when company role is `member`.

Review stage assignments (manager / partner / preparer / observer) remain **engagement-level** review roles (V6.4.6), not company RBAC replacements.

---

## 3. Enforcement layers

1. **Feature flags** — module / workspace / nav  
2. **Persona gate** — frontend Gate + Sidebar  
3. **Edge `EFS_MODULE` + RLS** — company-scoped data  

Direct URL access without flags/persona redirects to `/`.
