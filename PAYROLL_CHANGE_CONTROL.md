# ADMINLESS FIN
# PAYROLL CHANGE CONTROL
# VERSION 3.3

## Module State

Payroll is in Maintenance Mode (Baseline Freeze V3.3 — Enterprise Posting Engine integrated).

## Allowed Change Classes

Only the following change classes are permitted:

- Legislative updates
- Critical defect fixes
- Security fixes
- Performance improvements

## Prohibited Without Governance Approval

- New payroll features
- Workflow redesign
- Architecture refactoring
- Non-critical enhancement work
- UI/UX expansion beyond defect remediation
- Bypassing the Enterprise Posting Engine for any payroll GL write

## Governance Requirements

- Feature requests are rejected by default during maintenance mode.
- Exception path requires formal product governance approval before implementation.
- All approved changes must preserve baseline architecture and pass mandatory regression baseline.
- Payroll must remain an Accounting Event Producer only — never a direct journal writer.

## Release Gate Enforcement

No Payroll maintenance release may proceed without:

- Build pass
- TypeScript pass
- Test pass
- Baseline E2E certification pass
- Phase 3D Posting Engine certification pass
- Regression baseline scenario pass

## Baseline Control References

- `PAYROLL_BASELINE.md`
- `PAYROLL_RELEASE_MANIFEST.md`
- `PAYROLL_REGRESSION_BASELINE.md`
- `docs/certification/V3.3/evidence/phase3d-posting-engine-live.json`
- `docs/certification/V3.1/06_PRODUCTION_READINESS_REPORT.md`
