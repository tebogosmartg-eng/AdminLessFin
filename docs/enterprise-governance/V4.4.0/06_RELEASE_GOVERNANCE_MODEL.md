# 06 — Release Governance Model

**Version:** 4.4.0  
**Status:** CERTIFIED  

---

## 1. Purpose

Ensure no production release proceeds without classification, approvals, evidence, and rollback readiness.

---

## 2. Release types

| Type | Typical class | Cadence |
|------|---------------|---------|
| Hotfix | Emergency / Security | As needed |
| Maintenance | Minor / Legislative / Security | Planned |
| Feature | Major | Planned |
| Platform | Platform / Architecture | Planned |
| Statutory | Legislative | Per tax authority calendar |

---

## 3. Release Certification checklist (mandatory)

| # | Check | Owner |
|---|-------|-------|
| R1 | Change class recorded | Release Manager |
| R2 | Implementation Approval cites V4.4.0 | Approver |
| R3 | Docs updated before/with merge (Emergency: ≤72h) | Domain Owner |
| R4 | Freeze guards verified (Payroll/Accounting/Reporting) | Domain Owners |
| R5 | Edge Platform conformance (if edge touched) | Platform Steward |
| R6 | Event/KPI IDs only from certified catalogues | Integration / Performance |
| R7 | Tests meet class threshold; evidence linked | QA / Owner |
| R8 | Multi-company isolation verified if data/API touched | Data/Platform |
| R9 | Rollback plan documented and rehearsed where practical | Release Manager |
| R10 | Security scan / secret check for relevant changes | Security |
| R11 | CI green (build, types, tests as applicable) | Engineering |
| R12 | Release ID + artefact versions recorded | Release Manager |

**No release may be marked CERTIFIED FOR PRODUCTION without R1–R12.**

---

## 4. Payroll-specific overlay

When Payroll is touched, additionally enforce `PAYROLL_CHANGE_CONTROL.md` gates:

- Build / TypeScript / Test pass  
- Baseline E2E certification pass  
- Regression baseline scenario pass  

---

## 5. Rollback model

| Situation | Action |
|-----------|--------|
| Functional regression | Redeploy prior version; feature flag off |
| Data migration failure | Execute rollback SQL / restore point |
| Security vulnerability introduced | Forward-fix preferred; rollback only with compensating control |
| Legislative error in open year | Pin prior pack under Legislative Board waiver |

---

## 6. Post-release

- Audit entry within 24h  
- Emergency: Governance review within 72h  
- Update release manifest / certification evidence as required by module
