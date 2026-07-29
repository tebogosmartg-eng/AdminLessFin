# 05 — Regression Strategy

**Board:** Independent Principal Enterprise Implementation Board  
**Version:** 6.3.0  
**Verdict:** APPROVED  

---

## 1. Purpose

Guarantee existing users experience **no regression** and quality gates pass every phase.

---

## 2. Regression Suites

### Suite A — Accounting authority (always)

| Case | Pass criteria |
|------|----------------|
| Journal create/post/list | Works |
| CoA balances load | Live RPC |
| Reconcile flows | Unchanged |
| Live TB / IS / BS / CF / Ratios refresh | Real-time; amounts match Accounting |

### Suite B — Routes (always)

| Case | Pass criteria |
|------|----------------|
| `/financial-statements` | 200 / app render |
| `/reports` | 200 |
| `/comparative-pl`, `/comparative-bs`, `/general-ledger` | 200 |
| Dashboard / Command Menu links | Resolve |

### Suite C — Reports enterprise (always)

| Case | Pass criteria |
|------|----------------|
| Operational analytics (inventory, project, tax, budgets as present) | Work |
| Payroll / Compliance reports | Untouched behaviour |
| No second live IS under Reports nav | Single Accounting Reports home |

### Suite D — Assets & Loans (always)

| Case | Pass criteria |
|------|----------------|
| Fixed assets / loans CRUD | Unchanged |
| Depreciation/loan posts still hit Accounting | |

### Suite E — Financial Statements flagged (Phase 2+)

| Case | Pass criteria |
|------|----------------|
| Flag OFF | No sidebar; no access (or allowlist-only) |
| Flag ON allowlist | Workspace loads |
| Snapshot path | Never publishes from live GL |
| WP/Lead | Link snapshot when locked |

### Suite F — Duplication / calc (always)

| Case | Pass criteria |
|------|----------------|
| No parallel balance engine in FS | Trace to Accounting or Snapshot |
| No duplicate report IDs for same live statement | |

---

## 3. Gate Policy

| Rule | Enforcement |
|------|-------------|
| Suite A+B+C+D green | Required to exit **every** phase |
| Suite E | Required to exit Phase 2+ |
| Suite F | Required to exit every phase |
| Sev-1/2 open on A–D | **Block** release |

---

## 4. Automation Targets

| Layer | Examples |
|-------|----------|
| Unit | Flag evaluation; redirect map; snapshot seal input validation |
| Integration | Edge reports + Accounting RPCs for live page |
| E2E smoke | Playwright/Cypress: open live FS, open reports, open assets |
| Manual | Controller walkthrough Phase 3–4 |

---

## 5. Certification

Regression Strategy is **APPROVED**.
