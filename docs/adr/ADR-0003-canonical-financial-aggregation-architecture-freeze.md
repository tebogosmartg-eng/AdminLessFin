# ADMINLESS FIN

# ARCHITECTURE DECISION RECORD (ADR)

## ADR-0003

# CANONICAL FINANCIAL AGGREGATION — ARCHITECTURE FREEZE & GOVERNANCE

**Status:** ACCEPTED  
**Effective Date:** 30 July 2026  
**Version:** 1.0  
**Supersedes:** None (complements ADR-0001 CoA freeze)

---

## Decision

Following Canonical Financial Aggregation certification (V3.8.0) and full engine certification (V3.8.2), **CFA is the sole monetary aggregation authority** for AdminLess Fin statement and KPI surfaces.

Duplicate accounting aggregation paths are forbidden. Architecture is **frozen** for CFA math, classification semantics, and money ownership.

---

## Scope frozen

- `canonicalFinancialAggregation.ts` (client + edge)
- Facades: `accountingEngineTotals`, `dashboardReconciliation` (wrappers only)
- Loader: `loadCanonicalAggregation`
- Sealed AFS consumption of `canonical_aggregation`

Do **not** modify BOE, Journal Posting, Journal Entries, General Ledger, Trial Balance posting/inquiry row assembly, or CFA math without a superseding ADR.

---

## Governance mechanisms

| Mechanism | Location |
|-----------|----------|
| Developer guide | `docs/architecture/CFA_ARCHITECTURE_GOVERNANCE.md` |
| Static guard | `npm run guard:cfa` → `scripts/cfaArchitectureGuard.ts` |
| Architectural tests | `tests/unit/cfa-architecture-governance.test.ts` |
| ESLint restricted patterns | `eslint.config.js` |
| CI workflow | `.github/workflows/cfa-architecture-governance.yml` |
| Agent rule | `.cursor/rules/cfa-architecture-freeze.mdc` |

---

## Consequences

- New reports must **consume** CFA; they must not calculate NI, VAT, cash, AR/AP, BS totals, or P&L partitions independently.
- CI fails on forbidden patterns (e.g. `arBalances.reduce`, parallel VAT loops, new aggregator filenames).
- Domain operational totals (payroll register, inventory valuation, document line extensions) remain out of CFA scope and must not be advertised as statement engine figures.

---

## Approval

Certified under ERP Architecture Governance (V3.8.3).
