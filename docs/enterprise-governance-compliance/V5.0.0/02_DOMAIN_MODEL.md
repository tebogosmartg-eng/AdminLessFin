# 02 — Domain Model

**Pillar:** Enterprise Governance & Compliance Platform (EGCP)  
**Version:** 5.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Governance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Define the logical enterprise domain model for EGCP. This is a **business domain** model — not a physical schema, ORM, or API design.

---

## 2. Ubiquitous Language

| Term | Meaning |
|------|---------|
| **Legislation Pack** | Versioned, country-scoped set of legislative domain contents |
| **Legislative Domain** | Bounded subject of law (e.g. PAYE, VAT, BCEA, POPIA) |
| **Policy** | Internal rule published by the tenant |
| **Authority Matrix** | DoA definition of who may approve what |
| **Obligation** | Concrete duty of a company to act by a due date |
| **Control** | Measure that mitigates a risk |
| **Evidence Object** | Sealed reference proving an action or state |
| **Exception** | Time-boxed governed deviation from policy/control (never from mandatory law without legal basis) |
| **Compliance Evaluation** | Point-in-time result of applying rules to a context |
| **Audit Gap** | Missing evidence or failed control relative to readiness criteria |

---

## 3. Aggregate Map

```
Company (tenant)
├── GovernanceProfile (countries, industries, registration identifiers)
├── PolicyCatalogue
│     └── PolicyVersion*
├── AuthorityMatrix
│     └── AuthorityRule* (role/person, action, limit, conditions)
├── ObligationRegister
│     └── ObligationInstance* → CalendarEntry, EvidenceObject*
├── RiskRegister
│     └── Risk* → Control*
├── ExceptionRegister
│     └── ExceptionCase*
├── ControlTestProgramme
│     └── ControlTest*
└── AuditReadinessCase*
      └── AuditGap*

Platform (cross-tenant)
├── CountryRegistry
│     └── LegislationPack*
│           └── LegislativeDomainVersion*
│                 └── ProvenanceRecord*
└── StatutoryCalendarTemplate*
      └── CalendarRule*
```

---

## 4. Core Entities (logical)

### 4.1 Platform entities

| Entity | Identity | Key attributes | Invariants |
|--------|----------|----------------|------------|
| `Country` | ISO country code | name, status | Immutable code |
| `LegislativeDomain` | country + domain_key | description, owner_steward | Unique per country |
| `LegislationVersion` | domain + version_id | effective_from, effective_to, content_ref, status | No overlap of active windows for same domain without supersession rule |
| `ProvenanceRecord` | version + source_id | source_type, citation, document_ref | Required for publish |
| `CalendarTemplate` | country + template_id | year/tax_year, rules | Derived from legislation where possible |

### 4.2 Tenant entities

| Entity | Identity | Key attributes | Invariants |
|--------|----------|----------------|------------|
| `GovernanceProfile` | company_id | operating_countries[], industry_codes | ≥1 country |
| `Policy` | company + policy_key | category, process_scope | Key unique per company |
| `PolicyVersion` | policy + version | effective_from, body_ref, status | Published versions immutable |
| `AuthorityMatrix` | company + matrix_id | effective_from, status | One active matrix per scope |
| `AuthorityRule` | matrix + rule_id | actor, action_type, amount_limit, currency, conditions | SoD constraints enforceable |
| `ObligationInstance` | company + obligation_id | type, jurisdiction, due_at, status, owner | Status transitions audited |
| `CalendarEntry` | company + entry_id | due_at, obligation_ref, source | Tenant may customise; platform template provenance retained |
| `Risk` | company + risk_id | category, inherent/residual scores | Mapped to ≥0 controls |
| `Control` | company + control_id | objective, type, frequency, owner | Linked to risks/processes |
| `ComplianceEvaluation` | evaluation_id | context_ref, outcome, rule_set_refs | Immutable after seal |
| `ExceptionCase` | exception_id | type, reason, expires_at, approver | Self-approval forbidden |
| `EvidenceObject` | evidence_id | hash, custody, retention_class, links | Sealed content immutable |
| `ControlTest` | test_id | control_id, period, result, tester | Failed → remediation required |
| `AuditGap` | gap_id | criterion, severity, status | Closed only with evidence |

---

## 5. Relationships (mandatory)

| From | To | Cardinality | Nature |
|------|-----|-------------|--------|
| LegislationVersion | ProvenanceRecord | 1:N | Composition |
| CalendarTemplate | LegislationVersion | N:N | Derivation |
| ObligationInstance | LegislationVersion | N:1 | Applicability |
| ObligationInstance | CalendarEntry | 1:1..N | Scheduling |
| PolicyVersion | ComplianceEvaluation | 1:N | Rule source |
| AuthorityRule | ComplianceEvaluation / DoA decision | 1:N | Authorisation |
| Risk | Control | N:N | Mitigation |
| Control | ControlTest | 1:N | Assurance |
| ComplianceEvaluation | EvidenceObject | 1:N | Proof |
| ExceptionCase | EvidenceObject | 1:N | Justification |
| ExceptionCase | AuthorityRule | N:1 | Approval path |
| AuditGap | EvidenceObject | N:N | Closure proof |

---

## 6. State Machines (definitional)

### 6.1 LegislationVersion

`draft → validated → published → active → deprecated → archived`

Published/active content is immutable; corrections create a new version.

### 6.2 PolicyVersion

`draft → in_review → published → retired`

### 6.3 ObligationInstance

`identified → assigned → in_progress → submitted → satisfied | overdue → waived*`  

\*Waiver only via Exception Management with legal basis flag.

### 6.4 ExceptionCase

`requested → under_review → approved | rejected → active → expired | revoked`

### 6.5 ControlTest

`planned → in_progress → passed | failed → remediated (if failed)`

---

## 7. Context Object (consumer contract)

Every EGCP evaluation requires a **Governance Context**:

| Field | Required | Description |
|-------|----------|-------------|
| `company_id` | Yes | Tenant |
| `country_code` | Yes | Jurisdiction for legislation |
| `effective_date` | Yes | Resolution date |
| `process_key` | Yes | e.g. `payroll.finalise`, `procurement.po_approve` |
| `action_type` | Yes | e.g. `approve`, `file`, `post`, `pay` |
| `amount` / `currency` | Conditional | For DoA |
| `actors` | Yes | Requester, proposed approvers |
| `module_ref` | Yes | Source module + business object id |
| `evidence_hints` | Optional | Pre-linked docs |

Outcome contract:

| Field | Description |
|-------|-------------|
| `decision` | `allow` \| `deny` \| `require_approval` \| `conditional` |
| `required_approvers` | From DoA |
| `applicable_legislation_versions` | Provenance |
| `applicable_policies` | Version ids |
| `obligations_touched` | Ids |
| `evaluation_id` | For audit |
| `evidence_requirements` | What must be attached |

---

## 8. Domain Ownership Summary

| Domain | Aggregate root(s) | Owner |
|--------|-------------------|-------|
| Legislation Repository | Country, LegislationVersion | Platform Legislation Steward |
| Compliance Engine | ComplianceEvaluation | EGCP Compliance Owner |
| Policy Engine | Policy, PolicyVersion | Tenant Governance Office |
| DoA Engine | AuthorityMatrix | Tenant Board / Exco |
| Statutory Calendar | CalendarTemplate, CalendarEntry | EGCP Calendar Steward |
| Regulatory Obligations | ObligationInstance | Tenant Compliance Officer |
| Risk & Control Library | Risk, Control | Tenant Risk Owner |
| Compliance Intelligence | PostureSnapshot (derived) | EGCP Intelligence Owner |
| Governance Reporting | GovernanceReportRun | EGCP Reporting Steward |
| Audit Readiness | AuditReadinessCase | Internal Audit |
| Evidence Repository | EvidenceObject | Evidence Custodian |
| Control Testing | ControlTest | Control Testing Owner |
| Exception Management | ExceptionCase | Exception Owner |

---

## 9. Anti-Duplication Rules

| Forbidden local store | Must use instead |
|----------------------|------------------|
| Module tax/rate constants | Legislation Repository |
| Module approval limit tables | DoA Engine |
| Module filing deadline hardcodes | Statutory Calendar |
| Module ad-hoc waiver flags | Exception Management |
| Module private policy PDFs without register | Policy Engine + Evidence |

---

## 10. Certification

This domain model is **CERTIFIED** as the logical foundation for EGCP V5.0.0. Physical schema design is deferred to Implementation Approval under V4.4.0 change control.
