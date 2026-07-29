# 04 — User Journey Validation

**Version:** 6.2.1  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Validate that user intents map to **one home** under the refined navigation standard.

---

## 2. Journey Validation

### VJ1 — “Show me today’s P&L / TB / BS”

| Check | Result |
|-------|--------|
| Entry | Accounting → Accounting Reports |
| Not required | Reports; Financial Statements Workspace |
| Duplicate FS? | **No** |
| Status | **PASS** |

### VJ2 — “Post a journal and see impact”

| Check | Result |
|-------|--------|
| Entry | Accounting → Journals → Accounting Reports |
| Same nav group | **Yes** — simplicity PASS |
| Status | **PASS** |

### VJ3 — “Prepare IFRS / GRAP year-end pack”

| Check | Result |
|-------|--------|
| Entry | Financial Statements Workspace → Close → Statements → Publication |
| Uses live Accounting Reports as statutory pack? | **No** |
| Status | **PASS** |

### VJ4 — “Cross-domain / board KPI pack”

| Check | Result |
|-------|--------|
| Entry | Reports → Executive Reporting |
| Hosts live TB? | **No** |
| Status | **PASS** |

### VJ5 — “Project profitability / inventory valuation”

| Check | Result |
|-------|--------|
| Entry | Reports → Operational Reporting |
| Confusion with live IS? | Separated — **PASS** |
| Status | **PASS** |

### VJ6 — “Manage a fixed asset”

| Check | Result |
|-------|--------|
| Entry | Assets & Loans |
| Independent? | **Yes** |
| Status | **PASS** |

---

## 3. Intent Router (validated)

| Intent | One home |
|--------|----------|
| Live statements & TB | Accounting Reports |
| Books & recognition | Accounting |
| Statutory preparation | Financial Statements |
| Enterprise-wide reports | Reports |
| Assets/loans | Assets & Loans |
| Governance | Enterprise Governance |

---

## 4. Certification

User Journey Validation is **CERTIFIED** — all journeys PASS without duplicate presentation.
