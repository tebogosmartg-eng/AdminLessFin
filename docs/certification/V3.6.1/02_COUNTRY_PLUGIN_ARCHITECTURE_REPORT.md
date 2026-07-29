# 02 — Country Plugin Architecture Report

**Version:** 3.6.1

## 1. Purpose

Make Statutory Returns a **country plugin**, not a payroll concern. The Payroll Engine stays country-agnostic.

## 2. Capability resolution

`resolveCountryCapabilities(countryCode)` returns:

| Capability | Source |
|------------|--------|
| Legislation | `countryRegistry` packages (LOCKED) |
| Payroll Rules | `legislationToStatutoryRuleSet` (derived, no engine change) |
| Statutory Returns | country plugin bundle `.returns` |
| Validators | bundle `.validators` |
| Exporters | bundle `.exporters` |
| Transmission Providers | bundle `.transmissionProviders` |
| Certificates | bundle `.certificates` |

Implementation: `src/statutory/registry/countryPlugins.ts`  
(separated from `countryRegistry.ts` to avoid circular imports with generators that read legislation).

## 3. ZA plugin bundle

`getSouthAfricaPluginBundle()` registers:

- EMP201, EMP501, IRP5, TAX_CERTIFICATE plugins
- Each plugin: `generate` · `validate` · `exportReturn` · `transmit` · `mappingsId` · `schemaId`

## 4. New country checklist (success criteria)

1. Create `countries/<slug>/` package  
2. Register country in `countryRegistry` (legislation)  
3. Add legislation year packages  
4. Add `returns/<type>/{generator,validator,exporter,transmission,mappings,schema}`  
5. Register validators  
6. Register exporters  
7. Register transmission providers  
8. Call `registerCountryPluginBundle`

**No** Payroll Engine, Reports, Accounting, Workflow, or UI redesign changes.

## 5. Verdict

**CERTIFIED** — Country plugin architecture complete for ZA; NA/BW remain ready stubs for legislation + future returns.
