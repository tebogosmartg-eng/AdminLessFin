# 02 — Change Control Framework

**Version:** 4.4.0  
**Status:** CERTIFIED  

---

## 1. Purpose

Classify every proposed change and bind it to approval authority, evidence, testing, release, and rollback requirements.

---

## 2. Change classes

### 2.1 Emergency Changes

| Field | Rule |
|-------|------|
| Definition | Production outage, data loss risk, active security exploit, statutory filing blocker |
| Approval Authority | Security Board and/or Platform Board (single on-call approver + post-facto Governance review ≤72h) |
| Required Evidence | Incident ID; root cause note; blast radius; freeze-guard check |
| Testing Threshold | Minimal focused verification + post-deploy full regression within 72h |
| Release Requirements | Expedited deploy; change ticket mandatory |
| Rollback Requirements | Immediate rollback plan executed on failure |

### 2.2 Minor Changes

| Field | Rule |
|-------|------|
| Definition | Additive non-breaking; docs clarifications; non-behavioural refactors inside module; defect fixes without contract change |
| Approval Authority | Domain Owner (or Platform Steward for edge/shared) |
| Required Evidence | Ticket; short impact note; doc delta if contract-facing |
| Testing Threshold | Unit/contract tests for touched area + smoke |
| Release Requirements | Standard CI green |
| Rollback Requirements | Revert commit / redeploy prior |

### 2.3 Major Changes

| Field | Rule |
|-------|------|
| Definition | New capability; new Event/KPI/API method; schema expand; cross-module consumer |
| Approval Authority | Domain Board + affected artefact boards |
| Required Evidence | Full impact assessment; artefacts updated first; test plan |
| Testing Threshold | Module regression + multi-company + consumer smoke |
| Release Requirements | Release Certification checklist |
| Rollback Requirements | Feature flag or prior revision |

### 2.4 Architecture Changes

| Field | Rule |
|-------|------|
| Definition | Boundary, ownership, platform lifecycle, integration topology |
| Approval Authority | Architecture Board + Governance Board |
| Required Evidence | ADR; conformance plan; freeze impact |
| Testing Threshold | Architecture conformance + frozen-module regression |
| Release Requirements | Staged rollout |
| Rollback Requirements | Prior architecture revision + dual-run unwind |

### 2.5 Breaking Changes

| Field | Rule |
|-------|------|
| Definition | Removes/renames contracts; changes event/KPI meaning; breaks clients |
| Approval Authority | Architecture Board + Governance Board + owning Domain Board |
| Required Evidence | Consumer inventory; migration window; dual-publish plan |
| Testing Threshold | Full consumer matrix + compatibility suite |
| Release Requirements | Major version bump; deprecation completed or waiver |
| Rollback Requirements | Dual-publish retained until stable |

### 2.6 Legislative Changes

| Field | Rule |
|-------|------|
| Definition | Tax/labour statute updates; new tax year packs |
| Approval Authority | Legislative Board (+ Engine Board) |
| Required Evidence | Source docs; provenance; golden vectors; closed-year immutability proof |
| Testing Threshold | Full statutory golden suite + payroll regression baseline |
| Release Requirements | Certification binder update |
| Rollback Requirements | Pin prior legislation pack for open periods only with waiver |

### 2.7 Security Changes

| Field | Rule |
|-------|------|
| Definition | Authn/z, secrets, RLS, vulnerability remediation |
| Approval Authority | Security Board |
| Required Evidence | Threat note; negative test plan |
| Testing Threshold | Authz isolation tests; secret scan |
| Release Requirements | Security bulletin when user-impacting |
| Rollback Requirements | Compensating controls if rollback unsafe |

### 2.8 Platform Changes

| Field | Rule |
|-------|------|
| Definition | Edge platform shared modules; governance model; event/KPI catalogues; BOE dispatcher contracts |
| Approval Authority | Platform / Integration / Governance Boards as applicable |
| Required Evidence | Conformance matrix; fleet impact |
| Testing Threshold | Platform OPTIONS/auth/error matrix; sample of tenant functions |
| Release Requirements | Platform version header/docs bump |
| Rollback Requirements | Redeploy prior shared module revision |

---

## 3. Universal gates (all classes)

| Gate | Rule |
|------|------|
| G1 | Change classified before work starts |
| G2 | Certified artefacts not modified without approval |
| G3 | Documentation updated before implementation (Emergency: docs within 72h) |
| G4 | Freeze modules protected |
| G5 | Multi-company isolation preserved |
| G6 | Audit trail recorded |
| G7 | AI agents subject to same gates |

---

## 4. Prohibited without governance

- Silent redesign of frozen Payroll / Accounting / Reporting  
- Inventing KPI IDs or Event IDs  
- Bypassing Edge Platform lifecycle  
- AI auto-emitting mutating domain events  
- Destructive schema drops without deprecation  
- Production hotfix without incident ticket (even Emergency)
