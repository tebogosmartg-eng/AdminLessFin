# 02 — Route Strategy

**Pack:** Financial Close Implementation Approval  
**Version:** 6.1.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** APPROVED (strategy)  

---

## 1. Purpose

Guarantee **no existing route may break** and no operational report route may be removed or repurposed as Close.

---

## 2. Protected Operational Routes (MUST keep)

Current production routes (from platform router / nav) remain canonical Operational Financial Reporting:

| Route | Capability | Disposition |
|-------|------------|-------------|
| `/reports` | Operational Reports (TB, aging, management) | **Protected — keep** |
| `/financial-statements` | Live IS, BS, CF, TB, Ratios | **Protected — keep** |
| `/comparative-pl` | Comparative P&L (operational) | **Protected — keep** |
| `/comparative-bs` | Comparative B/S (operational) | **Protected — keep** |
| Related: `/tax-report`, `/project-profitability` | Operational analytics | **Protected — keep** |

**Rules:**

1. Paths must not be renamed in Phases 1–4 without a separate V4.4.0 breaking-change approval.  
2. Components may gain labelling (e.g. already “Operational Reports”) but must not lose live Accounting behaviour.  
3. Dashboard/Command Menu links to these routes must continue to resolve.  
4. Lifecycle registry routes (`businessLifecycles`) pointing at `/reports` and `/financial-statements` remain valid.

---

## 3. New Financial Close Routes (additive)

Introduced only behind feature flag (see Flag Strategy). Suggested canonical paths:

| Route | Phase | Visibility |
|-------|-------|------------|
| `/financial-close` | 2 | Hidden — allowlist / direct URL |
| `/financial-close/workspace/:workspaceId` | 2 | Hidden |
| `/financial-close/workspace/:workspaceId/tasks` | 2 | Hidden |
| `/financial-close/workspace/:workspaceId/working-papers` | 2–3 | Hidden |
| `/financial-close/workspace/:workspaceId/lead-schedules` | 2–3 | Hidden |
| `/financial-close/workspace/:workspaceId/snapshots` | 3 | Hidden |
| `/financial-close/workspace/:workspaceId/reviews` | 3 | Hidden |
| `/financial-close/*` deep links | 4 | Nav-exposed when flag ON |

**Rules:**

1. Register routes in router **guarded by flag**; when flag OFF, route may 404 or redirect to `/reports` **without** removing operational routes. Prefer soft “not available” for non-allowlisted users rather than colliding with `/financial-statements`.  
2. **Never** alias `/financial-statements` → Close.  
3. **Never** reuse `/reports` as Close shell.

---

## 4. EFRE Statutory Routes (future additive)

When statutory packs get UI under Phase 3–4, use separate paths (e.g. `/financial-close/.../statements` or `/enterprise-reporting/...`) — **not** `/financial-statements`.

Live `/financial-statements` remains Operational only.

---

## 5. Compatibility Matrix

| Actor | Flag OFF | Flag ON (Phase 4) |
|-------|----------|-------------------|
| Operational user | All protected routes work | All protected routes **still** work + sees Close nav |
| Developer (Phase 2) | Protected routes work | Protected + hidden Close URL |
| Bookmark `/financial-statements` | Works | Works |

---

## 6. Certification

Route Strategy is **APPROVED**.
