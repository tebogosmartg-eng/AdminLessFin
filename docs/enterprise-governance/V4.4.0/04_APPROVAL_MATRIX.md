# 04 — Approval Matrix

**Version:** 4.4.0  
**Status:** CERTIFIED  

---

## 1. Boards (roles)

| Board | Mandate |
|-------|---------|
| Governance Board | Enterprise model, deprecation policy, breaking waivers |
| Architecture Board | Boundaries, ADRs, platform topology |
| Domain Board | Domain model & business rules for a module |
| Performance Management Board | KPI catalogue |
| Integration Board | Business events, publishers/consumers |
| Platform Board | Edge platform, APIs, shared runtime |
| Data Board | Schema, RLS, migrations |
| Security Board | Authn/z, secrets, vulns |
| Legislative Board | Statute packs |
| Engine Board | Calculation engines |
| Reporting Board | Report packs |
| AI Governance Board | AI capabilities |
| UX/Domain Board | UI IA and flows |
| Release Certification Board | Go/no-go for production release |

Module-specific stewards (Payroll Owner, EWM Owner, etc.) act within Domain Board.

---

## 2. Matrix: change class × required approvals

| Change class | Primary approval | Additional required |
|--------------|------------------|---------------------|
| Emergency | Security and/or Platform on-call | Governance post-facto ≤72h |
| Minor | Domain Owner / Platform Steward | — |
| Major | Domain Board | Affected artefact boards (KPI/Event/Data/…) |
| Architecture | Architecture Board | Governance Board |
| Breaking | Architecture + Governance + Domain | Consumer owners acknowledge |
| Legislative | Legislative Board | Engine Board |
| Security | Security Board | Platform if edge/auth shared |
| Platform | Platform Board | Integration if events; Governance if model |

---

## 3. Matrix: governance domain × approval board

| Governance domain | Approval Board |
|-------------------|----------------|
| Architecture Changes | Architecture (+ Governance if breaking) |
| Domain Changes | Domain (+ Architecture if cross-domain) |
| Business Rule Changes | Domain (+ Finance/Engine if money/statute) |
| KPI Changes | Performance Management |
| Calculation Engine Changes | Engine (+ Legislative if statute) |
| Business Event Changes | Integration |
| Database Changes | Data (+ Architecture if cross-module) |
| API Changes | Platform |
| Edge Function Changes | Platform |
| UI Changes | UX/Domain (+ Architecture if IA) |
| Security Changes | Security |
| AI Capability Changes | AI Governance (+ Integration) |
| Reporting Changes | Reporting (+ Performance if KPI) |
| Legislative Changes | Legislative (+ Engine) |
| Deprecation Process | Owning board + Governance |
| Versioning Strategy | Governance |
| Release Certification | Release Certification Board |

---

## 4. AI agent approval rule

An AI agent may **prepare** artefacts and drafts. It may **not** self-approve Implementation Approval. Human (or designated board role) approval is mandatory except Emergency on-call path.
