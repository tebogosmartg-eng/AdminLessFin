# 06 — Event Versioning Strategy

**Version:** 4.3.0  
**Status:** CERTIFIED  

---

## 1. Version field

Completed events carry `eventVersion` (string semver). Catalogue contracts are versioned per Event ID.

Default for all V4.3.0 certified payloads: **`1.0`**.

---

## 2. Compatibility rules

| Change type | Version impact | Allowed? |
|-------------|----------------|----------|
| Add optional metadata field | MINOR (`1.1`) | Yes — consumers ignore unknown |
| Add required field | MAJOR (`2.0`) | Yes — dual-publish window required |
| Remove/rename field | MAJOR | Yes — with deprecation |
| Change business meaning | New Event ID | Prefer new ID over overloading |
| Change publisher | Ownership amendment | Board approval |

---

## 3. Dual-publish window (breaking)

For MAJOR bumps:

1. Publisher emits `eventVersion=2.0` and optionally `1.x` shim for N releases  
2. Consumers migrate  
3. `1.x` retired via Ownership Register amendment  

---

## 4. Idempotency across versions

Idempotency keys are **version-agnostic** on business identity (`entityId` + transition), unless the MAJOR intentionally changes identity semantics (rare — requires explicit note).

---

## 5. Registry alignment

Code registry (`businessEvents.ts`) remains the runtime label/pipeline contract. Catalogue V4.3.0 is the **enterprise SoT** for cross-module integration. Implementation Approval must not invent Event IDs absent from this catalogue (or a later certified amendment).
