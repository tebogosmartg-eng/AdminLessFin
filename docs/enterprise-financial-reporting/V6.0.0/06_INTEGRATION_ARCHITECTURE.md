# 06 — Integration Architecture

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Integration Philosophy

EFRE integrates as a **shared enterprise presentation pillar**, not as a folder inside Accounting and not as a fork of the V3.6 payroll reporting registry.

```
Accounting Engine (SoT balances)
    │ period.closed / fact seal contract
    ▼
AccountingFact Snapshot ──► EFRE Services
                               │
                               ├─ Framework / Mapping / Policy resolve
                               ├─ Statement / Notes / Disclosure assemble
                               ├─ Materiality / Validation / Review
                               └─ Publication ──► Published Pack Version
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              V3.6 export         EGCP DoA/Calendar     Auditors/Board
              (substrate)         (approve/file)        (consumers)
                    ▲
                    └── fre.* events (V4.3.0 BOE)
```

Principles:

1. **Pull sealed facts** for publication (never publish from live mutable journals).  
2. **Push awareness** via `fre.*` events.  
3. **Never dual-write balances** into EFRE.  
4. **Never dual-write Framework Packs** into Accounting or EGCP.  
5. **Edge Platform V4.2.1** hosts future EFRE runtime uniformly.  
6. **V3.6** optional for export artefact generation only.

---

## 2. Service Contracts (logical)

| Service | Operation | Input | Output |
|---------|-----------|-------|--------|
| Framework Resolver | `resolveFramework` | entity, period | FrameworkPackVersion + provenance |
| Mapping Resolver | `resolveMapping` | entity, framework_version | ChartMappingSet version |
| Policy Resolver | `resolveReportingPolicies` | entity, period | AccountingPolicySet version |
| Fact Seal | `sealAccountingFacts` | company, period, rpc_refs | FactSnapshotSeal |
| Statement Assembler | `generateStatements` | case_id | StatementInstances |
| Disclosure Assembler | `assembleDisclosures` | case_id | DisclosureInstances |
| Notes Assembler | `assembleNotes` | case_id | NoteInstances |
| Materiality | `recordMaterialityDecision` | case_id, profile, rationale | decision_id |
| Validator | `runValidation` | case_id | ValidationRun |
| Review | `submitReview` / `approve` / `reject` | case_id, actor | workflow state |
| Publisher | `publishPack` | case_id | PublishedPackVersion |
| XBRL Ready | `markXbrlExportReady` | edition_id | artefact ref |

Physical APIs (REST/RPC/Edge) are **out of scope** for this pack.

---

## 3. Accounting Fact Integration

### 3.1 Fact producers (Accounting-owned)

| Producer | Role for EFRE |
|----------|---------------|
| `get_balances_as_of_date` | Statement of financial position / TB-class facts |
| `get_period_activity` | Performance statement facts |
| `get_cash_flow_statement` | Cash flow facts (or mapped from sealed CF components) |
| Period close (`period.closed`) | Enables / triggers seal window |

### 3.2 Seal contract

```
period.closed (Accounting)
  → fre.period.case_opened (EFRE)   [may also open earlier in draft]
  → sealAccountingFacts(company, period, source_rpc_refs, content_hash)
  → fre.facts.sealed
  → subsequent assembly uses ONLY seal_id
```

| Rule | Requirement |
|------|-------------|
| Publish source | FactSnapshotSeal only |
| Operational Financial Reporting | Live RPCs permitted for live IS/BS/CF/TB/Ratios; non-statutory |
| GL imbalance | Validation fails; Accounting remediates; EFRE does not invent amounts |

### 3.3 Mapping

```
CoA account / tag + Policy elections
  → MappingLine → TaxonomyLine (+ XbrlConceptBinding)
  → Statement / Note / Disclosure quantitative slots
```

---

## 4. Integration Patterns by Consumer

### 4.1 Accounting

| Integration | Direction | Notes |
|-------------|-----------|-------|
| Fact seal | Outbound to EFRE | Balances remain Accounting SoT |
| Validation fail (GL) | Subscribe `fre.validation.failed` | Remediate journals/periods |
| Publication | Subscribe `fre.pack.published` | No mutation of packs |

Accounting must not call Framework assemblers to redefine recognition.

### 4.2 EGCP

```
Approve intent
  → gov.doa.evaluate / approved
  → fre.review.approved
  → fre.pack.published
  → bind Evidence / Obligation satisfied (filing)
```

EGCP does not assemble statements.

### 4.3 V3.6 Reporting Platform

```
PublishedPackVersion rows
  → register ReportDefinition generator (read-only published facts)
  → export CSV/PDF/Excel/JSON via substrate
```

Must not recalculate Accounting or payroll engines for FS amounts.

### 4.4 Payroll

Payroll contributes employment costs only via journals already in Accounting. VIP/statutory packs remain V3.6 / payroll domain. No `fre.*` ownership by Payroll.

### 4.5 EWM

Consumes published presentation (e.g. margin views aligned to published P&L) as read-only. Must not bypass Accounting recognition.

### 4.6 AI Advisory

Subscribe to sealed/published events for drafting assists; forbidden from emitting seal/approve/publish events.

---

## 5. Runtime Hosts (future implementation)

| Host | Role |
|------|------|
| Enterprise Edge Platform V4.2.1 | Uniform Edge lifecycle for EFRE services |
| Business Event Platform V4.3.0 | `fre.*` publish/subscribe |
| Supabase tenant model | `company_id` isolation |
| V3.6 `src/reporting` | Optional export/registry substrate |

Physical function names, tables, and RLS policies are deferred.

---

## 6. Permanent Dual-Track (Migration Strategy)

See [08_MIGRATION_STRATEGY.md](./08_MIGRATION_STRATEGY.md).

| Track | Path | Authority | Status |
|-------|------|-----------|--------|
| **Operational Financial Reporting** | Existing Financial Statements / Reports UI + `reports` edge + **live** Accounting RPCs | Live IS, BS, Cash Flow, Trial Balance, Ratios | **Preserved** — not deleted, deprecated, or redesigned |
| **Enterprise Financial Reporting (EFRE)** | FactSnapshotSeal → Framework Packs → Statement / Disclosure / Notes / Comparatives → Validation → Review → Publication | Statutory / standards packs | **Additive** new pillar |

| Compatibility rule | Mandate |
|--------------------|---------|
| Existing FS module | Must remain available and backwards compatible |
| Existing reporting engine | Must not be redesigned as EFRE |
| Existing integrations | Must not break |
| Progressive elevation | Refactor Operational track as Accounting consumer where practical; elevate statutory use cases to EFRE without removing operational live reports |
| Balance calculations | Owned solely by Accounting — both tracks consume, neither duplicate |

---

## 7. Failure Isolation

| Failure | Isolation rule |
|---------|----------------|
| Mapping incomplete | Blocking Validation — pack cannot publish |
| Accounting GL imbalance | EFRE reports fail; does not auto-post correcting journals |
| EGCP DoA unavailable | Implementation may use interim dual-control roles until EGCP Implementation Approval; must not invent DoA matrices inside EFRE as long-term SoT |
| V3.6 export failure | Does not un-publish sealed edition; artefact retry only |
| Subscriber failure on `fre.*` | Isolated per V4.3.0 subscriber isolation rules |

---

## 8. Certification

Integration Architecture is **CERTIFIED**. Implementation designs must preserve the seal-before-publish contract and the Accounting / EFRE / EGCP / V3.6 separations defined herein.
