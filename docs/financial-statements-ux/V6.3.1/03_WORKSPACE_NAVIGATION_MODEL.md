# 03 — Workspace Navigation Model

**Version:** 6.3.1  
**Board:** Independent Principal Enterprise User Experience Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Define navigation **inside** the Financial Statements engagement so users never leave the workspace metaphor for statutory work — and never duplicate Accounting or Reports homes.

---

## 2. Two-Level Navigation

### Level A — Platform (frozen V6.2.1)

| Group | Role |
|-------|------|
| Accounting | Live books + Accounting Reports |
| **Financial Statements** | Enter statutory module → workspace list / create |
| Reports | Enterprise-wide only |
| Assets & Loans | Unchanged |

### Level B — Inside Workspace (this pack)

Contextual engagement chrome (sidebar or stepper **within** the open workspace):

| Nav item | Journeys |
|----------|----------|
| Overview | Landing; all status widgets |
| Setup | J3 Framework; J4 Snapshot |
| Close & Evidence | J5 WPs; J6 Leads; tasks |
| Statements | J7 |
| Notes | J8 |
| Disclosures | J9 |
| Validation | J10–J11 |
| Reviews | J12–J13 |
| Publication | J14–J15 |

---

## 3. Navigation Rules

| Rule | Mandate |
|------|---------|
| One engagement context | Period/Entity/Framework always visible in chrome |
| Progress-aware | Incomplete prerequisites dim or guide next step (soft gating) |
| Deep links | Validation findings open target artefact **inside** workspace |
| Exit to Accounting | Allowed for posting Audit Adjustments — return via Recent Activity / task |
| Exit to Reports | Not required for statutory pack; no statutory child under Reports |
| No duplicate | No “Live P&L” item inside Financial Statements workspace |

---

## 4. Soft Gating (UX, not architecture change)

| Destination | Preferred prerequisite |
|-------------|------------------------|
| Statements generate | Snapshot certified |
| Validation | Statements/Notes/Disclosures draft present |
| Manager Review | Validation blocking pass + readiness |
| Partner Review | Manager approved (when required) |
| Publish | Partner/publication approve + freeze |

Users may browse ahead in read-only/preview where useful; **actions** that mutate publish path respect gates.

---

## 5. Certification

Workspace Navigation Model is **CERTIFIED**.
