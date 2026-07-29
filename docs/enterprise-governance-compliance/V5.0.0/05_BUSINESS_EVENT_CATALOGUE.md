# 05 — Business Event Catalogue

**Pillar:** Enterprise Governance & Compliance Platform (EGCP)  
**Version:** 5.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Governance Architecture Board  
**Prerequisite:** Enterprise Business Event Platform V4.3.0 — CERTIFIED  
**Verdict:** CERTIFIED  

---

## 1. Namespace

| Item | Value |
|------|-------|
| Namespace | `gov.*` |
| Owner | Enterprise Governance & Compliance Platform |
| Registration | Additive under V4.3.0 Event Ownership Register |
| Constraint | Must not redefine frozen `payroll.*`, `accounting.*`, or `work.*` semantics |

---

## 2. Catalogue

### 2.1 Legislation

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.legislation.pack_published` | New pack published | country, domains, version_id, provenance | Compliance, Calendar, Payroll adapter stewards |
| `gov.legislation.version_activated` | Version becomes active | domain, version_id, effective_from | Payroll, Accounting, Obligations |
| `gov.legislation.version_deprecated` | Version deprecated | domain, version_id, successor_id | All resolvers |

### 2.2 Compliance

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.compliance.evaluated` | Evaluation sealed | evaluation_id, decision, context_ref | Evidence, Intelligence, source module |
| `gov.compliance.breach_detected` | Fail outcome | evaluation_id, severity, rule_refs | Exception, Intelligence, Audit |
| `gov.compliance.cleared` | Breach remediated | evaluation_id, clearance_ref | Intelligence, Audit |

### 2.3 Policy

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.policy.published` | Policy version published | policy_key, version_id | All process modules |
| `gov.policy.amended` | Superseding version | policy_key, from_version, to_version | Consumers of policy |
| `gov.policy.retired` | Policy retired | policy_key, version_id | Consumers |
| `gov.policy.acknowledged` | User/org acknowledgement | policy_key, actor_id | Audit, Evidence |

### 2.4 Delegation of Authority

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.doa.matrix_published` | Matrix activated | matrix_id, effective_from | All modules using approvals |
| `gov.doa.authority_granted` | Rule grant | actor, action_type, limit | Audit |
| `gov.doa.authority_revoked` | Rule revoke | actor, action_type | Audit, modules |
| `gov.doa.evaluation_required` | Approval needed | context_ref, required_approvers | Workflow UIs |
| `gov.doa.approved` | Authority exercised | decision_id, actor, context_ref | Source module, Evidence |
| `gov.doa.rejected` | Authority denied | decision_id, actor, reason | Source module, Intelligence |

### 2.5 Statutory Calendar

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.calendar.period_opened` | Period starts | jurisdiction, period_key | Obligations, modules |
| `gov.calendar.deadline_approaching` | Threshold before due | entry_id, due_at, remaining | Notifications, Intelligence |
| `gov.calendar.deadline_missed` | Due passed unsatisfied | entry_id, obligation_id | Exception, Intelligence |
| `gov.calendar.obligation_completed` | Linked obligation done | entry_id, obligation_id | Intelligence, Reporting |

### 2.6 Regulatory Obligations

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.obligation.created` | Obligation instantiated | obligation_id, type | Calendar, owners |
| `gov.obligation.assigned` | Owner set | obligation_id, owner_id | Notifications |
| `gov.obligation.status_changed` | Lifecycle change | obligation_id, from, to | Intelligence |
| `gov.obligation.satisfied` | Completed with evidence | obligation_id, evidence_ids | Calendar, Audit |
| `gov.obligation.overdue` | Past due | obligation_id, due_at | Exception, Intelligence |

### 2.7 Risk & Control

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.risk.registered` | Risk added | risk_id, category | Intelligence |
| `gov.risk.reassessed` | Scores changed | risk_id, inherent, residual | Intelligence, Audit |
| `gov.control.defined` | Control created | control_id, objective | Control Testing |
| `gov.control.mapped` | Mapped to process/risk | control_id, targets | Modules, Audit |
| `gov.control.retired` | Control retired | control_id | Testing, Intelligence |

### 2.8 Compliance Intelligence

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.intelligence.posture_updated` | Posture recalculated | company_id, score_dims | Exec dashboard, Reporting |
| `gov.intelligence.alert_raised` | Alert opened | alert_id, severity, topic | Compliance Officer |
| `gov.intelligence.alert_cleared` | Alert closed | alert_id | Compliance Officer |

### 2.9 Governance Reporting

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.report.generated` | Report run created | report_id, pack_key | Evidence |
| `gov.report.certified` | Report certified | report_id, certifier | Distribution |
| `gov.report.distributed` | Sent to audience | report_id, audience | Audit |

### 2.10 Audit Readiness

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.audit.readiness_scored` | Score computed | case_id, score | Intelligence, Board |
| `gov.audit.gap_opened` | Gap registered | gap_id, severity | Remediation owners |
| `gov.audit.gap_closed` | Gap closed | gap_id, evidence_ids | Intelligence |
| `gov.audit.engagement_opened` | Audit engagement | engagement_id | Evidence freeze hooks |

### 2.11 Evidence

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.evidence.registered` | Evidence logged | evidence_id, links | Audit, modules |
| `gov.evidence.sealed` | Immutable seal applied | evidence_id, hash | Audit |
| `gov.evidence.retention_applied` | Retention class set | evidence_id, class | DMS |
| `gov.evidence.accessed` | Access audited | evidence_id, actor | Security, Audit |

### 2.12 Control Testing

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.control_test.planned` | Test planned | test_id, control_id, period | Owners |
| `gov.control_test.executed` | Test completed | test_id, result | Intelligence |
| `gov.control_test.failed` | Failed result | test_id, findings | Exception, Remediation |
| `gov.control_test.remediated` | Failure remediated | test_id, evidence_ids | Audit Readiness |

### 2.13 Exception Management

| Event ID | When | Payload (logical) | Typical consumers |
|----------|------|-------------------|-------------------|
| `gov.exception.requested` | Waiver/breach case opened | exception_id, type | DoA workflow |
| `gov.exception.approved` | Approved | exception_id, expires_at | Source module |
| `gov.exception.rejected` | Rejected | exception_id, reason | Source module |
| `gov.exception.expired` | Time-box ended | exception_id | Source module, Intelligence |
| `gov.exception.compensating_control_linked` | Compensating control | exception_id, control_id | Audit |

---

## 3. Versioning

- Event IDs are stable under V5.0.0.  
- Payload evolution follows V4.3.0 Event Versioning Strategy (additive fields preferred).  
- Breaking event changes require V4.4.0 Breaking + Integration boards.

---

## 4. Certification

`gov.*` Business Event Catalogue is **CERTIFIED** for registration under the Enterprise Business Event Platform. Implementation of publishers/subscribers remains prohibited until Implementation Approval.
