# 05 — Versioning & Deprecation Strategy

**Version:** 4.4.0  
**Status:** CERTIFIED  

---

## 1. Version planes

| Plane | Scheme | Example |
|-------|--------|---------|
| Product / governance packs | `Vmajor.minor.patch` | V4.4.0 |
| Domain / KPI / Event catalogues | Pack version + ID immutability | V4.1.5 KPI; V4.3.0 Event |
| Edge platform | Platform version header | `x-platform-version: 4.2.1` |
| APIs / edge methods | Additive methods; deprecate then remove | `method` string contracts |
| DB | Timestamp migration IDs | `20260713120000_…` |
| Legislation | Tax year pack IDs | `2026-2027` |
| Events | `eventVersion` semver | `1.0` → `1.1` / `2.0` |
| App UI | Release version | Align to product release |

---

## 2. Compatibility policy

| Change | Version impact |
|--------|----------------|
| Clarification / non-behavioural | PATCH |
| Additive compatible | MINOR |
| Breaking contract / meaning change | MAJOR (or new ID) |
| Legislative year | New pack (additive) |

**Backward compatibility is preserved wherever practical.** Breaking requires Architecture review and dual-publish/migration window.

---

## 3. Deprecation policy (mandatory)

1. **Announce** — deprecation notice with end date and consumers  
2. **Dual-run** — old + new supported  
3. **Migrate consumers** — tracked to completion  
4. **Remove** — only after window or Governance waiver  
5. **Archive** — retain docs/IDs for audit (minimum 10 years for governance; 7+ years statutory where applicable)

Minimum deprecation window: **one minor release** for Minor/Major additive replacements; **one major release cycle** for Breaking removals (unless Security Emergency).

---

## 4. Forbidden versioning behaviours

- Reusing Event IDs / KPI IDs with new meaning  
- Mutating closed tax year packs  
- Silent removal of edge methods  
- Dropping DB columns without deprecation cycle  

---

## 5. Audit of versions

Every release records versions of: governance pack, edge platform, event catalogue, KPI catalogue, legislation packs touched, app build.
