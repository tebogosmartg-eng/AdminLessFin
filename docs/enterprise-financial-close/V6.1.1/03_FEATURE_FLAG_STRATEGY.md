# 03 — Feature Flag Strategy

**Pack:** Financial Close Implementation Approval  
**Version:** 6.1.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** APPROVED (strategy)  

---

## 1. Purpose

Ensure Financial Close remains **hidden** until Release Board phase gates pass, and provide an instant rollback that does not affect Operational Reports.

No platform-wide feature-flag system is assumed today — Phase 1 **introduces** flag plumbing as approved implementation work (plan now; code later).

---

## 2. Flag Catalogue

| Flag key | Default | Purpose |
|----------|---------|---------|
| `efcp.enabled` | **OFF** | Master switch for Close platform runtime |
| `efcp.workspace_ui` | **OFF** | Mount Close routes / pages |
| `efcp.nav_sidebar` | **OFF** | Show “Financial Close” sidebar item |
| `efcp.allowlist_users` | empty / env | Developer access when UI on but nav off |
| `efcp.snapshot_pipeline` | **OFF** | Enable certify/freeze/hand-off pipeline |
| `efre.statutory_assembly` | **OFF** | Enable EFRE statement assembly from snapshots |
| `efcp.silent_backends` | **OFF→ON in Phase 1 lab** | Backend services deployable without UI |

Operational Reports have **no** kill flag. They must not depend on `efcp.*`.

---

## 3. Phase Mapping

| Phase | Flags |
|-------|-------|
| 1 | `efcp.silent_backends` may ON in non-prod; all UI/nav flags OFF in prod |
| 2 | `efcp.enabled` + `efcp.workspace_ui` ON for allowlisted users only; `efcp.nav_sidebar` OFF |
| 3 | `efcp.snapshot_pipeline` + `efre.statutory_assembly` ON in test/staging; nav still OFF |
| 4 | `efcp.nav_sidebar` ON after Release Board sign-off; staged tenant cohorts optional |

---

## 4. Evaluation Rules

1. Flag evaluation at Edge/API and frontend route guards independently (defence in depth).  
2. When `efcp.workspace_ui` OFF → Close routes unavailable.  
3. When `efcp.nav_sidebar` OFF → no sidebar entry even if route exists for allowlist.  
4. Backend Close APIs: reject or no-op for non-allowlisted when `efcp.enabled` OFF — **must not** alter Accounting or `/reports` handlers.  
5. Silent Phase 1 adapters on operational path: only permitted if **behaviour-identical**; prefer zero coupling until Phase 3.

---

## 5. Rollback

| Incident | Action |
|----------|--------|
| Close UI defect | Set `efcp.nav_sidebar` OFF, then `efcp.workspace_ui` OFF |
| Snapshot corruption risk | Set `efcp.snapshot_pipeline` OFF |
| Any operational regression blamed on Close | Set all `efcp.*` / related `efre.*` OFF — Operational Reports continue |

Rollback must be achievable **without deploy** where flag service allows; otherwise hotfix deploy of flag defaults.

---

## 6. Ownership

| Concern | Owner |
|---------|-------|
| Flag definitions | Release Board + Engineering |
| Prod Phase 4 flip | Release Board approval citing this pack |
| Allowlist | Engineering lead |

---

## 7. Certification

Feature Flag Strategy is **APPROVED**.
