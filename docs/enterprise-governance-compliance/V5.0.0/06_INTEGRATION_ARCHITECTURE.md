# 06 — Integration Architecture

**Pillar:** Enterprise Governance & Compliance Platform (EGCP)  
**Version:** 5.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Governance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Integration Philosophy

EGCP integrates as a **shared enterprise service pillar**, not as a sidecar inside Payroll or Accounting.

```
Consumer Module
    │
    ├─ synchronous resolve/evaluate ──► EGCP Services
    │                                      │
    ├─ attach evidence ───────────────────► Evidence Repository
    │                                      │
    └─ subscribe ◄──────── gov.* events ───┘
                           (V4.3.0 BOE)
```

Principles:

1. **Pull for decisions** (resolve/evaluate at decision points).  
2. **Push for awareness** (`gov.*` events).  
3. **Never dual-write rules** into consumers.  
4. **Adapters preserve freezes** (Payroll calculation remains locked).  
5. **Edge Platform V4.2.1** hosts future EGCP runtime uniformly.

---

## 2. Service Contracts (logical)

| Service | Operation | Input | Output |
|---------|-----------|-------|--------|
| Legislation Resolver | `resolveLegislation` | company, country, domains[], effective_date | versioned snapshot + provenance |
| Policy Resolver | `resolvePolicies` | company, process_key, effective_date | policy versions |
| DoA Evaluator | `evaluateAuthority` | Governance Context | decision + required approvers |
| Compliance Evaluator | `evaluateCompliance` | Governance Context | decision + rule hits |
| Calendar Query | `getDeadlines` | company, window | calendar entries |
| Obligation Query | `listObligations` | company, filters | obligation instances |
| Evidence Register | `registerEvidence` | links, hash meta | evidence_id |
| Exception Request | `requestException` | type, reason, context | exception_id |

Physical APIs (REST/RPC/Edge) are **out of scope** for this pack.

---

## 3. Integration Patterns by Consumer

### 3.1 Payroll (frozen calc)

```
Pay Date
  → EGCP resolveLegislation(ZA, [paye,uif,sdl,…], payDate)
  → Adapter: legislationToStatutoryRuleSet
  → Payroll Engine (frozen formulas)
  → On finalise: evaluateAuthority + registerEvidence + bind Obligation
```

| Integration | Direction | Notes |
|-------------|-----------|-------|
| Legislation | Inbound resolve | Replaces module-local SoT for constants |
| DoA | Inbound evaluate | Finalise / payment |
| Calendar / Obligations | Bi-directional status | Filing windows |
| Evidence | Outbound register | Payslip/run seals where required |
| Events | Subscribe `gov.legislation.*`, `gov.calendar.*` | Refresh caches only — never fork content |

### 3.2 Accounting

```
Journal / Payment intent
  → resolvePolicies + evaluateAuthority
  → allow / require_approval / deny
  → on post: registerEvidence
```

Tax period close binds Calendar + Obligations; VAT rate references resolve from Legislation (country pack).

### 3.3 Procurement

```
PR / PO / Contract
  → resolvePolicies (thresholds, vendor rules)
  → evaluateAuthority (amount/currency/conditions)
  → optional evaluateCompliance (sanctions/tax clearance obligations)
  → evidence of quotes & approvals
```

### 3.4 HR

```
Offer / Grade / Termination / Policy acknowledgement
  → labour legislation references (read)
  → internal HR policies
  → DoA evaluation
  → policy.acknowledged evidence
```

HR remains SoT for employee identity (Phase 2/3 standards preserved).

### 3.5 Enterprise Work Management

```
Budget change / allocation / time lock
  → DoA + Policy
Operational risk identified
  → optional map → EGCP Risk Library
Compliance milestone
  → read Calendar / Obligations (no local statutory calendar)
```

EWM continues to emit `work.*` only for operational facts.

### 3.6 Statutory Returns

```
Return preparation
  → Obligation instance + Calendar window
  → DoA for submit
  → Evidence seal of submission artefact
  → obligation.satisfied
```

Return generators remain in statutory returns domain; EGCP owns the obligation lifecycle.

### 3.7 Document Management

- Stores binaries.  
- EGCP Evidence Repository stores custody metadata and seals.  
- Deletion/retention must consult Evidence retention class.

### 3.8 Reporting / KPI

- Governance Reporting registers an additive report domain.  
- Compliance Intelligence may publish additive KPIs under V4.1.5 catalogue rules (no redefinition of frozen KPIs).

---

## 4. Event Integration (BOE)

| Concern | Rule |
|---------|------|
| Namespace | `gov.*` only for EGCP |
| Dispatcher | Existing V4.3.0 dispatcher |
| Subscriber isolation | Consumer failures must not corrupt EGCP writes (V3 subscriber isolation principles) |
| Ordering | Evaluation seal before downstream allow-to-execute where required |

---

## 5. Migration Architecture (definitional)

When Implementation Approval is granted:

| Current state | Target state |
|---------------|--------------|
| SA legislation under `src/statutory/south-africa` | Content of EGCP ZA packs; Payroll uses adapter only |
| Module-local approval limits (if any) | AuthorityMatrix in DoA |
| Hardcoded filing dates | Statutory Calendar |
| Ad-hoc waiver flags | Exception Management |

Migration must be **additive then cut-over**, preserving historical payslips and journals (historical integrity).

---

## 6. Failure & Degraded Modes (architecture)

| Mode | Behaviour |
|------|-----------|
| Legislation resolver unavailable | Deny high-risk actions; allow only explicitly classified low-risk reads per policy |
| DoA unavailable | Fail closed for financial commitments |
| Calendar unavailable | Block obligation satisfaction claims; alert Intelligence |
| Evidence register unavailable | Block seal-requiring completions |

Fail-open for monetary or statutory actions is **forbidden**.

---

## 7. Security Integration

- AuthN/AuthZ via existing platform identity.  
- EGCP adds **authorisation decisions** (DoA), not identity master.  
- All evaluate/resolve calls audited with `evaluation_id` / access events.

---

## 8. AI Integration Boundary

| Allowed | Forbidden |
|---------|-----------|
| Advisory insights on Intelligence | Autonomous legislation edits |
| Draft policy / control suggestions | Autonomous DoA grants |
| Evidence retrieval assistance | Silent exception approval |
| Gap prioritisation | Closing Audit Gaps without evidence |

AI outputs are non-authoritative until a human/system actor under DoA accepts them (recorded as Evidence).

---

## 9. Certification

Integration Architecture is **CERTIFIED**. Runtime wiring remains prohibited until Implementation Approval cites V5.0.0 + V4.2.1 + V4.3.0 + V4.4.0 change class.
