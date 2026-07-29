# 9. Outstanding Issues Register

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05

---

## Resolved During Certification

| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| CERT-001 | **HIGH** | Age 75+ did not receive secondary rebate (SARS requires primary + secondary + tertiary) | Fixed `resolveRebate()` in `utils.ts` |

---

## Open Issues

| ID | Severity | Engine | Description | Legislative Ref | Recommended Action |
|----|----------|--------|-------------|-----------------|-------------------|
| OIR-001 | MEDIUM | Audit | Employee number not in `calculation_snapshot` | — | Add `employee_id` to snapshot metadata (non-breaking) |
| OIR-002 | MEDIUM | CI | `certify:statutory` not in deployment pipeline | — | Add to CI workflow |
| OIR-003 | HIGH | Fringe Benefit | Simplified 3.5% company car model | Seventh Schedule | Document limitation; full formula in future sprint |
| OIR-004 | HIGH | Travel Allowance | Business use % only | §8(1)(b), SARS travel guide | Document limitation |
| OIR-005 | HIGH | Termination | Simplified severance PAYE; rebate re-applied on severance-only | §10(1)(x), IRP3(a) | Document limitation; verify with SARS lump-sum tables |
| OIR-006 | MEDIUM | PAYE | Directors' remuneration — no special handling | SARS directors guide | Document unsupported scenario |
| OIR-007 | MEDIUM | PAYE | YTD projection uses simplified month estimation | PAYE-GEN-01-G01 | Feed actual period count from payroll history |
| OIR-008 | LOW | Medical | Additional medical expenses credit not implemented | §6A(3) | Future enhancement |
| OIR-009 | LOW | Retirement | YTD retirement cap not aggregated across periods | §11F | Future enhancement |
| OIR-010 | LOW | SDL | `companyAnnualRemuneration` must be supplied externally | SDL Act | Ensure payroll context always provides value |

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wrong PAYE for 75+ employees | ~~High~~ | High | **RESOLVED** (CERT-001) |
| Incorrect fringe benefit tax | Medium | Medium | Disable engine until configured; disclose simplification |
| Incorrect termination tax | Low | High | Require manual review for termination payments |
| CI deployment without tests | Medium | High | Wire `certify:statutory` to CI |

---

## Issues Blocking Full Certification

1. OIR-003, OIR-004, OIR-005 — simplified optional engines not legislatively verified
2. OIR-002 — no automated pre-deployment gate
3. OIR-001 — audit trail gap for employee identifier

## Issues NOT Blocking Conditional Certification

Core monthly payroll (salary + PAYE + UIF + SDL + medical credits) is mathematically verified for standard permanent employees.
