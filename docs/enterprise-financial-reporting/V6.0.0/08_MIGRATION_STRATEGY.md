# 08 — Migration Strategy

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Define the controlled migration path from today’s operational Financial Statements capability to a permanent dual-track model:

1. **Operational Financial Reporting** — preserves the existing Financial Statements / Reports feature set  
2. **Enterprise Financial Reporting (EFRE)** — new statutory/standards financial statement preparation pillar  

This strategy is **definitional**. It binds future Implementation Approvals. It does not delete, deprecate, or redesign the existing feature in this pack.

---

## 2. Final Principle

> **Accounting owns financial facts.**  
> **Operational Reports own operational presentation.**  
> **Enterprise Financial Reporting owns statutory financial reporting.**  
> **No duplication of balances or calculations is permitted.**

---

## 3. Preservation Rules (non-negotiable)

| Rule | Mandate |
|------|---------|
| Existing Financial Statements module | **NOT deleted** |
| Existing Financial Statements module | **NOT deprecated** |
| Existing Financial Statements module | **NOT removed** |
| Existing reporting engine redesign | **FORBIDDEN** under migration |
| Existing integrations | **MUST remain backwards compatible** |
| Accounting calculation duplication | **FORBIDDEN** in Operational Reports and EFRE |
| Progressive elevation | Existing FS becomes Operational Financial Reporting consumer **where practical** |

---

## 4. Transition Model

### 4.1 Current (preserved)

```
Accounting
    ↓
Reports
    ↓
Financial Statements
```

### 4.2 Future (dual track — both survive)

```
Accounting
    ↓
Operational Reports
    ↓
Financial Reports
  • Live Income Statement
  • Live Balance Sheet
  • Live Cash Flow
  • Live Trial Balance
  • Live Ratio Analysis

AND

Accounting
    ↓
Enterprise Financial Reporting (EFRE)
    ↓
Statement Preparation
    ↓
Disclosure Management
    ↓
Notes
    ↓
Comparatives
    ↓
Validation
    ↓
Review Workflow
    ↓
Publication
```

Both tracks consume **Accounting as the single source of financial balances**.

---

## 5. Authority Split

### 5.1 Operational Financial Reporting (authoritative owner of)

| Capability | Mode |
|------------|------|
| Live Income Statement | Live Accounting balances / period activity |
| Live Balance Sheet | Live Accounting balances |
| Live Cash Flow | Live Accounting cash-flow facts |
| Live Trial Balance | Live Accounting balances |
| Live Ratio Analysis | Derived from live operational statements |
| Comparative operational views (existing) | Live / period RPC-backed management views |

**Surfaces (illustrative, not redesigned here):** existing Reports / Financial Statements / Comparative UI and `reports` edge methods.

### 5.2 Enterprise Financial Reporting — EFRE (authoritative owner of)

| Capability | Mode |
|------------|------|
| Statement preparation | Framework Pack–based assembly from sealed facts |
| Disclosure management | Framework disclosure checklists & instances |
| Notes | Note templates & assemblies |
| Accounting policies (presentation) | Tenant presentation/classification/disclosure elections |
| Comparative figures (statutory) | Prior-period / restated columns from seals |
| Validation | Articulation & completeness vs framework |
| Review workflow | Prepare → Review → Approve |
| Version control | Pack editions, supersession, restatement |
| Publication | Immutable published packs (+ XBRL readiness) |

---

## 6. What Each Track Consumes from Accounting

| Consumer | Accounting input | May recalculate GL? |
|----------|------------------|---------------------|
| Operational Financial Reporting | Live balance / activity / cash-flow RPCs (and related ledger reads) | **No** |
| EFRE | FactSnapshotSeal of Accounting balances/activity for the period | **No** |

Operational track may read **live** facts for management.  
EFRE **must seal** facts before statutory publication.  
Neither invents balances.

---

## 7. Naming & Positioning (product language)

| Today’s label | Certified future label | Status |
|---------------|------------------------|--------|
| Financial Statements (under Reports) | **Operational Financial Reporting** / Operational Financial Reports | Retained capability |
| — | **Enterprise Financial Reporting** (EFRE) | New pillar |
| “Financial Statements” meaning IFRS pack | Refers to **EFRE published packs** only | After Implementation Approval |

Labelling changes (menus, help text) under Implementation Approval must clarify operational vs statutory without removing routes or APIs relied on by users.

---

## 8. Backwards Compatibility Contract

| Concern | Contract |
|---------|----------|
| Existing routes / pages | Remain available (may gain operational labelling) |
| Existing edge `reports` methods used by FS | Remain functional |
| Existing exports / bookmarks / integrations | Must not break |
| Chart of Accounts / journals / TB consumers | Untouched ownership |
| V3.6 payroll/VIP reports | Untouched |
| EFRE introduction | Additive — new services/events (`fre.*`), not a replacement cut of Operational Reports |

---

## 9. Controlled Migration Path (phases)

Phases below are **architecture gates** for Implementation Approval. This pack does not execute them.

### Phase A — Clarify (no behaviour break)

- Position existing Financial Statements as Operational Financial Reporting in architecture and (later) product copy  
- Document that statutory packs are EFRE-owned  
- Keep all live reports working  

### Phase B — Introduce EFRE (additive)

- Implement Framework Management, Mapping, seal contract, Statement/Disclosure/Notes, Validation, Review, Publication per V6.0.0  
- Do **not** remove Operational Reports  
- Do **not** redesign the operational reporting engine  

### Phase C — Consumer alignment (where practical)

- Refactor Operational Financial Reporting to bind clearly as an **Accounting consumer** (shared fact adapters / labelling / registry hooks) **without** changing calculation ownership  
- Optionally register operational live report definitions through V3.6 registry **without** transferring EFRE semantics to V3.6  

### Phase D — Elevate statutory use cases

- Progressive elevation: customers needing IFRS/GRAP/IPSAS/MCS use EFRE publication  
- Operational live statements remain the daily management path  
- No forced deletion of Operational Financial Reporting  

### Explicit non-phase

- **Deprecation / removal of Operational Financial Reporting** — out of scope and prohibited by this strategy  

---

## 10. Anti-Patterns (forbidden)

| Anti-pattern | Why forbidden |
|--------------|---------------|
| Delete Financial Statements module “because EFRE exists” | Violates preservation rules |
| Replace live TB/IS/BS with sealed EFRE-only path | Breaks operational daily use |
| Embed Framework Pack layouts inside Operational Reports | Blurs statutory vs operational |
| Recalculate balances in either track | Violates Accounting SoT |
| Redesign operational reporting engine as EFRE | Out of scope; wrong owner |
| Claim Operational reports are IFRS-certified packs | False authority |

---

## 11. Relationship to Other Pack Artefacts

| Artefact | Role |
|----------|------|
| [01 Architecture](./01_ENTERPRISE_FINANCIAL_REPORTING_ARCHITECTURE.md) | EFRE domain ownership |
| [03 Boundaries](./03_REPORTING_BOUNDARIES.md) | Hard owns/must-not with Operational track |
| [04 Consumer Matrix](./04_CONSUMER_MATRIX.md) | Operational row as Accounting consumer |
| [06 Integration](./06_INTEGRATION_ARCHITECTURE.md) | Dual-track technical contracts |
| [07 Readiness](./07_ENTERPRISE_READINESS_ASSESSMENT.md) | Certification including this strategy |

---

## 12. Implementation Gate Addendum

Any Implementation Approval citing EFRE V6.0.0 **must** also cite this Migration Strategy and demonstrate:

1. Operational Financial Reporting remains available and backwards compatible  
2. EFRE is additive for statutory preparation  
3. Both tracks consume Accounting facts without duplicated calculations  
4. No deletion or deprecation of existing Financial Statements  

---

## 13. Certification

Migration Strategy is **CERTIFIED**.

# Accounting owns facts · Operational Reports own live presentation · EFRE owns statutory reporting
