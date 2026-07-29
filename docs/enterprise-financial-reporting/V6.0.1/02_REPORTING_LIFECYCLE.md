# 02 — Reporting Lifecycle

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Pack:** Reporting Snapshot & Period Architecture  
**Version:** 6.0.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Data Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Define the end-to-end reporting lifecycle for Enterprise Financial Reporting from period open through freeze, publication, subsequent events, and restatement — proving statutory packs never bind to live GL.

Operational Financial Reporting lifecycle remains **live, continuous, and independent** of this lifecycle.

---

## 2. Lifecycle Diagram

```
[A] Reporting Period planned / opened
        │
[B] Accounting books continuous (live GL — Operational Reports may read)
        │
[C] Extract Reporting Dataset → Fact Snapshot sealed
        │
[D] Apply posted Audit Adjustments (Accounting) → re-extract if needed
        │
[E] Apply approved Reporting Adjustments (EFRE)
        │
[F] Bind Comparative Snapshot(s)
        │
[G] Certify Reporting Snapshot Version
        │
[H] Reporting Freeze
        │
[I] EFRE assemble statements / notes / disclosures / validate / review
        │
[J] Assemble Publication Snapshot → Publish pack
        │
[K] Subsequent Events monitoring
        │
   ┌──── adjusting? ──► Audit Adj → new Snapshot Version → (from C/D) → republish
   │
   └──── non-adjusting? ► Disclose on pack / note (or new version if freeze policy requires)
        │
[L] Restatement (if prior publication wrong) → new Snapshot Version + restated publication
```

---

## 3. Stage Definitions

| Stage | Name | Entry criteria | Exit criteria | Forbidden |
|-------|------|----------------|---------------|-----------|
| A | Period open | Period defined; entity + framework binding known | Period open_for_reporting | Using undefined period |
| B | Live books | Accounting operational | Always available to Operational Reports | EFRE publish from this stage |
| C | Fact seal | Period extractable; Accounting facts complete enough | Fact Snapshot sealed | Sealing without source refs |
| D | Audit reflect | Audit Adj posted to GL | New Fact Snapshot includes journals | Treating unposted adj as sealed |
| E | Reporting adj | Fact Snapshot sealed | Adjustments approved on version | Hiding GL imbalance via reporting adj |
| F | Comparatives | Prior Snapshot Versions exist (or first period) | Comparative bindings pinned | Rebuilding prior from live GL |
| G | Certify | Dataset + adjs + comparatives complete | Snapshot Version certified | Certify while live-mutable |
| H | Freeze | Certified | Snapshot Version frozen | In-place edits after freeze |
| I | Assemble | Frozen snapshot | Validation pass + review ready | Assembly from live GL |
| J | Publish | Review approved | Publication Snapshot + Published Pack Version | Publish unfrozen / unsealed |
| K | Subsequent | After period end / freeze / publish | Events classified & actioned | Silent mutation of Publication Snapshot |
| L | Restatement | Error or required change post-publish | New edition linked as restates | Overwriting prior edition |

---

## 4. State Machine — Reporting Snapshot Version

```
draft
  → certified
      → frozen
          → publication_bound
              → superseded   (via restatement or replacement publication policy)
```

| Transition | Gate |
|------------|------|
| draft → certified | Completeness + attributed certifier |
| certified → frozen | Freeze approval (DoA optional/required per tenant) |
| frozen → publication_bound | Review approve + Publication Snapshot assembled |
| * → superseded | New Snapshot Version published or officially withdrawn |

**Unfreeze:** Never returns the same version to draft. Controlled release for restatement **creates a successor version**.

---

## 5. State Machine — Reporting Period

```
planned → open_for_reporting → frozen_for_reporting → closed_for_reporting
```

| Note | Rule |
|------|------|
| Parallelism | Accounting period close (`period.closed`) enables but does not equal Reporting Freeze |
| Operational | Operational Reports ignore reporting freeze for live views |
| Reopen | Reporting reopen only via Restatement / new Snapshot Version policy |

---

## 6. Parallel Operational Track

| Event | Operational Financial Reporting | Enterprise Financial Reporting |
|-------|---------------------------------|--------------------------------|
| Journal posted | Live TB/IS/BS update | Ignored until next extract |
| Reporting Freeze | No effect on live reports | Locks statutory snapshot |
| Publish pack | No requirement | Mandatory Publication Snapshot |
| Restatement | Live books may already reflect Adjudted GL | New snapshot lineage for packs |

---

## 7. Actors & Separation of Duties

| Role | Typical stages |
|------|----------------|
| Preparer | C–G, I |
| Freeze / Reporting Controller | H |
| Approver (Review Workflow) | I–J |
| Accounting | D (post Audit Adjustments) |
| Auditor (persona) | Read-only all; requests D/E |
| AI Advisory | Assist identify subsequent events / classify; cannot freeze or publish |

---

## 8. Failure & Exception Paths

| Failure | Handling |
|---------|----------|
| Incomplete extract | Remain draft; no certify |
| GL imbalance discovered | Block certify/publish; Accounting remediates; re-extract |
| Unposted Audit Adjustment | Cannot enter Fact Snapshot |
| Subsequent adjusting event after publish | Restatement path |
| Validation fail | Stay frozen but not publication_bound |

---

## 9. Certification

Reporting Lifecycle is **CERTIFIED**.
