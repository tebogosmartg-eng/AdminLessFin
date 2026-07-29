# 01 — Enterprise Governance Architecture

**Pillar:** Enterprise Governance & Compliance Platform (EGCP)  
**Version:** 5.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Governance Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Business Purpose

The Enterprise Governance & Compliance Platform is the **single source of truth** for everything that constrains, authorises, or evidences lawful and policy-aligned enterprise behaviour in AdminLess Fin.

It answers questions that no operational module may answer alone:

- Which legislation applies to this company, country, and effective date?
- Which internal policies bind this transaction?
- Who may approve what, up to which limit, under which conditions?
- Which statutory obligations are due, overdue, or at risk?
- Which risks and controls apply to this process?
- Is the organisation audit-ready, and where is the evidence?

**Core principle:**

> **Modules execute. Governance decides what is allowed, required, and evidenced.**

Every enterprise module **consumes** governance services. No module embeds legislative constants, policy matrices, DoA rules, or statutory calendars as local truth.

---

## 2. Pillar Position in AdminLess Fin

```
┌─────────────────────────────────────────────────────────────────┐
│                    AdminLess Fin Core Pillars                     │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Accounting  │   Payroll    │ Procurement  │  HR / Identity     │
│  (frozen GL) │ (frozen calc)│              │                    │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│              Enterprise Work Management (operational)             │
├─────────────────────────────────────────────────────────────────┤
│     ★ Enterprise Governance & Compliance Platform (V5.0.0) ★     │
│  Legislation · Policy · DoA · Obligations · Risk/Control · Audit │
├─────────────────────────────────────────────────────────────────┤
│  Platforms: Edge V4.2.1 · Business Events V4.3.0 · KPI V4.1.5    │
│  Evolution Governance: V4.4.0 (orthogonal product change control) │
└─────────────────────────────────────────────────────────────────┘
```

EGCP is **not** a reporting add-on, **not** a payroll subfolder, and **not** a duplicate of V4.4.0 change control.

---

## 3. Architectural Principles

| # | Principle | Implication |
|---|-----------|-------------|
| P1 | Single source of truth | One Legislation Repository, one Policy Engine, one DoA Engine, one Statutory Calendar |
| P2 | Consume, do not embed | Consumer modules call resolve/evaluate APIs; they never fork rule sets |
| P3 | Version everything | Legislation, policy, DoA, control definitions are effective-dated and immutable once published |
| P4 | Multi-country ready | Country is a first-class dimension; SA is the first country pack, not the schema |
| P5 | Tenant isolation | Every governance object is scoped by `company_id` (tenant) except platform-published legislation packs |
| P6 | Separation of duty | Rule authors ≠ rule consumers ≠ evidence custodians where required |
| P7 | Full auditability | Every resolution, evaluation, exception, and evidence link is reconstructible |
| P8 | Event-first integration | State changes emit `gov.*` business events (V4.3.0 namespace) |
| P9 | AI-ready but AI-governed | Insights and recommendations are advisory; decisions remain attributable to humans/systems under DoA |
| P10 | Freeze respect | Payroll calculation formulas, Accounting journal ownership, and certified contracts remain locked |

---

## 4. Domain Architecture (logical)

```
Enterprise Governance & Compliance Platform
├── Legislation Repository        # Versioned law / regulation packs by country & domain
├── Compliance Engine             # Evaluate obligations & rule applicability
├── Policy Engine                 # Internal policies & procedures
├── Delegation of Authority       # Approval limits, roles, conditions
├── Statutory Calendar            # Filing / remittance / disclosure dates
├── Regulatory Obligations        # Concrete obligations bound to entities
├── Risk & Control Library        # Risks, controls, control objectives
├── Compliance Intelligence       # Aggregated posture, trends, predictions
├── Governance Reporting          # Certified governance report pack
├── Audit Readiness               # Readiness score, gap analysis, workpapers
├── Evidence Repository           # Immutable evidence pointers & custody
├── Control Testing               # Test plans, results, remediation
└── Exception Management          # Waivers, breaches, compensating controls
```

---

## 5. Domain Definitions

For each domain below: Purpose, Ownership, Relationships, Consumers, Business Events, Boundaries, Responsibilities, AI Readiness.

### 5.1 Legislation Repository

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Authoritative, versioned store of external law and regulation applicable to AdminLess Fin tenants (rates, brackets, filing rules, definitions — not calculation algorithms). |
| **Ownership** | EGCP Legislation Steward + Legislative Board. Platform publishes country packs; tenants may not mutate platform packs. |
| **Relationships** | Feeds Compliance Engine, Statutory Calendar, Regulatory Obligations, Payroll adapters, Accounting tax treatment references. |
| **Consumers** | Payroll (resolve by pay date), Accounting, Procurement, HR, EWM, Compliance Engine, Governance Reporting. |
| **Business Events** | `gov.legislation.pack_published`, `gov.legislation.version_activated`, `gov.legislation.version_deprecated`. |
| **Governance Boundaries** | Owns content & versions. Does **not** own PAYE/UIF/SDL formulas, journal posting, or UI. |
| **Module Responsibilities** | Register domains; store immutable versions; resolve by country + domain + effective date; expose provenance. |
| **Future AI Readiness** | AI may assist impact analysis and diff summaries between versions; may not silently alter published packs. |

### 5.2 Compliance Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Evaluate whether a business context complies with applicable legislation, policy, and obligation rules. |
| **Ownership** | EGCP Compliance Engine Owner. |
| **Relationships** | Reads Legislation, Policy, Obligations, DoA outcomes, Exceptions; writes evaluation results to Evidence & Intelligence. |
| **Consumers** | All transactional modules at decision points; Audit Readiness; Intelligence. |
| **Business Events** | `gov.compliance.evaluated`, `gov.compliance.breach_detected`, `gov.compliance.cleared`. |
| **Governance Boundaries** | Owns evaluation contracts & results. Does not own source rules or execute module transactions. |
| **Module Responsibilities** | Resolve applicable rule set; evaluate; return pass/fail/conditional + evidence refs. |
| **Future AI Readiness** | AI may propose risk-ranked evaluations and anomaly flags; final breach classification remains engine + human review policy. |

### 5.3 Policy Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Single store of internal policies (procurement thresholds, leave rules references, document retention, conflict of interest, etc.). |
| **Ownership** | Tenant Governance Office via EGCP Policy Steward. |
| **Relationships** | Constrains DoA conditions; feeds Compliance Engine; referenced by Exception Management. |
| **Consumers** | Procurement, HR, Accounting, Payroll (policy overlays only), EWM, Documents. |
| **Business Events** | `gov.policy.published`, `gov.policy.amended`, `gov.policy.retired`, `gov.policy.acknowledged`. |
| **Governance Boundaries** | Owns internal policy definitions. Does not own employment contracts (HR) or GL policy accounts. |
| **Module Responsibilities** | Version policies; map to processes; resolve by company + process + effective date. |
| **Future AI Readiness** | AI may draft policy diffs and gap analysis vs legislation; publication requires DoA. |

### 5.4 Delegation of Authority Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Definitive answer to “who may authorise this action, for this amount, under these conditions?” |
| **Ownership** | Tenant Board / Exco via EGCP DoA Steward. |
| **Relationships** | Consumes Policy conditions; produces approval requirements for all modules; Exceptions may grant time-boxed overrides with evidence. |
| **Consumers** | Procurement, Accounting (journals/payments), Payroll (finalise/payment), HR (offers/terminations), EWM (budget/allocation approvals). |
| **Business Events** | `gov.doa.matrix_published`, `gov.doa.authority_granted`, `gov.doa.authority_revoked`, `gov.doa.evaluation_required`, `gov.doa.approved`, `gov.doa.rejected`. |
| **Governance Boundaries** | Owns authority matrices & evaluations. Does **not** own workflow UI or module-specific approval screens (those call DoA). |
| **Module Responsibilities** | Maintain matrices; evaluate requests; record decisions; forbid local approval limit tables in consumers. |
| **Future AI Readiness** | AI may recommend matrix rationalisation and detect SoD conflicts; cannot auto-grant authority. |

### 5.5 Statutory Calendar

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Single calendar of statutory and regulatory dates (filings, remittances, disclosures, renewals) by jurisdiction. |
| **Ownership** | EGCP Calendar Steward (platform templates + tenant customisations). |
| **Relationships** | Derived from Legislation packs; drives Regulatory Obligations due dates; feeds Intelligence & Reporting. |
| **Consumers** | Payroll (EMP201/EMP501 windows), Accounting (VAT/provisional tax), Procurement/HR (licence renewals), EWM (compliance milestones). |
| **Business Events** | `gov.calendar.period_opened`, `gov.calendar.deadline_approaching`, `gov.calendar.deadline_missed`, `gov.calendar.obligation_completed`. |
| **Governance Boundaries** | Owns dates & recurrence rules. Does not own filing content generation (Statutory Returns still produce returns). |
| **Module Responsibilities** | Maintain jurisdiction calendars; resolve next due; notify via events. |
| **Future AI Readiness** | AI may forecast bottleneck periods; may not invent filing dates without legislation provenance. |

### 5.6 Regulatory Obligations Engine

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Instantiate concrete obligations for a company (who must file what, with what frequency, linked to evidence). |
| **Ownership** | EGCP Obligations Owner + tenant Compliance Officer. |
| **Relationships** | Bound to Legislation + Calendar; tracked by Compliance Engine; evidenced in Evidence Repository. |
| **Consumers** | Payroll statutory returns, Accounting tax returns, HR labour submissions, Audit Readiness. |
| **Business Events** | `gov.obligation.created`, `gov.obligation.assigned`, `gov.obligation.status_changed`, `gov.obligation.satisfied`, `gov.obligation.overdue`. |
| **Governance Boundaries** | Owns obligation instances & status. Does not own return XML/PDF generation. |
| **Module Responsibilities** | Lifecycle of obligations; linkage to calendar & evidence; escalation rules. |
| **Future AI Readiness** | AI may suggest missing obligations from company profile; activation requires Compliance Officer. |

### 5.7 Risk & Control Library

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Enterprise library of risks, control objectives, and controls mapped to processes and modules. |
| **Ownership** | EGCP Risk & Control Steward + tenant Risk Owner. |
| **Relationships** | Feeds Control Testing, Exception Management, Compliance Intelligence, Audit Readiness. |
| **Consumers** | All modules (control metadata), Internal Audit, Executive KPI consumers. |
| **Business Events** | `gov.risk.registered`, `gov.risk.reassessed`, `gov.control.defined`, `gov.control.mapped`, `gov.control.retired`. |
| **Governance Boundaries** | Owns risk/control definitions. Does not own operational delivery risks in EWM (those remain operational; may map to EGCP risks). |
| **Module Responsibilities** | Catalogue, taxonomy, process mapping, residual risk scoring model (definitional). |
| **Future AI Readiness** | AI may propose control mappings and residual risk trends; risk acceptance requires DoA. |

### 5.8 Compliance Intelligence

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Aggregate posture: compliance health, concentration of exceptions, control effectiveness, leading indicators. |
| **Ownership** | EGCP Intelligence Owner. |
| **Relationships** | Reads evaluations, obligations, tests, exceptions; publishes KPIs compatible with V4.1.5 catalogue (additive). |
| **Consumers** | Executives, Compliance Officers, Governance Reporting, Audit Readiness. |
| **Business Events** | `gov.intelligence.posture_updated`, `gov.intelligence.alert_raised`, `gov.intelligence.alert_cleared`. |
| **Governance Boundaries** | Owns derived intelligence. Does not mutate source obligations or override DoA. |
| **Module Responsibilities** | Metrics definitions, alert thresholds, trend models (architecture-level). |
| **Future AI Readiness** | Primary AI surface: narrative briefings, anomaly detection, predictive overdue risk — always advisory. |

### 5.9 Governance Reporting

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Certified report pack for boards, regulators (where applicable), and auditors — distinct from operational/financial report packs. |
| **Ownership** | EGCP Reporting Steward (registers under Reporting Platform; does not redefine frozen packs). |
| **Relationships** | Consumes all EGCP domains; emits immutable report runs to Evidence. |
| **Consumers** | Board, Audit Committee, External auditors, Regulators (via export). |
| **Business Events** | `gov.report.generated`, `gov.report.certified`, `gov.report.distributed`. |
| **Governance Boundaries** | Owns governance report definitions. Does not own IRP5/EMP201 layouts or financial statements. |
| **Module Responsibilities** | Report catalogue, certification metadata, distribution audit. |
| **Future AI Readiness** | AI may draft executive summaries of certified reports; certification remains human/DoA. |

### 5.10 Audit Readiness

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Continuous assessment of whether the organisation can sustain an audit with complete evidence and reconciled controls. |
| **Ownership** | EGCP Audit Readiness Owner + tenant Internal Audit. |
| **Relationships** | Pulls Evidence, Control Testing, Exceptions, Obligations; produces gap register. |
| **Consumers** | Audit Committee, External auditors (read), Compliance Officers. |
| **Business Events** | `gov.audit.readiness_scored`, `gov.audit.gap_opened`, `gov.audit.gap_closed`, `gov.audit.engagement_opened`. |
| **Governance Boundaries** | Owns readiness model & gaps. Does not own financial statement audit opinions. |
| **Module Responsibilities** | Scorecards, workpaper indexes, gap lifecycle. |
| **Future AI Readiness** | AI may prioritise gaps and suggest evidence collection; cannot close gaps without evidence. |

### 5.11 Evidence Repository

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Immutable custody of evidence pointers (and metadata) proving compliance, approvals, filings, and control operation. |
| **Ownership** | EGCP Evidence Custodian (storage may use Document Management; custody rules are EGCP). |
| **Relationships** | Receives from all domains; required by Audit Readiness & Control Testing. |
| **Consumers** | Audit Readiness, Governance Reporting, Compliance Engine (linkage), all modules attaching proofs. |
| **Business Events** | `gov.evidence.registered`, `gov.evidence.sealed`, `gov.evidence.retention_applied`, `gov.evidence.accessed`. |
| **Governance Boundaries** | Owns evidence ledger & retention class. Does not replace Document Management binary storage. |
| **Module Responsibilities** | Hash/seal metadata, chain of custody, retention & legal hold hooks. |
| **Future AI Readiness** | AI may classify and retrieve evidence; sealing and retention override require DoA. |

### 5.12 Control Testing

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Plan, execute, and record tests of control design and operating effectiveness. |
| **Ownership** | EGCP Control Testing Owner + Internal Audit / Control Owners. |
| **Relationships** | Uses Risk & Control Library; writes results to Evidence & Intelligence. |
| **Consumers** | Audit Readiness, Compliance Intelligence, Risk Owners. |
| **Business Events** | `gov.control_test.planned`, `gov.control_test.executed`, `gov.control_test.failed`, `gov.control_test.remediated`. |
| **Governance Boundaries** | Owns test methodology & results. Does not own production transaction execution. |
| **Module Responsibilities** | Test plans, sampling rules (definitional), result grades, remediation tracking. |
| **Future AI Readiness** | AI may suggest sample sets and detect ineffective patterns; test sign-off requires DoA. |

### 5.13 Exception Management

| Aspect | Definition |
|--------|------------|
| **Business Purpose** | Governed handling of breaches, waivers, temporary overrides, and compensating controls. |
| **Ownership** | EGCP Exception Owner; approval via DoA. |
| **Relationships** | Linked to Compliance Engine breaches; constrained by Policy; evidenced; feeds Intelligence. |
| **Consumers** | All modules encountering blocked actions; Audit Readiness. |
| **Business Events** | `gov.exception.requested`, `gov.exception.approved`, `gov.exception.rejected`, `gov.exception.expired`, `gov.exception.compensating_control_linked`. |
| **Governance Boundaries** | Owns exception lifecycle. Cannot silently bypass Legislation (illegal waivers forbidden). |
| **Module Responsibilities** | Request → approve → time-box → expire; mandatory evidence; SoD on self-approval. |
| **Future AI Readiness** | AI may detect exception abuse patterns; cannot approve exceptions. |

---

## 6. Resolution Pattern (canonical)

All consumers follow one pattern:

```
Business Context (company, country, process, amount, effective_date, actors)
  → EGCP Resolve (legislation + policy + obligations + calendar)
  → EGCP Evaluate (compliance + DoA)
  → Decision Outcome (allow / deny / require_approval / conditional)
  → Evidence Link + gov.* events
  → Consumer executes OR blocks OR routes to approval
```

Forbidden pattern:

```
Module embeds local tax constants / approval limits / filing dates  ✗
```

---

## 7. Multi-Country Model

```
Platform Legislation Packs
  └── Country (ZA, …)
        └── Legislative Domain (PAYE, VAT, BCEA, POPIA, …)
              └── Version (effective_from → effective_to)
                    └── Provenance (gazette / source document refs)
```

- Resolution is always `country + domain + effective_date`.  
- South African packs certified under V3.4.x become **content** of the ZA country plugin under EGCP ownership transfer at Implementation Approval.  
- Payroll continues to consume via a thin adapter; formulas remain frozen.

---

## 8. Tenancy & Platform Layers

| Layer | Scope | Examples |
|-------|-------|----------|
| Platform | Cross-tenant published packs | ZA PAYE brackets 2026/27 |
| Tenant | Company-specific | DoA matrix, internal policies, obligation instances |
| Workspace/Process | Optional scoping | Policy applies only to Procurement |

All tenant objects: `company_id NOT NULL`.

---

## 9. Non-Goals (this architecture)

- Implementing Edge Functions, tables, or UI  
- Replacing V4.4.0 change-control governance  
- Changing frozen payroll calculation formulas  
- Posting journals from EGCP  
- Owning employee master data or GL chart of accounts  

---

## 10. Board Decision

The Independent Principal Enterprise Governance Architecture Board certifies this architecture as the **Enterprise Governance & Compliance Platform** core pillar of AdminLess Fin.

**Status:** ENTERPRISE GOVERNANCE PLATFORM ARCHITECTURE CERTIFIED (see deliverable 07).
