# 05 — Backwards Compatibility Report

**Pack:** Financial Close Implementation Approval  
**Version:** 6.1.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** COMPATIBLE — PASS  

---

## 1. Compatibility Claim

The phased EFCP introduction is **backwards compatible** with live Operational Financial Reporting because Close is additive, flagged, and does not alter Accounting calculation ownership or protected routes.

---

## 2. Verification Checklist

| Requirement | Result | How |
|-------------|--------|-----|
| Reports remain operational | ✓ PASS | Protected `/reports`; no Close dependency |
| Existing Financial Statements preserved | ✓ PASS | `/financial-statements` protected; not redesigned |
| Backwards compatibility maintained | ✓ PASS | Route + Flag + Nav strategies |
| Accounting remains SoT | ✓ PASS | No calc move; snapshot extract only |
| EFCP consumes Reporting Snapshots | ✓ PASS | V6.1.0 / V6.0.1 pipeline; Phase 3 |
| EFRE consumes EFCP | ✓ PASS | Hand-off after Publication Readiness |
| No duplicated calculations | ✓ PASS | Architecture invariants + Phase 1 ban |
| No broken routes | ✓ PASS | Additive Close routes only |

---

## 3. Contract Inventory (must not break)

| Contract | Compatibility rule |
|----------|-------------------|
| `GET` / edge methods used by FinancialStatements & Reports | Signature & semantics preserved |
| Accounting RPCs (`get_balances_as_of_date`, `get_period_activity`, cash flow, etc.) | Remain operational fact source for live UI |
| Sidebar items for operational reporting | Remain |
| Dashboard KPI links | Remain |
| Command Menu report entries | Remain |
| Export CSV from operational FS (if present) | Remain |
| Tenant company scoping | Unchanged |

---

## 4. Acceptable Non-Breaking Changes

| Change | Phase | Notes |
|--------|-------|-------|
| Feature flag infrastructure | 1 | New |
| Close APIs unused by operational UI | 1–2 | Additive |
| Hidden Close routes | 2 | No nav |
| Help text clarifying operational vs Close | 4 | Copy only |
| Optional shared branding helpers | 1 | Must be behaviour-neutral for operational views |

---

## 5. Breaking Changes (out of scope / require separate board)

| Change | Status |
|--------|--------|
| Remove `/financial-statements` | **Forbidden** under this approval |
| Force live statements onto snapshots | **Forbidden** |
| Rename operational routes | Not approved here |
| Redesign Reports engine as EFCP | **Forbidden** |

---

## 6. Regression Suite Expectations (Phase gates)

| Suite | Required from |
|-------|----------------|
| Operational FS smoke (IS/BS/CF/TB/Ratios load & refresh) | Phase 1 exit onward |
| Route resolution for protected paths | Every phase |
| Flag OFF ⇒ Close invisible | Phase 2+ |
| Snapshot/EFRE lab path | Phase 3 |
| Nav expose + rollback drill | Phase 4 |

---

## 7. Certification

Backwards Compatibility Report: **PASS**.  
Implementation may proceed under this compatibility contract.
