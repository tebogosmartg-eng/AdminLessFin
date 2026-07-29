# Duplicate Constant Audit

**Product:** AdminLess Fin · **Version:** 3.4 · **Date:** 2026-07-12

---

## Objective

Every SARS / statutory constant used for calculation or statutory mapping exists **exactly once** as authoritative data inside the Legislative Framework.

---

## Removed / superseded

| Former location | Disposition |
|-----------------|-------------|
| `tax-years/*` monolithic packages (V3.3) | Deleted — replaced by domain versions |
| `registry/legislationTypes.ts` flat bag | Replaced by `contracts/*` |
| Engine `taxYears.ts` literals | Adapter only (since V3.3) |
| Hardcoded rebate ages in utils | From PAYE thresholds (since V3.3) |

---

## Authoritative locations

| Constant class | Single home |
|----------------|-------------|
| Tax brackets / rebates / thresholds | `legislation/paye/versions/*` |
| Medical credits | `legislation/medical/versions/*` |
| UIF | `legislation/uif/versions/*` |
| SDL levy / exemption | `legislation/sdl/versions/*` |
| Retirement | `legislation/retirement/versions/*` |
| Travel | `legislation/travel/versions/*` |
| Fringe | `legislation/fringe-benefits/versions/*` |
| IRP5 / EMP201 | `legislation/irp5|emp201/versions/*` |
| BCEA / COIDA / Skills | respective domain versions |

---

## Acceptable non-authoritative copies

| Location | Reason |
|----------|--------|
| `supabase/functions/_shared/statutory/` | Deno deploy mirror of `src/statutory` |
| `certification.ts` / `verify.ts` expected numbers | Independent test oracles, not calculation inputs |

---

## Duplicate constant gate: PASS
