# Enterprise Governance & Compliance Platform — V5.0.0 Index

**Product:** AdminLess Fin  
**Pillar:** Enterprise Governance & Compliance Platform (EGCP)  
**Version:** 5.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Governance Architecture Board  

**Prerequisites (CERTIFIED — not redefined):**

| Artefact | Version | Relationship |
|----------|---------|--------------|
| Payroll / Statutory calculation freeze | V3.x packs | Consumes EGCP legislation; does not own it |
| South African Legislative Framework | V3.4 / V3.4.x | Absorbed as **country plugin content** under EGCP Legislation Repository |
| Enterprise Work Management | V4.0–V4.1.5 | Consumes policy, DoA, obligations, risk/control |
| Enterprise KPI Catalogue | V4.1.5 | May observe EGCP compliance KPIs; does not own rules |
| Enterprise Edge Platform | V4.2.1 | Runtime host for future EGCP services |
| Enterprise Business Event Platform | V4.3.0 | `gov.*` namespace registered under this pack |
| Enterprise Change Control & Evolution Governance | V4.4.0 | **Orthogonal** — governs how AdminLess Fin evolves; EGCP is a product pillar |

---

## Architectural Stance

| Item | Rule |
|------|------|
| This pack | **Definitional certification of a new core pillar** |
| Implementation / feature design / schema / UI | **PROHIBITED** under this pack |
| Embedded legislation, policy, or approval rules in consumer modules | **FORBIDDEN** after Implementation Approval cites V5.0.0 |
| Duplication of statutory calendars or DoA matrices | **FORBIDDEN** |
| Multi-country legislation | **Mandatory design constraint** |
| Versioned legislation | **Mandatory** |
| Full auditability | **Mandatory** |

> **Implementation remains prohibited until the architecture has been certified.**  
> This pack **certifies** the architecture. Subsequent Implementation Approval must cite V5.0.0 artefact IDs exclusively.

---

## Distinction from V4.4.0

| Dimension | V4.4.0 Evolution Governance | V5.0.0 EGCP |
|-----------|----------------------------|-------------|
| Subject | How **AdminLess Fin** may change | How **customer enterprises** govern & comply |
| Audience | Architecture / release boards | Tenant companies, compliance officers, auditors |
| Artefacts | Change classes, certification workflow | Legislation, policy, DoA, obligations, controls |
| Ownership | Product Governance Board | EGCP pillar + tenant Governance Office |

Both remain certified. Neither replaces the other.

---

## Deliverables

| # | Deliverable | Path |
|---|-------------|------|
| 1 | Enterprise Governance Architecture | [01_ENTERPRISE_GOVERNANCE_ARCHITECTURE.md](./01_ENTERPRISE_GOVERNANCE_ARCHITECTURE.md) |
| 2 | Domain Model | [02_DOMAIN_MODEL.md](./02_DOMAIN_MODEL.md) |
| 3 | Governance Boundaries | [03_GOVERNANCE_BOUNDARIES.md](./03_GOVERNANCE_BOUNDARIES.md) |
| 4 | Consumer Matrix | [04_CONSUMER_MATRIX.md](./04_CONSUMER_MATRIX.md) |
| 5 | Business Event Catalogue | [05_BUSINESS_EVENT_CATALOGUE.md](./05_BUSINESS_EVENT_CATALOGUE.md) |
| 6 | Integration Architecture | [06_INTEGRATION_ARCHITECTURE.md](./06_INTEGRATION_ARCHITECTURE.md) |
| 7 | Enterprise Readiness Assessment | [07_ENTERPRISE_READINESS_ASSESSMENT.md](./07_ENTERPRISE_READINESS_ASSESSMENT.md) |

**Evidence:** [evidence/egcp-architecture-certification-evidence.json](./evidence/egcp-architecture-certification-evidence.json)

---

## Architecture Domains (certified)

1. Legislation Repository  
2. Compliance Engine  
3. Policy Engine  
4. Delegation of Authority Engine  
5. Statutory Calendar  
6. Regulatory Obligations Engine  
7. Risk & Control Library  
8. Compliance Intelligence  
9. Governance Reporting  
10. Audit Readiness  
11. Evidence Repository  
12. Control Testing  
13. Exception Management  

---

## Final Verdict

# ENTERPRISE GOVERNANCE PLATFORM ARCHITECTURE CERTIFIED

See [07_ENTERPRISE_READINESS_ASSESSMENT.md](./07_ENTERPRISE_READINESS_ASSESSMENT.md).
