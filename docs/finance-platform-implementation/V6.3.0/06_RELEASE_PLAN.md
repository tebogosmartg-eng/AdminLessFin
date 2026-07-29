# 06 — Release Plan

**Board:** Independent Principal Enterprise Implementation Board  
**Version:** 6.3.0  
**Verdict:** APPROVED  

---

## 1. Release Trains

| Release | Content | Audience |
|---------|---------|----------|
| **R1** | Phase 1 complete | All tenants (nav move; routes preserved) |
| **R2** | Phase 2 | Flag OFF prod; allowlist non-prod / internal |
| **R3** | Phase 3 | Flagged staging → limited pilot |
| **R4** | Phase 4 | Staged sidebar expose → general; then flag certification |

Each Rn requires Suite A–D green. R2+ require Suite E. All require Suite F.

---

## 2. Environments

| Env | Phase 1 | Phase 2–3 | Phase 4 |
|-----|---------|-----------|---------|
| Dev | ON | Flags ON allowlist | Nav experiment |
| Staging | Full | Full flagged E2E | Staged nav |
| Production | R1 after gate | Flags default OFF | R4 after board |

---

## 3. Feature Flag Schedule

| Flag | R1 | R2 | R3 | R4 entry | Post-cert |
|------|----|----|----|----------|-----------|
| Flag plumbing | Deploy | — | — | — | Keep kill ability |
| `efs.workspace` / `efcp.workspace_ui` | OFF | Allowlist | Staging ON | Cohort ON | Certified ON |
| `efs.nav` / `efcp.nav_sidebar` | OFF | OFF | OFF | Staged ON | ON |
| Snapshot pipeline | OFF | OFF | ON flagged | ON | ON |

---

## 4. Communications

| Release | Message |
|---------|---------|
| R1 | “Live financial statements are under Accounting → Accounting Reports. Bookmarks still work.” |
| R4 | “Financial Statements module available for statutory close & publication.” |

---

## 5. Rollback SLA

| Severity | Action |
|----------|--------|
| Live FS broken | Immediate revert R1 nav or hotfix; Accounting RPC path first |
| FS module defect | Flags OFF &lt; 15 min target |
| Calc duplication found | Stop Phase 3/4; restore snapshot-only rule |

---

## 6. Citation on Every PR / Release

PRs and releases **must cite:** V6.3.0 + applicable V6.0.0 / V6.0.1 / V6.1.0 / V6.1.1 / V6.2.1 + V4.4.0 change class.

---

## 7. Certification

Release Plan is **APPROVED**.
