# Certification Index — V3.5.2 Payroll Edge Function Root Cause Investigation

**Product:** AdminLess Fin · **Version:** 3.5.2 · **Date:** 2026-07-12  
**Board:** Principal Enterprise Runtime Diagnostics Board  
**Decision:** Root cause **PROVEN** — no fix implemented in this sprint

---

## Deliverables

| # | Report | Path |
|---|--------|------|
| 1 | Runtime Exception Report | [01_RUNTIME_EXCEPTION_REPORT.md](./01_RUNTIME_EXCEPTION_REPORT.md) |
| 2 | Stack Trace Report | [02_STACK_TRACE_REPORT.md](./02_STACK_TRACE_REPORT.md) |
| 3 | Root Cause Report | [03_ROOT_CAUSE_REPORT.md](./03_ROOT_CAUSE_REPORT.md) |
| 4 | Failure Sequence Report | [04_FAILURE_SEQUENCE_REPORT.md](./04_FAILURE_SEQUENCE_REPORT.md) |
| 5 | Minimal Fix Recommendation | [05_MINIMAL_FIX_RECOMMENDATION.md](./05_MINIMAL_FIX_RECOMMENDATION.md) |

## Evidence

| Artifact | Path |
|----------|------|
| Live repro (GENERATE_PAYSLIPS + APPROVE_RUN) | [evidence/payroll-edge-500-repro.json](./evidence/payroll-edge-500-repro.json) |
| Multi pay-date GENERATE_PAYSLIPS | [evidence/generate-payslips-multi-run.json](./evidence/generate-payslips-multi-run.json) |

---

## One-line verdict

**Missing migration** `20260707140000_tax_year_2026_2027` → no `payroll_tax_year_config` row for pay dates after `2026-02-28` → `loadPayrollRulesContext` throws at `generatePayslips.ts:86` → HTTP 500.
