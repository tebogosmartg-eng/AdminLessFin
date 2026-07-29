# 02 — Sprint Breakdown

**Board:** Independent Principal Enterprise Implementation Board  
**Version:** 6.3.0  
**Verdict:** APPROVED  

Sprints are planning units for implementation teams. Durations illustrative (adjust capacity; do not reorder phases).

---

## Phase 1 — Sprints

### Sprint 1.1 — Feature flags & navigation shell

| Work | Notes |
|------|-------|
| Flag keys (`efs.module`, `efcp.*` per V6.1.1) | Default OFF for FS |
| Accounting nav group: **Accounting Reports** submenu | Certified V6.2.1 |
| Move/relabel live FS nav entries under Accounting | No calc change |
| Compatibility redirects for prior Reports paths | Keep bookmarks |
| Regression: live IS/BS/CF/TB/Ratios | Must pass |

### Sprint 1.2 — Reports cleanup & GL alignment

| Work | Notes |
|------|-------|
| Reports Operational: ensure no second home for live FS five | Labels/IA only |
| GL inquiry under Accounting Reports | Single presentation |
| Dashboard/Command Menu deep-links update | Shortcuts OK |
| Docs / help pointers | Dual-track messaging |
| Exit Phase 1 | Gate sign-off |

---

## Phase 2 — Sprints

### Sprint 2.1 — Financial Statements module scaffold

| Work | Notes |
|------|-------|
| Top-level module routes `/financial-statements-workspace` or `/financial-close` per V6.1.1 | Flag-gated |
| Empty workspace shell + period/entity context | No public nav |
| Allowlist access | Developer only |

### Sprint 2.2 — Close workspace MVP (hidden)

| Work | Notes |
|------|-------|
| Close Workspace entity/period | EFCP V6.1.0 |
| Checklist/tasks stub | Minimal |
| Hidden URL QA | Flag matrix |
| Exit Phase 2 | Gate sign-off |

---

## Phase 3 — Sprints

### Sprint 3.1 — Reporting Snapshots

| Work | Notes |
|------|-------|
| Fact Snapshot seal from Accounting RPCs | V6.0.1 — no live GL publish |
| Snapshot Version / freeze stubs | Flagged |
| Hand-off contract to EFRE | |

### Sprint 3.2 — Working Papers & Lead Schedules

| Work | Notes |
|------|-------|
| WP CRUD + snapshot link rule | V6.1.0 |
| Lead schedule prepare/lock | Traceable to facts |
| Blocking issues minimal | |

### Sprint 3.3 — Reporting Workspace depth

| Work | Notes |
|------|-------|
| Reporting Periods / Workspace | |
| Mapping / Notes / Disclosures / Validation / Review hooks | EFRE V6.0.0 behind flag |
| Internal E2E script | Snapshot → assemble |
| Exit Phase 3 | Gate sign-off |

---

## Phase 4 — Sprints

### Sprint 4.1 — Sidebar expose (staged)

| Work | Notes |
|------|-------|
| Financial Statements sidebar item | `efs.nav` / `efcp.nav_sidebar` ON staged |
| Role entitlements | |
| Monitoring / rollback drill | Flag OFF |

### Sprint 4.2 — Flag removal certification

| Work | Notes |
|------|-------|
| Production certification pack | Evidence |
| Remove temporary flags after board certify | Keep kill-switch policy as needed |
| Exit Phase 4 | Master close-out |

---

## Parallel (any phase — careful)

| Stream | Rule |
|--------|------|
| Accounting bugfixes | Allowed if no ownership change |
| Reports domain reports | Allowed if no live FS absorption |
| Assets & Loans | Unchanged — no FS work |

---

## Certification

Sprint Breakdown is **APPROVED**.
