# 03 — Snapshot Versioning Strategy

**Pillar:** Enterprise Financial Reporting Engine (EFRE)  
**Pack:** Reporting Snapshot & Period Architecture  
**Version:** 6.0.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Financial Reporting Data Architecture Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Prove that Reporting Snapshots are **versioned, content-addressable, and immutable once certified**, so multi-framework statutory packs and comparatives remain fully auditable.

---

## 2. Versioning Principles

| # | Principle | Implication |
|---|-----------|-------------|
| V1 | Immutability | Certified Snapshot Version content never changes in place |
| V2 | Monotonic lineage | Each period+entity has ordered versions (predecessor links) |
| V3 | Content identity | Each version has content hash covering Fact Snapshot + Reporting Adjustments + Comparative bindings metadata |
| V4 | Explicit supersession | Later versions supersede; prior remain readable |
| V5 | Publish pin | Published Pack Versions pin exact Snapshot Version ID |
| V6 | Comparative pin | Comparative Snapshot refs pin prior Snapshot Version IDs |
| V7 | No “latest” alias for publish | Publication must not resolve floating latest |
| V8 | Framework agnosticism | Same Snapshot Version may feed multiple framework assemblies in principle; bindings recorded per Published Pack |

---

## 3. Version Identity (logical)

| Component | Description |
|-----------|-------------|
| `company_id` | Tenant |
| `reporting_entity_id` | Entity (default = company) |
| `reporting_period_id` | Period |
| `snapshot_version_id` | Unique edition |
| `predecessor_snapshot_version_id` | Optional |
| `content_hash` | Seal of included facts & adjustments |
| `fact_snapshot_seal_id` | Fact Snapshot identity |
| `status` | draft \| certified \| frozen \| publication_bound \| superseded |
| `created_at` / `certified_at` / `frozen_at` | Timestamps |
| `actors` | Certifier, freezer |

Physical ID schemes are out of scope.

---

## 4. What Triggers a New Snapshot Version

| Trigger | New version required? |
|---------|----------------------|
| Re-extract after Audit Adjustment posted | **Yes** |
| Add/change Reporting Adjustment | **Yes** (after prior certify/freeze) |
| Change Comparative Snapshot binding | **Yes** |
| Correct extract error | **Yes** |
| Cosmetic label fix on dataset metadata only | Prefer **Yes** if hash scope includes metadata; never silent edit |
| New Framework mapping alone (no fact change) | **No** new Fact Snapshot; new **Published Pack** may reuse same Snapshot Version |
| Restatement after publish | **Yes** + restates link |

---

## 5. Lineage Patterns

### 5.1 Linear period lineage

```
P2026-Q1 / v1 (certified, frozen, published)
P2026-Q1 / v2 (restatement — supersedes v1 for future refs)
```

### 5.2 Comparative binding

```
P2026-Q1 / v1  comparative → P2025-Q1 / v3 (pinned)
```

If P2025-Q1 is later restated to v4, future periods may bind to v4; **already published** P2026-Q1 / v1 retains pin to v3 unless P2026-Q1 itself is restated.

### 5.3 Multi-framework reuse

```
SnapshotVersion SV-100
  → PublishedPack IFRS edition A (mapping M1)
  → PublishedPack IFRS_SME edition B (mapping M2)
```

Both packs pin SV-100; they must not re-extract live GL.

---

## 6. Relationship to V6.0.0 Version Control

| V6.0.0 | V6.0.1 |
|--------|--------|
| Published Pack Version lineage | Consumes Publication Snapshot ← Snapshot Version |
| Restatement Edition | Requires new Snapshot Version when facts/reporting adj change |
| Mapping / Policy versions | Orthogonal version streams; recorded on pack; do not mutate Snapshot Version facts |

---

## 7. Retention & Legal Hold

| Class | Rule |
|-------|------|
| Certified+ Snapshot Versions | Retain ≥ statutory / policy minimum; default enterprise assumption: retain while related publications retained |
| Draft abandoned | May drop under retention policy if never certified |
| Legal hold | Blocks purge of versions under hold |
| Operational live reports | Not snapshot-versioned; Accounting retention applies to journals |

---

## 8. Anti-Patterns (forbidden)

| Anti-pattern | Why |
|--------------|-----|
| Update certified version amounts in place | Breaks audit |
| Publish “as of today live balances” under snapshot label | Violates architecture |
| Point comparative to live prior period | Non-immutability |
| Share mutable dataset across versions | Identity collapse |
| Operational Reports writing into Snapshot Versions | Wrong track |

---

## 9. Certification

Snapshot Versioning Strategy is **CERTIFIED**.
