# Legislative Domain Report

**Product:** AdminLess Fin · **Version:** 3.4 · **Date:** 2026-07-12

---

## Domains

| Domain | Path | Owns |
|--------|------|------|
| PAYE | `legislation/paye` | Brackets, rebates, thresholds |
| Medical | `legislation/medical` | §6A medical tax credits |
| UIF | `legislation/uif` | Ceiling, employee/employer rates |
| SDL | `legislation/sdl` | Levy rate, exemption threshold |
| Retirement | `legislation/retirement` | §11F limits, lump-sum table, death/severance |
| Travel | `legislation/travel` | Prescribed km rate, deemed inclusion |
| Fringe Benefits | `legislation/fringe-benefits` | Seventh Schedule rates |
| IRP5 | `legislation/irp5` | Source-code mappings |
| EMP201 | `legislation/emp201` | Submission fields + validation rules |
| BCEA | `legislation/bcea` | Leave, hours, overtime |
| COIDA | `legislation/coida` | Compensation earnings ceiling / assessment |
| Skills Development | `legislation/skills-development` | SETA grant percentages (levy remains in SDL) |

---

## Isolation rule

Each domain owns **only** its legislation. Domains must not import constants from sibling domains.

Future domains plug in by:

1. Adding a contract under `contracts/`
2. Creating `legislation/<domain>/versions/…`
3. Registering versions in `LEGISLATION_REGISTRY`
4. Extending `SouthAfricanLegislation` + resolver

---

## Domain gate: PASS
