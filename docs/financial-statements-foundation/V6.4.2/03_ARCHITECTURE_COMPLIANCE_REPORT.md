# 03 — Architecture Compliance Report (Phase C1)

**Version:** 6.4.2  

| Certified mandate | Compliance |
|-------------------|------------|
| Permanent attachment model for downstream capabilities | ✅ Structure + Disclosure nodes |
| Nothing attaches to Statement Instances | ✅ No `statement_instance_id` on attachment points; API reject + forbidden catalogue |
| Framework-neutral nodes | ✅ |
| Framework packs alter presentation only | ✅ labels / taxonomy bridge |
| Dual-track operational vs statutory preserved | ✅ |
| No capability redesign (WP etc.) | ✅ points only |
| No Accounting / Reports / Snapshot / Engine redesign | ✅ |

## Attachment provenance path (future)

```
Capability artefact (future)
  → efs_attachment_points
    → efs_structure_nodes | efs_disclosure_nodes
      → (presentation) Framework Mapping / taxonomy
        → (amounts) Statement Instance lines ← read-only consumer; NOT attachment parent
```

## Verdict

**Architecture compliance: PASS**
