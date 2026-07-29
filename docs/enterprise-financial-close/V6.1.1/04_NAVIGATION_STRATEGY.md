# 04 — Navigation Strategy

**Pack:** Financial Close Implementation Approval  
**Version:** 6.1.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** APPROVED (strategy)  

---

## 1. Purpose

Separate **Operational** navigation (always on) from **Financial Close** navigation (Phase 4 only).

---

## 2. Current Navigation (preserve)

Present sidebar (illustrative of current product):

| Item | Target | Track |
|------|--------|-------|
| Operational Reports | `/reports` | Operational — keep |
| Financial Statements | `/financial-statements` | Operational — keep |
| Comparative P&L | `/comparative-pl` | Operational — keep |
| Comparative B/S | `/comparative-bs` | Operational — keep |

Command Menu / Dashboard deep links to `/reports` and `/financial-statements` **must remain**.

**Phases 1–3:** No new sidebar item. No removal/rename that breaks muscle memory without Release Board approval.

---

## 3. Target Navigation (Phase 4+)

| Item | Target | Flag |
|------|--------|------|
| Operational Reports | `/reports` | always |
| Financial Statements | `/financial-statements` | always |
| Comparative P&L / B/S | existing | always |
| **Financial Close** | `/financial-close` | `efcp.nav_sidebar` |

Recommended placement: adjacent to operational reporting group, labelled distinctly so users do not confuse live statements with Close.

Optional later submenu under Financial Close (workspace, papers, reviews) — not required for Phase 4 entry.

---

## 4. Phase Visibility Matrix

| Phase | Operational nav | Close nav | Close URL |
|-------|-----------------|-----------|-----------|
| 1 | Visible | Hidden | N/A |
| 2 | Visible | Hidden | Allowlist direct |
| 3 | Visible | Hidden | Allowlist direct |
| 4 | Visible | **Visible** | All entitled roles |

---

## 5. Labelling Rules

| Surface | Label guidance |
|---------|----------------|
| `/financial-statements` | Remain “Financial Statements” or “Operational Financial Statements” — must imply live/management |
| Close | Always “Financial Close” — never replace “Financial Statements” label |
| Help / User Manual | Dual-track explanation at Phase 4 |

---

## 6. Anti-Patterns

| Forbidden | Why |
|-----------|-----|
| Replacing Financial Statements nav with Close | Breaks operational users |
| Hiding `/financial-statements` behind Close flag | Violates preservation |
| Auto-redirect operational users into Close | Surprises; breaks bookmarks |

---

## 7. Certification

Navigation Strategy is **APPROVED**.
