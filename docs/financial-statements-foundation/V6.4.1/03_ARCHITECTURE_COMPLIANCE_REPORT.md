# 03 — Architecture Compliance Report (Phase B)

**Version:** 6.4.1  

| Certified rule | Compliance |
|----------------|------------|
| EFRE Statement Engine consumes Fact Snapshots + Mapping | ✅ |
| Mapping never invents balances | ✅ type→taxonomy classification only |
| Multi-framework presentation packs | ✅ IFRS / IFRS_SME / GRAP / MCS / IPSAS |
| No disclosure / notes in Phase B | ✅ |
| Snapshot immutability preserved | ✅ Fact Snapshot triggers unchanged; statements pin version IDs |
| Dual-track operational vs statutory | ✅ Live route untouched |
| Navigation unchanged until authorised | ✅ |
| No Phase C/D capabilities | ✅ |

## Amount provenance (published-pack readiness path — Phase B partial)

For each statement line amount:

1. Trace to Fact Snapshot seal (`provenance.fact_snapshot_id` + `content_hash`) ✅  
2. Trace to MappingLine / default type map ✅  
3. Trace to TaxonomyLine ✅  
4. XBRL binding — deferred (not Phase B)

## Forbidden implementations confirmed absent

Working Papers · Lead Schedules · Notes · Disclosures · Validation · Review · Publication

## Verdict

**Architecture compliance: PASS**
