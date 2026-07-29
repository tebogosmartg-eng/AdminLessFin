# ADMINLESS FIN
# VERSION 17.0
# ENTERPRISE REPORTING INTELLIGENCE ENGINE

## Architecture

The Reporting Intelligence Engine is the decision-making layer above the locked Composition Engine (V16.0). It determines **what** should appear, **when**, **where**, and **how much detail** — without recalculating accounting, frameworks, or ledger facts.

### Enterprise Reporting Pipeline

```
Ledger
  ↓
Trial Balance
  ↓
Accounting Engine
  ↓
Framework Repository
  ↓
Composition Engine (V16 — LOCKED)
  ↓
Reporting Intelligence Engine (V17 — NEW)
  ↓
Publication (PDF / DOCX / Preview)
```

### Module Structure

| Module | Path | Responsibility |
|--------|------|----------------|
| Orchestrator | `reportingIntelligence/orchestrator.ts` | `produceReportingPackage()` — sole entry point |
| Entity Profiling | `entityProfilingEngine.ts` | Automatic size + industry profile detection |
| Materiality | `materialityEngine.ts` | Mandatory / conditional / material / immaterial classification |
| Disclosure Decisions | `disclosureDecisionEngine.ts` | Suppress / merge / collapse / expand / highlight |
| Statement Presentation | `statementPresentationEngine.ts` | Current/non-current, nature/function, subtotals |
| Ordering | `orderingEngine.ts` | Framework + materiality + profile driven ordering |
| Consistency | `consistencyEngine.ts` | Cross-ref, policy, comparative, schedule validation |
| Publication Contract | `publicationContract.ts` | Identical reporting object for all renderers |
| Apply Intelligence | `applyIntelligence.ts` | Refines CompositionDocument without redesign |

### Locked Subsystems (No Redesign)

- General Ledger, Journal Engine, Trial Balance Engine
- Accounting Engine, Financial Statement Engine
- Framework Repository, Knowledge Repository
- Composition Engine, Disclosure Composition Engine
- Publication Engine (renderers consume contract only)

## Entity Profiling Engine

Automatically identifies reporting profiles from sealed facts and engagement data:

| Profile | Detection |
|---------|-----------|
| Micro Entity | Assets < R5M or revenue < R10M |
| Small / Medium / Large SME | Tiered asset and revenue thresholds |
| Holding Company | Investment ratio > 40%, low PPE |
| Investment Entity | Investment ratio > 60% |
| Subsidiary | Parent relationship (engagement context) |
| Retail | High inventory ratio, trading nature |
| Manufacturing | High PPE + inventory |
| Service | High receivables, low inventory |
| Professional Practice | Nature of business + low assets |
| Agriculture | Biological assets or nature |
| Construction | Nature + contract revenue patterns |
| NPO | Non-profit nature of business |
| Dormant Entity | Assets < R100k, no revenue |

Each profile influences disclosure depth, statement presentation, ordering, grouping, schedules, and policies.

## Materiality Engine

Every disclosure carries a materiality class:

- `mandatory` — framework required
- `conditional` — fact-driven activation
- `material` — exceeds entity-specific threshold
- `immaterial` — below threshold
- `zero_balance` — no supporting facts
- `framework_required` — explicit framework mandate
- `entity_specific` — profile-driven requirement
- `future_use` — reserved, no current facts

Actions: `suppress`, `merge`, `collapse`, `expand`, `highlight`, `present`

## Disclosure Decision Engine

Automatic decisions with documented reasons:

| Condition | Decision |
|-----------|----------|
| No PPE | Suppress PPE disclosure |
| One PPE category | Simplified disclosure |
| Multiple PPE categories | Movement schedule |
| Zero balances | Suppress schedule |
| No tax | Suppress tax reconciliation |
| No leases | Suppress lease disclosures |
| No related parties | Suppress related party disclosures |

## Statement Presentation Engine

Determines per statement:

- Current / non-current vs liquidity presentation
- Nature vs function of expense
- Gross profit, operating profit, profit before tax subtotals
- Entity-specific layouts (NPO, holding, micro, loss-making, high-growth)

## Ordering Engine

No hardcoded ordering. Factors:

1. Framework requirements (`noteSortOrder`)
2. Face statement references
3. Materiality weight
4. Entity profile industry boost
5. Presentation priority (expand → earlier)

## Consistency Engine

Validates:

- Statement ↔ note cross-references
- Policy ↔ note separation
- Disclosure activation consistency
- Comparative completeness
- Movement schedule presence
- SFP balance equation
- Composition validation inheritance

Any error-level inconsistency fails certification.

## Publication Contract

Renderers (PDF, DOCX, Preview, future HTML/XBRL) consume `PublicationContract` from `produceReportingPackage()`. They **must not** make reporting decisions.

```typescript
import { produceReportingPackage } from './reportingIntelligence';

const pkg = produceReportingPackage(model, overrides);
// Renderers use: pkg.publicationContract.composition
// Presentation: pkg.publicationContract.statementPresentation
// Decisions: pkg.publicationContract.disclosureDecisions
```

## Regression Scenarios

11 mandatory entity types certified:

1. Service Entity
2. Retail Entity
3. Manufacturing Entity
4. Investment Holding Company
5. Professional Practice
6. NPO
7. Dormant Entity
8. High-growth Entity
9. Loss-making Entity
10. Asset-intensive Entity
11. Debt-intensive Entity

Run: `npx vitest run tests/unit/efs-v17-reporting-intelligence.test.ts`

Evidence: `docs/enterprise-accounts-production/V17.0/evidence/`

## Enterprise Readiness

| Criterion | Status |
|-----------|--------|
| Entity profiling (15+ profiles) | ✅ |
| Materiality classification | ✅ |
| Disclosure suppression/expansion | ✅ |
| Statement presentation decisions | ✅ |
| Framework-driven ordering | ✅ |
| Consistency certification gate | ✅ |
| Publication contract | ✅ |
| 11-scenario regression suite | ✅ |
| PDF/DOCX no regression | ✅ |
| Locked subsystem integrity | ✅ |

## Version

**VERSION 17.0 COMPLETE**

**ENTERPRISE REPORTING INTELLIGENCE ENGINE READY FOR CERTIFICATION**
