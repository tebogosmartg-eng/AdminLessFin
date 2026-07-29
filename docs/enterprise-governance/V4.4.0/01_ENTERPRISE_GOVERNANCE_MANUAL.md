# 01 — Enterprise Governance Manual

**Version:** 4.4.0  
**Status:** CERTIFIED  
**Board:** Independent Principal Enterprise Governance Board  

---

## 1. Purpose

Define how AdminLess Fin may introduce, modify, or retire any enterprise capability over a **10+ year** horizon without losing architectural integrity, freeze guarantees, multi-company isolation, statutory compliance, or certified contracts.

No human developer, AI agent, contractor, or implementation team may bypass this manual.

---

## 2. Governing principles

1. **Certification before code** — Documentation and impact assessment precede implementation.  
2. **One owner per artefact** — Domain / KPI / Event / Edge ownership registers remain authoritative.  
3. **Freeze respect** — Payroll, Accounting, and Enterprise Reporting remain frozen except under approved change classes.  
4. **Additive preferred** — Prefer additive evolution over mutation of certified contracts.  
5. **Backward compatibility** — Preserve practical compatibility; breaking changes require Architecture review.  
6. **Auditability** — Every change is version-controlled, classified, approved, and retained.  
7. **AI compliance** — AI agents are first-class subjects of governance (same gates as humans).  
8. **Rollback readiness** — No production release without a documented rollback path.

---

## 3. Certified artefact classes (immutable without approval)

| Artefact class | Examples |
|----------------|----------|
| Architecture | Enterprise architecture reports, BOE integration model |
| Domain model | Domain entities, ownership, invariants |
| KPI catalogue | V4.1.5 KPI IDs, owners, formulas |
| Business events | V4.3.0 Event IDs, publishers, consumers |
| Edge platform | V4.2.1 lifecycle, CORS/auth/error standards |
| Calculation engines | Statutory payroll engines, legislation registry |
| Database contracts | Migrations, RLS, RPC signatures |
| API / Edge function contracts | Method names, payloads, auth modes |
| UI information architecture | Certified navigation / decision flows |
| Security baselines | AuthZ, secrets, tenant isolation |
| Legislative packs | Tax year legislation modules |
| Governance itself | This V4.4.0 model |

---

## 4. Governance domains (mandatory process per domain)

For **every** domain below, the following fields are certified. Domain-specific owners and boards are in the Approval Matrix (04). Shared defaults apply unless overridden.

### Shared field definitions

| Field | Meaning |
|-------|---------|
| Purpose | Why the domain is governed |
| Owner | Accountable module/steward |
| Approval Board | Authority that may approve |
| Required Artefacts | Docs/evidence before coding |
| Impact Assessment | What must be analysed |
| Backward Compatibility | Compatibility obligation |
| Migration Strategy | How to move safely |
| Documentation Requirements | What must be updated first |
| Testing Requirements | Minimum test bar |
| Rollback Strategy | How to reverse |
| Audit Requirements | What to retain |
| Versioning Rules | How versions advance |
| Deprecation Policy | How to retire |

---

### 4.1 Architecture Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect system shape, boundaries, and freeze planes |
| Owner | Principal Architecture Steward |
| Approval Board | Architecture Board (+ Governance Board for breaking) |
| Required Artefacts | Architecture Decision Record (ADR); impact map; freeze-guard checklist |
| Impact Assessment | Modules touched; event/KPI/edge blast radius; multi-company |
| Backward Compatibility | Required unless Breaking Change class approved |
| Migration Strategy | Phased dual-run or strangler; no big-bang without waiver |
| Documentation | Architecture pack updated **before** code |
| Testing | Architecture conformance + regression of frozen modules |
| Rollback | Revert ADR status; redeploy prior certified revision |
| Audit | ADR ID, approvers, correlation to release |
| Versioning | Platform major when boundaries change |
| Deprecation | Document superseded ADRs; retain 10 years |

### 4.2 Domain Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect entity meaning and ownership |
| Owner | Domain Owner (per Ownership Register) |
| Approval Board | Domain Board; Architecture if cross-domain |
| Required Artefacts | Domain delta report; ownership amendment |
| Impact Assessment | Entities, invariants, foreign keys, events |
| Backward Compatibility | Additive fields preferred; renames = major |
| Migration | Expand → migrate → contract |
| Documentation | Domain model pack before schema/API |
| Testing | Domain invariant tests + multi-company |
| Rollback | Reverse migration with data-safe script |
| Audit | Domain version, approver, entity list |
| Versioning | Domain pack semver |
| Deprecation | Soft-deprecate fields ≥1 major cycle |

### 4.3 Business Rule Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect operational/commercial rules without silent drift |
| Owner | Domain Owner |
| Approval Board | Business Rules Board; Finance if money-affecting |
| Required Artefacts | Rule ID, before/after, examples, freeze check |
| Impact Assessment | KPI, events, calculations, UI copy |
| Backward Compatibility | Historical transactions keep prior rule version |
| Migration | Effective-dated rules; no backdated silent rewrite |
| Documentation | Rules catalogue update first |
| Testing | Rule fixtures + golden cases |
| Rollback | Revert to prior effective-dated version |
| Audit | Rule ID, effectiveFrom/To, actor |
| Versioning | Rule set version per company/tax year as needed |
| Deprecation | Mark superseded; retain history |

### 4.4 KPI Changes

| Field | Certification |
|-------|---------------|
| Purpose | One definition / one calculation owner (V4.1.5) |
| Owner | KPI Owner (Ownership Matrix) |
| Approval Board | Performance Management Board |
| Required Artefacts | KPI ID amendment; formula; owner; alert thresholds |
| Impact Assessment | Dashboards, reports, AI consumers |
| Backward Compatibility | New KPI ID preferred over redefining meaning |
| Migration | Dual-publish old/new IDs during window |
| Documentation | KPI catalogue **before** any consumer change |
| Testing | Formula fixtures; no dashboard-side recompute |
| Rollback | Consumers revert to prior KPI ID |
| Audit | KPI ID, version, approver |
| Versioning | Catalogue pack version |
| Deprecation | Retire ID after dual-publish window |

### 4.5 Calculation Engine Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect statutory/financial correctness |
| Owner | Engine Owner (Payroll Statutory / Accounting) |
| Approval Board | Engine Board + Legislative Board if statute |
| Required Artefacts | Spec delta; golden vectors; certification binder cite |
| Impact Assessment | Tax years, historical payslips/journals |
| Backward Compatibility | Historical periods locked to legislation version |
| Migration | New tax year pack additive; never mutate closed years |
| Documentation | Engine + legislation docs first |
| Testing | Full golden suite + regression baseline (Payroll: `PAYROLL_REGRESSION_BASELINE`) |
| Rollback | Pin prior engine/legislation revision |
| Audit | Engine version, tax year, checksum |
| Versioning | Engine semver + legislation year pack |
| Deprecation | Old year packs retained read-only |

### 4.6 Business Event Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect V4.3.0 catalogue integrity |
| Owner | Event Namespace Owner |
| Approval Board | Integration Board |
| Required Artefacts | Catalogue amendment; publisher/consumer matrices |
| Impact Assessment | Circular deps, duplicates, AI rules |
| Backward Compatibility | Additive metadata = minor; meaning change = new Event ID |
| Migration | Dual-publish major versions per V4.3.0 strategy |
| Documentation | Catalogue updated before publishers |
| Testing | Contract tests; subscriber isolation |
| Rollback | Stop publishing new version; consumers stay on prior |
| Audit | Event ID, version, ownership |
| Versioning | `eventVersion` semver |
| Deprecation | Per Event Versioning Strategy |

### 4.7 Database Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect schema, RLS, multi-company isolation |
| Owner | Data Platform Steward |
| Approval Board | Data Board; Architecture if cross-module |
| Required Artefacts | Migration SQL review; RLS impact; rollback SQL |
| Impact Assessment | Tables, FKs, RLS, performance, historical integrity |
| Backward Compatibility | Expand-contract; no destructive drop without deprecation |
| Migration | Ordered migrations; expand → backfill → contract |
| Documentation | Schema notes + migration purpose before apply |
| Testing | Migration dry-run; RLS tests; integrity queries |
| Rollback | Documented down-migration or restore point |
| Audit | Migration version, approver, apply evidence |
| Versioning | Timestamped migration IDs |
| Deprecation | Columns/tables soft-deprecated ≥1 release |

### 4.8 API Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect external/internal contracts |
| Owner | API Owner (module) |
| Approval Board | Platform Board |
| Required Artefacts | Open contract diff; consumer list |
| Impact Assessment | Breaking fields, auth, pagination |
| Backward Compatibility | Additive preferred; breaking = major |
| Migration | Versioned endpoints or dual fields |
| Documentation | Contract doc before ship |
| Testing | Contract tests + consumer smoke |
| Rollback | Prior API revision deploy |
| Audit | API version, change ticket |
| Versioning | API major.minor |
| Deprecation | Announce ≥1 minor; remove on next major |

### 4.9 Edge Function Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect V4.2.1 execution standard |
| Owner | Edge Platform Steward + Function Owner |
| Approval Board | Platform Board |
| Required Artefacts | Lifecycle conformance checklist; auth mode |
| Impact Assessment | CORS, auth, company isolation, structured errors |
| Backward Compatibility | Method additive preferred; remove = deprecation |
| Migration | Deploy with shared `_shared` platform modules |
| Documentation | Function contract + mode before deploy |
| Testing | OPTIONS/auth/error matrix; tenant isolation |
| Rollback | Redeploy prior function version |
| Audit | Function slug, version, deploy evidence |
| Versioning | Function deploy version + platform version header |
| Deprecation | Method sunset via deprecation header/docs |

### 4.10 UI Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect navigation IA and certified decision flows |
| Owner | Experience Owner + Domain Owner |
| Approval Board | UX/Domain Board; Architecture if IA change |
| Required Artefacts | Screen delta; route map; KPI/event binding list |
| Impact Assessment | Certified nav, KPI IDs, accessibility |
| Backward Compatibility | Routes preserved where certified |
| Migration | Feature flags for major UX |
| Documentation | IA/flow docs before merge |
| Testing | Route regression; no invented KPI maths in UI |
| Rollback | Revert UI build; flag off |
| Audit | PR + approval ticket |
| Versioning | App release version |
| Deprecation | Hide → redirect → remove |

### 4.11 Security Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect authn/z, secrets, tenant isolation |
| Owner | Security Steward |
| Approval Board | Security Board (expedited for Emergency) |
| Required Artefacts | Threat note; blast radius; secret handling |
| Impact Assessment | RLS, JWT, service role, CORS, PII |
| Backward Compatibility | Security fixes may break insecure clients (documented) |
| Migration | Rotate secrets; staged enforce |
| Documentation | Security advisory before/with release |
| Testing | Authz negative tests; tenant isolation |
| Rollback | Prior secure build; never roll back to known vuln without compensating control |
| Audit | Mandatory; retain 10 years |
| Versioning | Security bulletin ID |
| Deprecation | Insecure modes removed ASAP after notice |

### 4.12 AI Capability Changes

| Field | Certification |
|-------|---------------|
| Purpose | Keep AI advisory; prevent mutating SoT |
| Owner | AI Steward |
| Approval Board | AI Governance Board + Integration Board |
| Required Artefacts | Capability card; event inputs; forbidden actions list |
| Impact Assessment | Event catalogue compliance; no DB SoT polling |
| Backward Compatibility | Insights additive |
| Migration | Feature flag; shadow mode |
| Documentation | AI capability + event bindings first |
| Testing | Must not emit forbidden events (`work.time_locked`, `journal.posted`, auto-approve) |
| Rollback | Disable flag |
| Audit | Prompt/version, correlationId, source events |
| Versioning | AI capability semver |
| Deprecation | Retire capability ID after notice |

### 4.13 Reporting Changes

| Field | Certification |
|-------|---------------|
| Purpose | Protect report packs and KPI binding |
| Owner | Reporting Owner |
| Approval Board | Reporting Board; Performance Board if KPI |
| Required Artefacts | Report ID; KPI IDs used; freeze check |
| Impact Assessment | Accounting/Payroll read-only boundaries |
| Backward Compatibility | Snapshot historical reports |
| Migration | New report ID or versioned pack |
| Documentation | Report catalogue first |
| Testing | KPI ID conformance; no local finance invent |
| Rollback | Prior pack version |
| Audit | Report ID, KPI refs |
| Versioning | Pack version |
| Deprecation | Pack sunset with archive |

### 4.14 Legislative Changes

| Field | Certification |
|-------|---------------|
| Purpose | Apply statute without rewriting history |
| Owner | Legislative Steward (Payroll/Tax) |
| Approval Board | Legislative Board |
| Required Artefacts | Source document refs; tax year pack; golden vectors |
| Impact Assessment | Open vs closed periods; certification binder |
| Backward Compatibility | Closed years immutable |
| Migration | Additive year pack; effective dating |
| Documentation | Legislation provenance **before** engine wiring |
| Testing | Golden statutory suite + regression baseline |
| Rollback | Pin previous year pack for open runs only under Board waiver |
| Audit | Provenance, checksum, approver |
| Versioning | Tax year pack ID |
| Deprecation | Prior years read-only forever |

### 4.15 Deprecation Process

| Field | Certification |
|-------|---------------|
| Purpose | Retire capabilities without silent breakage |
| Owner | Owning Board of the artefact |
| Approval Board | Same as introducing the artefact + Governance |
| Required Artefacts | Deprecation notice; consumer list; end date |
| Impact Assessment | All consumers, events, KPIs, APIs |
| Backward Compatibility | Support through announced window |
| Migration | Dual-run → redirect → remove |
| Documentation | Notice in catalogue/manual before code freeze of removal |
| Testing | Consumer migration tests |
| Rollback | Extend window if consumers remain |
| Audit | Notice ID, dates, consumers |
| Versioning | Deprecation aligned to next major where practical |
| Deprecation | Meta: this process governs all other domains |

### 4.16 Versioning Strategy

Covered in detail in [05_VERSIONING_AND_DEPRECATION_STRATEGY.md](./05_VERSIONING_AND_DEPRECATION_STRATEGY.md). Owner: Governance Board. Approval: Governance Board.

### 4.17 Release Certification

Covered in detail in [06_RELEASE_GOVERNANCE_MODEL.md](./06_RELEASE_GOVERNANCE_MODEL.md). Owner: Release Manager. Approval: Release Certification Board.

---

## 5. AI agent binding clause

AI agents (including Cursor agents) MUST:

1. Classify the proposed change under V4.4.0  
2. Refuse implementation when artefacts are uncertified or approval missing  
3. Update documentation **before** code when acting under an Implementation Approval  
4. Never modify frozen Payroll/Accounting/Reporting outside allowed classes  
5. Never invent KPI IDs, Event IDs, or calculation formulas  

Violation = non-compliant change; must be reverted and re-entered through governance.

---

## 6. Relationship to module change control

`PAYROLL_CHANGE_CONTROL.md` (V3.2) remains in force for Payroll maintenance mode and is **subordinate** to this enterprise model. Where conflict exists, **V4.4.0 prevails**, except that Payroll may not be loosened beyond V3.2 without Legislative/Engine Board approval.
