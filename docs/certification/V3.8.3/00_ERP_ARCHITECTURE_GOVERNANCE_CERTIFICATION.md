# ERP Architecture Governance Certification — V3.8.3

**Product:** AdminLess Fin  
**Date:** 2026-07-30  
**Scope:** Permanent guardrails protecting Canonical Accounting Engine / CFA from regression.

Frozen (unchanged): BOE, Accounting Engine / CFA math, Journal Posting, General Ledger, Trial Balance.

---

## 1. Governance rules

| Rule | Enforcement |
|------|-------------|
| ADR-0003 CFA architecture freeze | `docs/adr/ADR-0003-*.md` |
| Agent always-apply rule | `.cursor/rules/cfa-architecture-freeze.mdc` |
| Developer handbook | `docs/architecture/CFA_ARCHITECTURE_GOVERNANCE.md` |
| No parallel money aggregators | Filename + import bans |
| No AR/AP/VAT/JE P&L reduces in consumers | Guard + ESLint + tests |

---

## 2. CI checks

Workflow: `.github/workflows/cfa-architecture-governance.yml`

Steps: `guard:cfa` → `certify:cfa-gov` → `lint` → `build`

Also available locally: `npm run certify:cfa-gov`

---

## 3. Static analysis

| Tool | What it blocks |
|------|----------------|
| `scripts/cfaArchitectureGuard.ts` | Content + filename anti-patterns across pages, components, reports, dashboard-data, projects, accounting |
| ESLint `no-restricted-syntax` | `arBalances.reduce`, `apBalances.reduce`, `overdueInvoices.reduce` in UI/lib |
| ESLint `no-restricted-imports` | Parallel aggregator module paths |

---

## 4. Architectural tests

`tests/unit/cfa-architecture-governance.test.ts`

Fails if Dashboard, Financial Statements, Reports, Tax, Banking, or Accounting Intelligence bypass CFA markers or reintroduce AR/AP reduces.

---

## 5. Documentation created

- `docs/architecture/CFA_ARCHITECTURE_GOVERNANCE.md`
- `docs/adr/ADR-0003-canonical-financial-aggregation-architecture-freeze.md`
- `.cursor/rules/cfa-architecture-freeze.mdc`
- This certification binder

---

## 6. Production build

| Check | Result |
|-------|--------|
| `npm run guard:cfa` | **PASS** (0 violations) |
| `npm run certify:cfa-gov` | **33/33 PASS** |
| `eslint . --quiet` (errors) | **PASS** (0 errors; CFA restricted rules active) |
| `npm run build` | **PASS** (2026-07-30) |

---

## 7. Final governance certification

CFA remains the sole monetary authority. Automated gates prevent duplicate accounting logic from merging without an ADR.

**ERP ARCHITECTURE GOVERNANCE CERTIFIED**
