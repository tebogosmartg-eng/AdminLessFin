# 01 — Implementation Roadmap

**Board:** Independent Principal Enterprise Implementation Board  
**Version:** 6.3.0  
**Verdict:** APPROVED  

---

## 1. Mission

Execute the certified Finance Architecture without deviation: move live statement presentation under Accounting, introduce Financial Statements as a new top-level module (flagged), preserve Reports as enterprise reporting, leave Assets & Loans unchanged.

```
Accounting ──live──► Accounting Reports (TB/IS/BS/CF/Ratios/GL)
     │
     └──► Snapshots ──► Financial Statements (Close → EFRE Publication)

Reports ──► Executive / Operational analytics / domain reports (no live FS five)
Assets & Loans ── unchanged
```

---

## 2. Implementation Rules (locked)

| Rule | Mandate |
|------|---------|
| Redesign Accounting | **NO** |
| Redesign Reports | **NO** |
| Redesign Assets & Loans | **NO** |
| Create Financial Statements top-level module | **YES** (new) |
| Accounting Reports inside Accounting | **YES** |
| Operational Reports inside Reports | **YES** (analytics only) |
| FS consumes Reporting Snapshots only | **YES** |
| Operational/Accounting live consume live Accounting balances | **YES** |
| Backwards compatibility | **COMPLETE** |

---

## 3. Phases

### Phase 1 — Accounting Reports home

| Item | Detail |
|------|--------|
| Scope | Move live accounting reports into **Accounting → Accounting Reports** |
| Behaviour | Live TB/IS/BS/CF/Ratios/GL remain real-time Accounting facts |
| Routes | Maintain existing paths via **compatibility redirects** where nav moves |
| Reports | Strip conceptual ownership of live FS five; keep Operational analytics |
| Flags | Introduce `efcp.*` / `efs.*` flag plumbing (defaults OFF for FS module) |
| Forbidden | Calculation moves; Routes deleted; Reports redesign; Assets changes |
| Exit gate | Live reports reachable under Accounting nav; old URLs work; regression green |

### Phase 2 — Hidden Financial Statements workspace

| Item | Detail |
|------|--------|
| Scope | Create **Financial Statements** top-level module shell + Close workspace |
| Visibility | Feature flag only; **no sidebar** |
| Access | Developer / allowlist |
| Forbidden | Public nav; changing Accounting Reports behaviour |
| Exit gate | Hidden routes load for allowlist; unflagged users unaffected |

### Phase 3 — Snapshot & Close evidence & workspace depth

| Item | Detail |
|------|--------|
| Scope | Reporting Snapshot consumption; Working Papers; Lead Schedules; Reporting Workspace / Periods; Mapping / Notes / Disclosures / Validation / Review wiring (behind flag) |
| Authority | Statutory path only; live path untouched |
| Exit gate | Lab path: seal snapshot → WP/Lead lock → EFRE assembly gates; no calc duplication |

### Phase 4 — Expose Financial Statements

| Item | Detail |
|------|--------|
| Scope | Sidebar **Financial Statements**; remove feature flag after certification |
| Prerequisite | Phase 3 quality gates + Release Board certification |
| Exit gate | Flag OFF path certified; ops + accounting live regression still green |

---

## 4. Quality Gates (every phase)

| Gate | Required |
|------|----------|
| No broken routes | ✓ |
| No duplicated calculations | ✓ |
| No duplicated reports | ✓ |
| Accounting = financial authority | ✓ |
| Financial Statements = statutory authority | ✓ |
| Reports = enterprise reporting authority | ✓ |
| Operational functionality preserved | ✓ |
| No user regression | ✓ |

---

## 5. Out of Scope

- Framework pack content authoring UI polish beyond certified engines  
- Assets & Loans feature work  
- EGCP implementation  
- Redesign of payroll/VIP report engines  

---

## 6. Certification

Implementation Roadmap is **APPROVED**.
