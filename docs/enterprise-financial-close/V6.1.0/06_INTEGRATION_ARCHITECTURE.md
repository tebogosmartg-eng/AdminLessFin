# 06 — Integration Architecture

**Pillar:** Enterprise Financial Close Platform (EFCP)  
**Version:** 6.1.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Close Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Integration Philosophy

EFCP is the **process control plane** between Accounting facts and EFRE presentation.

```
Accounting ──facts──► Close Workspace (reconcile, evidence, adjust-via-Accounting)
                          │
                          ▼
                   Certified Reporting Snapshot (V6.0.1)
                          │
                          ▼
                   EFRE assembly / publish (V6.0.0)
                          │
Operational Reports ◄── live Accounting (parallel, ungated)
```

Principles:

1. Pull Accounting facts for extract/seal; never own balances.  
2. Push `close.*` events for awareness.  
3. Hand off Snapshot Versions to EFRE — not live GL.  
4. Preserve Operational live path.  
5. Use EGCP DoA for approvals when available.  
6. Edge V4.2.1 hosts future Close services.

---

## 2. Logical Service Contracts

| Service | Operation | Result |
|---------|-----------|--------|
| Workspace | `openCloseWorkspace` | CloseWorkspace |
| Checklist | `instantiateChecklist` | ChecklistInstance + Tasks |
| Readiness | `evaluateCloseReadiness` | CloseReadinessAssessment |
| Snapshot | `requestSnapshotCertification` | Snapshot Version (V6.0.1) |
| Freeze | `requestReportingFreeze` | Freeze applied (V6.0.1) |
| Hand-off | `handOffPublicationReadiness` | SnapshotHandOff + `close.hand_off.completed` |
| Evidence | `finalizeWorkingPaper` / `lockLeadSchedule` | Immutable artefacts pinned to snapshot |

Physical APIs out of scope.

---

## 3. Integration by Pillar

### 3.1 Accounting

| Direction | Contract |
|-----------|----------|
| Inbound to Close | Balances, activity, recon data, period status |
| Outbound from Close | Audit Adjustment proposals for posting |
| Events consumed | `journal.posted`, `period.closed` |
| Events emitted | none into `journal.*` |

### 3.2 Reporting Snapshot (V6.0.1)

| Direction | Contract |
|-----------|----------|
| Close orchestrates | Fact seal, Snapshot Version certify, Freeze |
| Owns definition | V6.0.1 concepts |
| Must not | Extract live GL for EFRE publish without Close readiness (statutory path) |

### 3.3 EFRE (V6.0.0)

| Direction | Contract |
|-----------|----------|
| Consumes | Certified/frozen Snapshot Version via hand-off |
| Owns | Statement/Notes/Disclosure/Publication |
| Emits | `fre.pack.published` (Close may subscribe to close workspace) |

### 3.4 Operational Financial Reporting

| Direction | Contract |
|-----------|----------|
| Independent | Live RPCs; no Close gate |
| May observe | Close status informationally |

### 3.5 EGCP

| Direction | Contract |
|-----------|----------|
| DoA | Evaluate Close Approvals, Manager/Partner gates |
| Calendar | Filing deadlines inform Milestones |
| Evidence | Custody metadata for WP binaries |

### 3.6 V3.6 Reporting Platform

Optional export of close status packs / WP indices — must not redefine snapshot or EFRE semantics.

---

## 4. Event Namespace

| Namespace | Owner |
|-----------|-------|
| `close.*` | EFCP (this pack) |
| `fre.*` | EFRE / Snapshot |
| `journal.*` / `period.*` | Accounting (frozen) |
| `gov.*` | EGCP |

Cross-emission forbidden: Close must not emit `journal.posted` or `fre.pack.published`.

---

## 5. Failure Isolation

| Failure | Isolation |
|---------|-----------|
| Open recon breaks | Blocking Issues; readiness blocked; Operational Reports still live |
| Accounting post fail | Adjustment proposal stays unposted; no fake snapshot include |
| EFRE validation fail | Snapshot remains frozen; Close may reopen evidence; no silent unfreeze of same version |
| Partner rejects | Return workflow; publish blocked |
| Subscriber fail on `close.*` | Isolated per V4.3.0 rules |

---

## 6. Multi-Company

All Close artefacts scoped by `company_id` (+ `reporting_entity_id`). No cross-tenant workspace sharing.

---

## 7. Certification

Integration Architecture is **CERTIFIED**.
