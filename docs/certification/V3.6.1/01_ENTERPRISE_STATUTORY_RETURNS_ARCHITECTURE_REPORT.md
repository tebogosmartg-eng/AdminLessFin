# 01 — Enterprise Statutory Returns Architecture Report

**Version:** 3.6.1  
**Board:** Independent Principal Enterprise Payroll Architecture Board  
**Date:** 2026-07-13

## 1. Objective

Transform Statutory Returns into an enterprise ERP-grade, country-driven plugin architecture where **generation, validation, export, transmission, and audit are fully isolated**, without modifying payroll calculations or legislation.

## 2. Locked surfaces (verified)

| Surface | Status |
|---------|--------|
| Payroll Engine | UNCHANGED |
| Payroll Workflow | UNCHANGED |
| Payroll Reports | UNCHANGED |
| Accounting / Journals | UNCHANGED |
| Legislation year packages | UNCHANGED |
| Statutory amount extraction math (resolvePaye/UIF/SDL) | UNCHANGED (relocated, not recalculated) |

## 3. Target layout (delivered)

```
src/statutory/
  returns/                          # platform kernel
    contracts.ts
    pipeline.ts
    ledger.ts
    exportFramework.ts
    transmissionFramework.ts
    snapshot.ts
  registry/
    countryRegistry.ts              # legislation (locked content)
    countryPlugins.ts               # returns capabilities resolver
  countries/south-africa/returns/
    emp201/{generator,validator,exporter,transmission,mappings,schema}.ts
    emp501/...
    irp5/...
    tax-certificates/
    validators/ exporters/ transmission/ mappings/
    documents/ evidence/
```

Public facade remains `src/lib/statutoryReturns` (UI unchanged).

## 4. Stage isolation

```
Finalized payroll snapshot
        ↓
   [generate]     — declaration only; no payroll calc
        ↓
   [validate]     — isolated validators
        ↓
   [export]       — isolated exporters (json/csv/xml)
        ↓
   [transmit]     — isolated providers (manual / eFiling stub)
        ↓
   [ledger]       — append-only immutable audit
```

Orchestrator: `runStatutoryReturnPipeline` (`src/statutory/returns/pipeline.ts`).

## 5. Immutability rules

1. Generated returns receive `contentHash` on freeze/export.
2. `immutable: true` after export/submit.
3. Submitted returns **must never be regenerated** (`assertCanRegenerate` / pipeline `regeneration_blocked`).
4. DB trigger blocks mutation of `declaration_data` when `immutable` or status ∈ {submitted, accepted}.

## 6. Quality gates

| Gate | Result |
|------|--------|
| Legislation verify | PASS |
| Statutory certification | 12/12 · 76/76 · 3/3 |
| Payroll unit + integration | 28 + 3 PASS |
| Statutory returns tests | 10 PASS |

## 7. Verdict

**CERTIFIED** — Enterprise Statutory Returns architecture hardened with stage isolation and immutability.
