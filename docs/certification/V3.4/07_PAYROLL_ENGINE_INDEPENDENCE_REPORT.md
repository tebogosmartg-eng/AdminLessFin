# Payroll Engine Independence Report

**Product:** AdminLess Fin · **Version:** 3.4 · **Date:** 2026-07-12

---

## Verdict

The Payroll Engine contains **zero** legislation. It receives a `StatutoryRuleSet` produced from the Legislative Framework and performs calculations only.

---

## Engine may

- Receive legislation (via adapter)
- Perform calculations
- Return results / audit snapshots

## Engine must not

- Own tax brackets, rebates, credits, UIF/SDL rates, retirement limits, travel/fringe constants, IRP5/EMP201 maps, BCEA/COIDA/skills constants
- Resolve legislative versions (registry/resolver only)
- Silently fall back to another year’s legislation

---

## Independence evidence

| Check | Result |
|-------|--------|
| `registry/taxYears.ts` has no SARS literals | PASS |
| Engines read `ruleSet.*` only | PASS |
| Domain resolution outside engine | PASS |
| Calculation formulas unchanged | PASS |

---

## Independence gate: PASS
