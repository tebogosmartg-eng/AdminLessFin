# 06 — Production Readiness Report

**Version:** 3.6  
**Subject:** Statutory Returns module

## 1. Executive verdict

**READY FOR CONTROLLED ROLLOUT** of the Statutory Returns architecture and ZA generators (EMP201 / EMP501 / IRP5 / Tax Certificates).

SARS eFiling transport (XML/API submission) remains a subsequent delivery; persistence schema and submission fields (`submissionReference`, `submittedAt`, statuses) are in place.

## 2. Quality gates

| Gate | Evidence | Result |
|------|----------|--------|
| Payroll Engine unchanged by V3.6 deliverables | No edits under `src/lib/statutoryPayrollEngine` or shared engine packages in this sprint | ✓ |
| Payroll Reports unchanged | `src/lib/payrollReports.ts` not modified | ✓ |
| Accounting / Journals unchanged | No journal module edits | ✓ |
| Legislation unchanged | `verifyLegislation` ok; no package file edits | ✓ |
| Returns from finalized payroll only | Unit test rejects `draft`; generators use `isRunFinalized` | ✓ |
| Multi-country architecture | `registerStatutoryReturn` / country folders | ✓ |
| Existing payroll tests | `npm run test:payroll` — 24 unit + 3 integration | ✓ |
| Statutory certification | `npm run certify:statutory` — ALL PASSED | ✓ |
| New module tests | `tests/unit/statutory-returns.test.ts` | ✓ |

## 3. Delivered artefacts

| Artefact | Location |
|----------|----------|
| Core API | `src/lib/statutoryReturns/` |
| ZA generators | `countries/south-africa/{emp201,emp501,irp5}/` |
| UI | `src/pages/StatutoryReturns.tsx` · `/statutory-returns` |
| Nav | Payroll → Statutory Returns |
| Migration | `20260712190000_statutory_returns_module.sql` |
| Tests | `tests/unit/statutory-returns.test.ts` |
| Certification binder | `docs/certification/V3.6/` |

## 4. Deployment notes

1. Apply migration `20260712190000_statutory_returns_module.sql` (additive; RLS admin/owner).
2. Deploy frontend with `/statutory-returns` route.
3. No payroll edge redeploy required for generation (read APIs only).
4. Do not enable live SARS submission until transport + acceptance tests are certified.

## 5. Residual risks / follow-ons

| Item | Risk | Mitigation |
|------|------|------------|
| Migration not yet applied to remote | History table unused | Apply with next DB release |
| Session-only UI history until DB wired | Loss on refresh | Wire `statutory_returns` CRUD in follow-on |
| eFiling export formats | Not in scope for V3.6 architecture | Separate filing sprint |
| EMP501 vs prior EMP201 filings cross-check | Not yet vs submitted EMP201 store | Add when submission history durable |

## 6. Success criteria confirmation

> Adding a new statutory return or supporting a new country requires only: (1) create package, (2) register, (3) country mappings — with no Payroll Engine, Reports, Accounting, or Workflow changes.

**Confirmed** by registry design and ZA reference packages.

## 7. Board recommendation

**APPROVE** V3.6 Statutory Returns architecture for production codebase inclusion. Keep Payroll Engine, Payroll Reports, Legislation, Accounting, and Journals frozen.
