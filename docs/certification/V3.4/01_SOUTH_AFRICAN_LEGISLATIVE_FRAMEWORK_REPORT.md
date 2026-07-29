# South African Legislative Framework Report

**Product:** AdminLess Fin  
**Version:** 3.4  
**Board:** Independent Principal Enterprise Architecture Board  
**Date:** 2026-07-12

---

## Verdict

The V3.3 tax-year package model has been evolved into a **domain-versioned South African Legislative Framework**. Legislation is isolated by legislative domain. Payroll calculations remain locked and unchanged.

---

## Enterprise principle

> Legislation changes. Payroll calculations do not.

The Payroll Engine consumes `resolveSouthAfricanLegislation(payDate)`. It never owns SARS constants.

---

## Architecture

```
src/statutory/south-africa/
  contracts/          # Strict domain interfaces
  legislation/        # Domain-owned version trees
    paye|uif|sdl|medical|retirement|travel|
    fringe-benefits|irp5|emp201|bcea|coida|skills-development/
      versions/YYYY-YYYY/
  registry/           # Central registration only
  resolver/           # Sole version selection
  validation/         # Snapshot integrity
  index.ts
```

### Resolution flow

```
Pay Date
  → resolveSouthAfricanLegislation
  → independently resolve each domain version
  → validateSouthAfricanLegislation
  → SouthAfricanLegislation { paye, uif, sdl, medical, … }
  → legislationToStatutoryRuleSet (adapter)
  → Payroll Engine (calculations only)
```

---

## Evolution from V3.3

| V3.3 | V3.4 |
|------|------|
| Monolithic tax-year packages | Domain packages with independent versions |
| One folder change = full year bundle | Change only the affected domain |
| `tax-years/2025-2026/*` | `legislation/paye/versions/2025-2026/` etc. |
| Flat `SouthAfricanLegislation` constants bag | Composed snapshot of domain contracts |

---

## Locked domains (unchanged)

Payroll Architecture, Workflow, BOE, Commands, Events, Subscribers, Accounting, Security, Employee Number Engine, Statutory Calculation formulas — **LOCKED**.

---

## Success criteria

Future SA legislative updates are **data/version changes**, not software changes to Payroll, Accounting, Workflow, Reporting, UI, or Business Commands.
