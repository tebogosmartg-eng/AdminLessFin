# 01 — Migration Roadmap

**Pack:** Financial Close Implementation Approval  
**Version:** 6.1.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** APPROVED (strategy)  

---

## 1. Mission

Introduce the Enterprise Financial Close Platform **without disrupting** live Operational Financial Reporting.

```
PRESERVE (forever)
Accounting → Reports / Financial Statements → live IS, BS, CF, TB, Ratios

ADD (phased, flagged)
Accounting → EFCP → Reporting Snapshots → EFRE → statutory packs
```

---

## 2. Non-Negotiables

| Rule | Mandate |
|------|---------|
| Financial Statements under Reports family | Remain |
| Real-time operational updates | Remain |
| Existing routes | Must not break |
| Existing reports | Must not disappear |
| Accounting calculations | Must not move |
| EFCP workspace | New; initially hidden behind feature flag |
| UI redesign of operational FS | Forbidden |

---

## 3. Phase Roadmap

### Phase 1 — Backend integration only

| Attribute | Value |
|-----------|-------|
| Goal | Stand up Close/Snapshot/EFRE **service contracts** behind the flag; optional silent adapters |
| UI | **No UI changes** |
| Navigation | Unchanged |
| Operational Reports | Unchanged behaviour |
| Allowed work | Domain services, snapshot seal APIs (inactive to users), shared fact-read helpers that **call Accounting** (no recalculation), feature-flag plumbing |
| Forbidden | Removing/changing `/financial-statements`, `/reports`, live RPC usage for operational path |
| “Silently consume EFRE services where appropriate” | Means: optional shared export/branding/registry helpers **or** fact-read facades — **never** redirecting live IS/BS to sealed snapshots; never changing operational numbers source |
| Exit gate | Backend builds; flags default OFF; operational regression suite green |

### Phase 2 — Hidden Financial Close workspace

| Attribute | Value |
|-----------|-------|
| Goal | Create Financial Close workspace routes/UI |
| Navigation | **No sidebar item**; no global discovery |
| Access | Developer / internal allowlist only (flag + role) |
| Operational Reports | Untouched |
| Exit gate | Workspace loads under hidden URL for allowlisted users; unflagged users get no UI |

### Phase 3 — Internal testing

| Attribute | Value |
|-----------|-------|
| Goal | Validate Close capabilities end-to-end in non-prod / flagged env |
| Verify | Working Papers · Lead Schedules · Snapshots · Notes · Disclosures · Review Workflow (EFCP + EFRE as certified) |
| Also verify | Operational Reports **still** real-time; routes intact; no calc duplication |
| Exit gate | Test evidence pack; zero Sev-1/2 on operational regression; Close path produces certified snapshot consumed by EFRE in lab |

### Phase 4 — Expose sidebar item

| Attribute | Value |
|-----------|-------|
| Goal | Add sidebar: **Financial Close** |
| Prerequisite | Feature parity & stability confirmed (Phase 3 exit + Release Board sign-off) |
| Flag | Production flag ON only after approval |
| Operational | Reports / Financial Statements remain primary operational path |
| Exit gate | Staged rollout; rollback plan drilled (flag OFF restores prior navigation solely) |

---

## 4. Dependency Order (architecture)

```
Phase 1: Accounting fact-read contracts + flag system + EFCP/EFRE stubs
Phase 2: EFCP workspace UI (flagged)
Phase 3: Snapshot certify → EFRE assemble (flagged lab)
Phase 4: Nav expose
```

EFCP consumes Reporting Snapshots (V6.0.1).  
EFRE consumes EFCP hand-off (V6.1.0).  
Neither replaces Operational Reports.

---

## 5. Explicit Non-Goals

- Migrating all tenants to statutory Close on day one  
- Deprecating `/financial-statements`  
- Redesigning Operational Reports engine  
- Moving PAYE/GL recognition into Close  

---

## 6. Certification

Migration Roadmap is **APPROVED** as the sole phased path for EFCP introduction.
