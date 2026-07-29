# Reporting Snapshot & Period Architecture — V6.0.1 Index

**Product:** AdminLess Fin  
**Pillar:** Enterprise Financial Reporting Engine (EFRE) — Reporting Snapshot & Period Architecture  
**Version:** 6.0.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Data Architecture Board  

**Prerequisites (CERTIFIED — not redefined):**

| Artefact | Version | Relationship |
|----------|---------|--------------|
| Enterprise Financial Reporting Architecture | V6.0.0 | Parent pillar — EFRE domains, boundaries, migration dual-track |
| EFRE Migration Strategy | V6.0.0 §08 | Operational live vs Enterprise sealed paths |
| Accounting Engine | Platform SoT | Origin of financial balances; never bypassed |
| Enterprise Business Event Platform | V4.3.0 | Extends `fre.*` for snapshot lifecycle events |
| Enterprise Edge Platform | V4.2.1 | Future runtime host |
| Evolution Governance | V4.4.0 | Orthogonal product change control |
| EGCP | V5.0.0 | DoA for freeze / publish approvals when implemented |

---

## Architectural Stance

| Item | Rule |
|------|------|
| This pack | **Definitional certification** of how EFRE obtains and freezes financial facts |
| Implementation / schema / UI / DDL | **PROHIBITED** under this pack |
| Statutory statements from live GL | **FORBIDDEN** |
| Operational Financial Reporting | **Remains live** — does not require Reporting Snapshots |
| Snapshot immutability after freeze/publish | **Mandatory** |
| Versioned snapshots | **Mandatory** |
| Traceable adjustments | **Mandatory** |
| Multi-framework | **Mandatory** (snapshots are framework-agnostic facts; frameworks consume them) |

> **Accounting owns financial balances.**  
> **Reporting owns immutable reporting snapshots.**  
> **Enterprise Financial Reporting must never prepare statutory financial statements directly from a live General Ledger.**  
> **Financial statements shall consume certified Reporting Snapshots.**  
> **Implementation remains prohibited until Reporting Snapshot Architecture has been certified.**

---

## Concepts Certified

1. Reporting Period  
2. Reporting Snapshot  
3. Snapshot Version  
4. Reporting Dataset  
5. Audit Adjustment  
6. Reporting Adjustment  
7. Fact Snapshot  
8. Comparative Snapshot  
9. Reporting Freeze  
10. Publication Snapshot  
11. Restatement  
12. Subsequent Events  

---

## Deliverables

| # | Deliverable | Path |
|---|-------------|------|
| 1 | Reporting Snapshot Architecture | [01_REPORTING_SNAPSHOT_ARCHITECTURE.md](./01_REPORTING_SNAPSHOT_ARCHITECTURE.md) |
| 2 | Reporting Lifecycle | [02_REPORTING_LIFECYCLE.md](./02_REPORTING_LIFECYCLE.md) |
| 3 | Snapshot Versioning Strategy | [03_SNAPSHOT_VERSIONING_STRATEGY.md](./03_SNAPSHOT_VERSIONING_STRATEGY.md) |
| 4 | Reporting Adjustment Model | [04_REPORTING_ADJUSTMENT_MODEL.md](./04_REPORTING_ADJUSTMENT_MODEL.md) |
| 5 | Audit Readiness Assessment | [05_AUDIT_READINESS_ASSESSMENT.md](./05_AUDIT_READINESS_ASSESSMENT.md) |

**Evidence:** [evidence/reporting-snapshot-architecture-certification-evidence.json](./evidence/reporting-snapshot-architecture-certification-evidence.json)

---

## Alignment with V6.0.0

| V6.0.0 term | V6.0.1 refinement |
|-------------|-------------------|
| `FactSnapshotSeal` / AccountingFact Snapshot | Specialised as **Fact Snapshot** within **Reporting Snapshot** lineage |
| `ReportingPeriodCase` | Bound to **Reporting Period** + snapshot lifecycle |
| `PublishedPackVersion` | Consumes **Publication Snapshot** only |
| Operational Financial Reporting | Confirmed **live**; out of snapshot-mandatory path |

---

## Final Verdict

# REPORTING SNAPSHOT ARCHITECTURE CERTIFIED

See [05_AUDIT_READINESS_ASSESSMENT.md](./05_AUDIT_READINESS_ASSESSMENT.md).
