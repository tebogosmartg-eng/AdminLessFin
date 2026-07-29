# 02 — Permission Matrix

**Pack:** Financial Statements Internal Preview  
**Version:** 6.5.0  
**Enforcement:** `isFinancialStatementsInternalPersona` · `canAccessFinancialStatementsWorkspace` · `shouldShowFinancialStatementsNav` · `FinancialStatementsGate`

---

## 1. Persona → platform role bridge

The product RBAC remains `owner` | `admin` | `member`. Internal Preview personas map as follows:

| Persona (Release Board) | Platform mapping | Sidebar | Workspace routes |
|-------------------------|------------------|---------|------------------|
| System Administrator | `owner` | Yes* | Yes* |
| Finance Manager | `admin` | Yes* | Yes* |
| Accountant | `member` + `VITE_EFS_ALLOWLIST` | Yes* | Yes* |
| Internal Tester | any role + `VITE_EFS_ALLOWLIST` | Yes* | Yes* |
| All other users | — | No | No (redirect `/`) |

\*Requires Internal Preview flags: module and/or workspace UI, and nav flag for sidebar.

---

## 2. Capability matrix (Internal Preview)

| Capability | SysAdmin | Finance Mgr | Accountant | Internal Tester | Other |
|------------|----------|-------------|------------|-----------------|-------|
| Reporting Workspaces | R/W | R/W | R/W† | R/W† | — |
| Reporting Periods | R/W | R/W | R/W† | R/W† | — |
| Reporting Snapshots | R/W | R/W | R/W† | R/W† | — |
| Statement Dashboard | R | R | R† | R† | — |
| Working Papers | R/W | R/W | R/W† | R/W† | — |
| Lead Schedules | R/W | R/W | R/W† | R/W† | — |
| Disclosures | R/W | R/W | R/W† | R/W† | — |
| Validation | R/W | R/W | R/W† | R/W† | — |
| Review Workflow | R/W | R/W | R/W† | R/W† | — |
| Publication | Hidden | Hidden | Hidden | Hidden | — |
| XBRL | Hidden | Hidden | Hidden | Hidden | — |
| AI Assistance | Hidden | Hidden | Hidden | Hidden | — |

†Subject to allowlist when role is `member`.

---

## 3. Feature flags (remain available)

| Flag | Default | Purpose |
|------|---------|---------|
| `VITE_EFS_MODULE` | false | Master statutory module |
| `VITE_EFS_WORKSPACE_UI` | false | Route / UI mount |
| `VITE_EFS_NAV_SIDEBAR` | false | Sidebar group kill-switch |
| `VITE_EFS_SNAPSHOT_PIPELINE` | true* | Extract / certify / freeze |
| `VITE_EFS_WORKING_PAPERS` | true* | WP / Lead panel |
| `VITE_EFS_DISCLOSURES` | true* | Disclosure panel |
| `VITE_EFS_VALIDATION` | true* | Validation panel |
| `VITE_EFS_REVIEW_WORKFLOW` | true* | Review panel |
| `VITE_EFS_ALLOWLIST` | empty | Accountant / Tester bridge |
| `VITE_EFS_PUBLICATION` | reserved | Forced OFF in code |
| `VITE_EFS_XBRL` | reserved | Forced OFF in code |
| `VITE_EFS_AI_ASSISTANCE` | reserved | Forced OFF in code |

\*Effective only when module or workspace UI is on.

---

## 4. Enforcement points

| Layer | Mechanism |
|-------|-----------|
| Sidebar | `shouldShowFinancialStatementsNav({ role, email, userId })` |
| Router | `FinancialStatementsGate` → `canAccessFinancialStatementsWorkspace` |
| Edge | `EFS_MODULE` secret + existing EFS RLS / company scoping |
| Deferred UI | `efsDeferredCapabilities.publication|xbrl|aiAssistance()` always false |

---

## 5. Review-workflow roles (unchanged)

Manager / Partner / Preparer / Observer assignments inside an engagement are review-pack roles (V6.4.6). They do **not** replace company RBAC for sidebar visibility.
