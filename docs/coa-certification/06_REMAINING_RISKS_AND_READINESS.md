# Remaining Risks & Production Readiness

**Date:** 2026-07-29

## Production readiness

| Criterion | Status |
|-----------|--------|
| Migrations on production-linked project | Ready |
| Edge function deployed | Ready |
| System-account integrity (DB+API+UI) | Ready |
| Role vocabulary assignable | Ready |
| Client TypeScript / unit tests | Ready |
| Name-independent AR resolution | Ready |
| Legacy Spaceman chart fully role-tagged | Partial — see risks |

**Recommendation:** **GO** for production use of Claude’s CoA protections and vocabulary. Follow up on legacy Spaceman role completeness as a data hygiene task (not a blocker for the protection release).

## Remaining risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | Spaceman (primary cert tenant) has only 4 `account_role` values and **zero** `system_account` rows | Medium | Generator tenants are protected; optional one-time backfill of RE `system_account` for legacy charts |
| R2 | Bank/Sales on Spaceman often rely on subcategory / type rather than `account_role` | Low | Engines accept subcategory OR role; assign roles in Settings/admin when convenient |
| R3 | System-protection errors surface as HTTP 500 UnknownPlatformError | Low | Platform error classifier improvement (non-blocking) |
| R4 | Template GENERATE still seeds bank/cash/sales via codes only after this deploy of `accountRoles` | Low | Redeployed; new companies get roles from codes 1260/1270/4010 |
| R5 | Full Playwright matrix (all browsers/devices) not re-run for entire product | Low | CoA-specific chromium suite certified |

## Explicit non-goals of this release

- No CoA redesign
- No replacement of Claude’s migration design
- No mass rewrite of historical journal lines
- No mandatory Spaceman role backfill in this sprint
