# Duplicate Constant Elimination Report

**Product:** AdminLess Fin · **Version:** 3.4.1 · **Date:** 2026-07-12

## Removed duplicate sources

| Former location | Disposition |
|-----------------|-------------|
| Domain trees `legislation/*/versions/` (V3.4 compose) | Deleted |
| `contracts/` domain compose types | Deleted |
| Orphan `tax-years/` | Deleted |
| Domain registry / compose resolver | Deleted |

## Single authoritative source

All brackets, rebates, medical credits, UIF, SDL, retirement, travel, fringe, thresholds, IRP5, EMP201 live only in `versions/<tax-year>/`.

Act library folders under `legislation/<act>/` contain READMEs only — **no rates**.

Engine `taxYears.ts` is adapter-only.

Edge mirror is a deploy copy of `src/statutory` (Deno boundary).

## Duplicate elimination gate: PASS
