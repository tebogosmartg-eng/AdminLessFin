# 05 — Business Event Catalogue

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  
**Prerequisite:** Enterprise Business Event Platform V4.3.0 — CERTIFIED  
**Verdict:** CERTIFIED  

---

## 1. Namespace

| Item | Value |
|------|-------|
| Namespace | `fre.*` |
| Owner | Enterprise Financial Reporting Engine |
| Registration | Additive under V4.3.0 Event Ownership Register |
| Constraint | Must not redefine frozen `journal.*`, `period.*`, `payroll.*`, `gov.*`, or `work.*` semantics |

---

## 2. Catalogue

### 2.1 Framework Management

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `fre.framework.pack_published` | New Framework Pack version published | framework_key, version_id, provenance | Mapping stewards, Validation, XBRL |
| `fre.framework.version_activated` | Pack version becomes active | framework_key, version_id, effective_from | Binding resolvers |
| `fre.framework.binding_set` | Tenant binds entity/period to pack | company_id, entity_id, period_key, version_id | Period case, Mapping |

### 2.2 Mapping

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `fre.mapping.published` | ChartMappingSet published | mapping_set_id, version_id, framework_version_id | Statement, Validation |
| `fre.mapping.superseded` | Mapping version replaced | from_version, to_version | Period cases on draft packs |

### 2.3 Accounting Policy (presentation)

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `fre.policy.set_published` | AccountingPolicySet published | policy_set_id, version_id | Statement, Notes, Disclosure |

### 2.4 Period Case & Assembly

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `fre.period.case_opened` | ReportingPeriodCase opened | case_id, entity_id, period_key | Preparers, Audit |
| `fre.facts.sealed` | FactSnapshotSeal created | case_id, seal_id, accounting_period_ref | Statement, Comparative, Validation |
| `fre.statements.generated` | Statement Instances assembled | case_id, statement_types[] | Notes, Validation, Review |
| `fre.disclosures.assembled` | Disclosure Instances ready | case_id, counts | Validation, Review |
| `fre.notes.assembled` | Note Instances ready | case_id, note_codes[] | CrossRef, Validation, Review |

### 2.5 Quality

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `fre.materiality.decided` | Materiality decision recorded | case_id, decision_id, profile_id | Disclosure, Statement aggregation |
| `fre.validation.passed` | ValidationRun blocking pass | case_id, run_id | Review Workflow |
| `fre.validation.failed` | ValidationRun blocking fail | case_id, run_id, finding_refs | Preparers, Accounting (if GL) |

### 2.6 Review Workflow

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `fre.review.submitted` | Pack submitted for review | case_id, preparer_id | Reviewers, EGCP DoA hooks |
| `fre.review.approved` | Pack approved | case_id, approver_id | Publication |
| `fre.review.rejected` | Pack returned | case_id, reason | Preparers |

### 2.7 Publication & Version Control

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `fre.pack.published` | PublishedPackVersion sealed | edition_id, content_hash, seal_id | Archives, EGCP obligations, Board, V3.6 export |
| `fre.pack.restated` | Restatement edition published | edition_id, restates_edition_id | Comparative, Auditors, Disclosure |
| `fre.pack.superseded` | Edition marked superseded | from_edition, to_edition | Archives, Consumers |
| `fre.xbrl.export_ready` | XBRL-ready artefact available | edition_id, taxonomy_version | Future filing gateway |

---

## 3. Upstream Events Consumed (not owned)

| Event ID | Owner | EFRE use |
|----------|-------|----------|
| `period.closed` | Accounting (frozen) | Trigger or enable FactSnapshotSeal |
| `journal.posted` | Accounting (frozen) | Must **not** be used as sole publish source; live only for operational preview |
| `gov.doa.approved` / `gov.doa.rejected` | EGCP | Gate approve/publish when DoA bound |
| `gov.calendar.deadline_*` | EGCP | Filing reminder for published packs |
| `gov.obligation.*` | EGCP | Bind publication evidence to obligations |

---

## 4. Ownership Registration (additive)

When Implementation Approval proceeds, V4.3.0 Event Ownership Register shall add:

| Namespace | Owner | State |
|-----------|-------|-------|
| `fre.*` | Enterprise Financial Reporting Engine | **ACTIVE** (additive; not frozen until separately board-frozen) |

Frozen namespaces remain untouched: `journal.*`, `period.*`, `payroll.*`, `work.*`, `gov.*`.

---

## 5. AI Constraints on Events

| Allowed | Forbidden |
|---------|-----------|
| Subscribe to `fre.*` for advisory insights | Emit `fre.facts.sealed`, `fre.review.approved`, `fre.pack.published` |
| Propose draft note/disclosure content out-of-band | Emit mutating assembly events as SoT without human/system steward |

---

## 6. Certification

Business Event Catalogue (`fre.*`) is **CERTIFIED** for additive registration under V4.3.0. Physical publishers/subscribers are out of scope until Implementation Approval.
