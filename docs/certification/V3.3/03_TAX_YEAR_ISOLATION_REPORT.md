# Tax Year Isolation Report

**Product:** AdminLess Fin  
**Version:** 3.3  
**Date:** 2026-07-12

---

## Principle

Each SARS tax year is a **self-contained package**. Packages must not import constants from sibling tax-year folders.

---

## Package inventory

### 2024-2025 / 2025-2026 / 2026-2027

Each folder contains:

| File | Content |
|------|---------|
| `paye.ts` | Tax brackets |
| `rebates.ts` | Primary / secondary / tertiary |
| `medical.ts` | Medical tax credits |
| `uif.ts` | UIF ceiling + rates |
| `sdl.ts` | SDL rate + exemption |
| `retirement.ts` | Deduction limits + lump-sum table + death/severance |
| `travel.ts` | Prescribed rate + deemed inclusion |
| `fringeBenefits.ts` | Seventh Schedule rates |
| `thresholds.ts` | Rebate ages + tax thresholds |
| `irp5.ts` | IRP5 source codes |
| `emp201.ts` | EMP201 fields |
| `index.ts` | Assembles `SouthAfricanLegislation` |

---

## Isolation verification

| Check | Result |
|-------|--------|
| No cross-imports between `2024-2025` ↔ `2025-2026` ↔ `2026-2027` | PASS |
| Identical rates across 2024/25 and 2025/26 are duplicated **inside** each package (intentional isolation) | PASS |
| 2026/2027 carries Budget 2026 bracket/rebate/medical updates only in its own folder | PASS |
| Engine `taxYears.ts` contains zero SARS literals | PASS |

---

## Effective date boundaries

| Tax year | From | To |
|----------|------|-----|
| 2024/2025 | 2024-03-01 | 2025-02-28 |
| 2025/2026 | 2025-03-01 | 2026-02-28 |
| 2026/2027 | 2026-03-01 | 2027-02-28 |

Pay dates outside all ranges → `LegislationResolutionError` (immediate failure).

---

## IRP5 / EMP201

Previously absent from TypeScript. Now versioned inside each tax-year package so reporting mappings can evolve with SARS without touching the payroll engine.
