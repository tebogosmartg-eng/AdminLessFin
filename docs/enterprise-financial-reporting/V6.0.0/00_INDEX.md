# Enterprise Financial Reporting Engine — V6.0.0 Index

**Product:** AdminLess Fin  
**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  

**Prerequisites (CERTIFIED — not redefined):**

| Artefact | Version | Relationship |
|----------|---------|--------------|
| Accounting Engine (journals, balances, periods) | Platform SoT | Supplies sealed facts; remains financial authority for recognition |
| Enterprise Reporting Platform | V3.6.3+ | Optional export/registry substrate; does not own FS framework semantics |
| Payroll / Statutory freeze | V3.x packs | Expense facts arrive only via Accounting GL; formulas untouched |
| Enterprise Work Management | V4.0–V4.1.5 | May consume published presentation; does not own statements |
| Enterprise Edge Platform | V4.2.1 | Runtime host for future EFRE services |
| Enterprise Business Event Platform | V4.3.0 | `fre.*` namespace registered under this pack |
| Enterprise Change Control & Evolution Governance | V4.4.0 | Orthogonal — governs how AdminLess Fin evolves |
| Enterprise Governance & Compliance Platform | V5.0.0 | DoA/calendar for publication approval; must not own FS content |

---

## Architectural Stance

| Item | Rule |
|------|------|
| This pack | **Definitional certification of a new core pillar** |
| Implementation / feature design / schema / UI | **PROHIBITED** under this pack |
| Embedding framework layouts or disclosure rules in Accounting | **FORBIDDEN** after Implementation Approval cites V6.0.0 |
| Duplicating GL balance or recognition calculations in Reporting | **FORBIDDEN** |
| Multi-framework packs | **Mandatory design constraint** |
| Versioned reporting frameworks | **Mandatory** |
| Multi-company isolation | **Mandatory** |
| Full auditability | **Mandatory** |
| Publication & XBRL readiness | **Mandatory** (XBRL as tagging/export contract, not full taxonomy product) |
| Existing Financial Statements preservation | **Mandatory** — becomes Operational Financial Reporting; not deleted/deprecated |
| Dual-track consumption of Accounting | **Mandatory** — no duplicated balance calculations |

> **Accounting owns financial facts.**  
> **Operational Reports own operational presentation.**  
> **Enterprise Financial Reporting owns statutory financial reporting.**  
> **Implementation remains prohibited until the architecture has been certified.**  
> This pack **certifies** the architecture. Subsequent Implementation Approval must cite V6.0.0 artefact IDs exclusively.

---

## Dual-Track Reporting (mandatory)

Existing Financial Statements under Reports are **preserved** as **Operational Financial Reporting**. They are **not** deprecated, deleted, or replaced by EFRE.

| Track | Authority | Mode |
|-------|-----------|------|
| **Operational Financial Reporting** | Live IS, BS, Cash Flow, Trial Balance, Ratios | Live Accounting facts |
| **Enterprise Financial Reporting (EFRE)** | Statement preparation, disclosures, notes, policies, comparatives, validation, review, version control, publication | Sealed Accounting facts + Framework Packs |

See [08_MIGRATION_STRATEGY.md](./08_MIGRATION_STRATEGY.md).

---

## Distinction from Adjacent Pillars

| Dimension | Accounting | Operational Financial Reporting | V3.6 Reporting Platform | EGCP V5.0.0 | EFRE V6.0.0 |
|-----------|------------|--------------------------------|-------------------------|-------------|-------------|
| Subject | Journals, recognition, balances | Live management financial reports | Generic report registry/export | Constraint, DoA, obligations | Statutory/standards financial statements |
| Ownership | GL SoT | Operational live presentation | Substrate engines | Governance SoT | Presentation / disclosure / publication SoT |
| Events | `journal.*`, `period.*` (frozen) | Consumes Accounting | Consumes domain facts | `gov.*` | `fre.*` |
| May own statutory FS packs? | No | **No** | No | **Must not** | **Yes** |
| May own live operational FS? | No | **Yes** | No | No | **No** |

---

## Deliverables

| # | Deliverable | Path |
|---|-------------|------|
| 1 | Enterprise Financial Reporting Architecture | [01_ENTERPRISE_FINANCIAL_REPORTING_ARCHITECTURE.md](./01_ENTERPRISE_FINANCIAL_REPORTING_ARCHITECTURE.md) |
| 2 | Domain Model | [02_DOMAIN_MODEL.md](./02_DOMAIN_MODEL.md) |
| 3 | Reporting Boundaries | [03_REPORTING_BOUNDARIES.md](./03_REPORTING_BOUNDARIES.md) |
| 4 | Consumer Matrix | [04_CONSUMER_MATRIX.md](./04_CONSUMER_MATRIX.md) |
| 5 | Business Event Catalogue | [05_BUSINESS_EVENT_CATALOGUE.md](./05_BUSINESS_EVENT_CATALOGUE.md) |
| 6 | Integration Architecture | [06_INTEGRATION_ARCHITECTURE.md](./06_INTEGRATION_ARCHITECTURE.md) |
| 7 | Enterprise Readiness Assessment | [07_ENTERPRISE_READINESS_ASSESSMENT.md](./07_ENTERPRISE_READINESS_ASSESSMENT.md) |
| 8 | Migration Strategy | [08_MIGRATION_STRATEGY.md](./08_MIGRATION_STRATEGY.md) |

**Evidence:** [evidence/efre-architecture-certification-evidence.json](./evidence/efre-architecture-certification-evidence.json)

---

## Architecture Domains (certified)

1. Statement Engine  
2. Disclosure Engine  
3. Notes Engine  
4. Mapping Engine  
5. Accounting Policy Engine  
6. Comparative Figures Engine  
7. Cross Reference Engine  
8. Materiality Engine  
9. Validation Engine  
10. Review Workflow  
11. Publication Engine  
12. Version Control  
13. XBRL Readiness  
14. Framework Management  

---

## Supported Reporting Frameworks

| Framework Pack Key | Status in V6.0.0 |
|--------------------|------------------|
| IFRS | First-class Framework Pack |
| IFRS for SMEs | First-class Framework Pack |
| GRAP | First-class Framework Pack |
| Modified Cash Standard | First-class Framework Pack |
| IPSAS | First-class Framework Pack |
| Future Framework Packs | Extensibility slot — register without changing Accounting |

---

## Final Verdict

# ENTERPRISE FINANCIAL REPORTING ENGINE ARCHITECTURE CERTIFIED

See [07_ENTERPRISE_READINESS_ASSESSMENT.md](./07_ENTERPRISE_READINESS_ASSESSMENT.md).
