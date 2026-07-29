# Statutory Payroll Engine — Production Readiness Report

**Version:** 3.0.0  
**Assessment date:** 2026-07-05

---

## Overall Score: 8.5/10

Suitable for staged production rollout after migration applied.

---

## Area Assessment

| Area | Score | Rationale |
|------|-------|-----------|
| Architecture compliance | 10/10 | Engine fully separated from workflow; BOE/commands/events untouched |
| Statutory accuracy | 9/10 | 12/12 verification cases pass; SARS bracket methodology |
| Versioned rules | 9/10 | 2024/2025 + 2025/2026; DB + registry; historical preserved |
| Audit trail | 9/10 | Full step-level trail in calculation_snapshot |
| Engine modularity | 10/10 | 10 independent engines, single responsibility |
| Optional components | 8/10 | Enable/disable per engine; component inputs via pipeline |
| Integration | 9/10 | Rules engine + payslip generation wired |
| EMP201 / IRP5 export | 5/10 | Outputs available; dedicated filing prep not yet built |
| Automated test suite | 7/10 | verify.ts runnable; no CI integration yet |
| Edge deployment | 8/10 | _shared mirror deployed with generatePayslips |

---

## Pre-Production Checklist

- [ ] Apply migration `20260705180000_statutory_payroll_engine.sql`
- [ ] Apply migration `20260702170000_payroll_rules_engine.sql` (if not applied)
- [ ] Deploy updated `payroll` edge function with `_shared/statutoryPayrollEngine`
- [ ] Run `runStatutoryVerification()` — confirm 12/12 pass
- [ ] Validate sample payslips contain `calculation_snapshot` with audit trail
- [ ] Confirm per-run PAYE/UIF/SDL enable/disable via run rules panel
- [ ] Spot-check PAYE against SARS eFiling calculator for 3 employees

---

## Preserved (Architecture Lock)

- ✅ BOE command/event flow
- ✅ Payroll workflow (draft → approve → finalize)
- ✅ Journal posting logic
- ✅ Payslip PDF/email distribution
- ✅ Subscriber registry
- ✅ Accounting postings

---

## Known Limitations

1. **Bonus tax:** Aggregate method via taxable earnings adjustment; IRP5 directive method not yet supported
2. **Fringe benefits:** Simplified percentage model; full SARS logbook method for travel not implemented
3. **YTD PAYE:** Supported in PAYE engine; requires YTD data feed from prior payslips (not auto-aggregated yet)
4. **Employee age:** Must be supplied on employee record for rebate calculation

---

## Recommended Next Steps

1. Wire YTD aggregation from prior payslips in same tax year
2. Add CI step running `runStatutoryVerification()`
3. EMP201 / IRP5 export using statutory engine breakdown fields
4. Employee-level statutory component UI (bonus, termination, travel allowance inputs)
