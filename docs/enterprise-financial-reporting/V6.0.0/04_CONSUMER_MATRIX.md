# 04 — Consumer Matrix

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Version:** 6.0.0  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Prove that Accounting supplies sealed facts, enterprise modules consume published presentation where appropriate, and **no consumer embeds Framework Pack or balance-calculation truth**.

---

## 2. Consumption Modes

| Mode | Meaning |
|------|---------|
| **F** | Fact supply — provide / seal Accounting facts for EFRE |
| **R** | Resolve — read framework, mapping, policy, published packs |
| **E** | Evaluate — materiality decisions, validation participation, DoA for approve |
| **W** | Write — mappings, policies, notes drafts, review actions, publish |
| **S** | Subscribe — react to `fre.*` (and relevant `period.*`) events |
| **X** | Export substrate — generate artefacts from published rows (V3.6) |
| **—** | Not applicable |

---

## 3. Module × Domain Matrix

| Consumer | Framework | Mapping | Policy | Statement | Disclosure | Notes | Comparative | CrossRef | Materiality | Validation | Review | Publication | Version Ctrl | XBRL |
|----------|:---------:|:-------:|:------:|:---------:|:----------:|:-----:|:-----------:|:--------:|:-----------:|:----------:|:------:|:-----------:|:------------:|:----:|
| Accounting | — | R | — | — | — | — | — | — | — | S | — | S | — | — |
| Accounting (fact path) | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Payroll | — | — | — | — | — | — | — | — | — | — | — | S | — | — |
| EGCP | R | — | — | — | R† | — | — | R† | — | — | E | E/S | — | — |
| EWM | R | — | — | R | — | — | — | — | — | — | — | R/S | — | — |
| V3.6 Reporting Platform | R | R | R | X | X | X | X | R | R | R | — | X | R | X |
| Finance / Preparer | R | W | W | W | W | W | R | W | E/W | E | W | — | R | R |
| Reviewer / Approver | R | R | R | R | R | R | R | R | R | R | W | W | R | R |
| Internal Audit | R | R | R | R | R | R | R | R | R | R | R | R | R | R |
| External Auditor | R | R | R | R | R | R | R | R | R | R | R | R | R | R |
| Board / Executive | — | — | R | R | R | R | R | — | R | — | — | R | R | — |
| AI Advisory | R | R* | R* | R | R* | R* | R | R | R* | R | — | R | R | R* |
| Operational Financial Reporting | — | — | — | —‡ | — | — | —‡ | — | — | — | — | — | — | — |

\* AI: read/propose only — may not publish maps, approve, seal, or publish packs.  
† EGCP may link obligations/evidence to disclosure proofs; does not own disclosure content.  
‡ Operational Financial Reporting shows **live** IS/BS/CF/TB/Ratios from Accounting RPCs; it is **not** Framework Pack SoT and is **not** deleted by EFRE (see [08_MIGRATION_STRATEGY.md](./08_MIGRATION_STRATEGY.md)).

**Accounting fact supply (F):** Accounting provides FactSnapshotSeal inputs via period close / balance & activity fact contracts — orthogonal to domain columns above.

---

## 4. Verification Targets (mission checklist)

| Requirement | How satisfied |
|-------------|----------------|
| Accounting owns balances | Fact Snapshot from Accounting only; Boundaries §4.1; live RPC facts for Operational track |
| Operational Reports own live presentation | Migration Strategy §5.1; existing FS preserved |
| Reporting owns statutory presentation | Framework/Statement/Notes/Disclosure owned by EFRE |
| No duplicated accounting calculations | Mapping classifies; Domain Model Amount Provenance Rule; Migration Strategy §6 |
| Existing FS backwards compatible | Migration Strategy §3, §8 |
| Multi-framework ready | Framework Management + five packs + future slot |
| Versioned reporting frameworks | FrameworkPackVersion state machine |
| Multi-company ready | `company_id` + ReportingEntity scoping |
| Fully auditable | Seals, validation runs, review actors, published hashes, `fre.*` |
| Publication-ready | Publication Engine + Review gate |
| Future XBRL ready | XbrlConceptBinding + `fre.xbrl.export_ready` |

---

## 5. Critical Decision Points (by consumer)

| Consumer | Decision point | EFRE / peer services |
|----------|----------------|----------------------|
| Accounting | Period close | Seal facts for ReportingPeriodCase |
| Finance Preparer | Open period case / bind framework | FrameworkBinding + Mapping + Policy |
| Finance Preparer | Assemble pack | Statement / Notes / Disclosure / Comparative |
| Finance Preparer | Materiality scoping | Materiality Engine |
| Validation | Articulation & completeness | Validation Engine |
| Approver | Approve for publish | Review Workflow (+ EGCP DoA when available) |
| Publication | Release pack | Publication + Version Control (+ XBRL readiness) |
| V3.6 | Export artefact | Substrate only from published rows |
| EGCP | Filing obligation due | Calendar consumes publication status; does not author FS |
| EWM | Management use of published P&L | Read published pack; no GL write |
| Operational Financial Reporting | Live IS / BS / CF / TB / Ratios | Live Accounting RPC facts only; no EFRE seal required; no statutory publish |

---

## 6. Non-Consumers (explicit)

| System | Reason |
|--------|--------|
| V4.4.0 Evolution Governance | Orthogonal product change control — not a runtime FS consumer |
| Frozen payroll calculation engine | Must not become statement calculation engine |
| Raw database triggers inventing statement amounts | Forbidden shadow reporting engine |

---

## 7. Certification

Consumer Matrix is **CERTIFIED**. Implementation designs must cite this matrix for every module touchpoint.
