# 01 — End-to-End Test Report (V6.6.0)

**Engagement:** V6.6.0 GRAP Annual AFS Certification — Demo Municipality  
**Reporting period:** FY2025/26  
**Run date:** 2026-07-14  
**Harness:** `tests/e2e/run-efs-e2e-certification.ts` (`npm run certify:efs`)

## Executive summary

The acceptance board executed the V6.6.0 certification harness against project `zaulhnpohrgqqodvzhxp`. Infrastructure probes passed; the authenticated statutory lifecycle could not be executed; publication outputs could not be generated.

**Verdict: NOT CERTIFIED**

## Phase execution matrix

| Phase | Scope | Status | Notes |
|-------|-------|--------|-------|
| 0 | Environment & edge reachability | **PARTIAL** | Supabase URL/key present; E2E credentials missing |
| 1 | Reporting Workspace → Period → Snapshot | **SKIP** | Blocked on authentication |
| 2 | Statement Engine (4 primary statements) | **SKIP** | Blocked on authentication |
| 3 | Working Papers → Lead Schedules → Evidence | **SKIP** | Blocked on authentication |
| 4 | Disclosures → Policies → Cross References | **SKIP** | Blocked on authentication |
| 5 | Validation (PASS required) | **SKIP** | Blocked on authentication |
| 6 | Manager / Partner review & digital sign-off | **SKIP** | Blocked on authentication |
| 7 | Publication (PDF / Word / Excel) | **BLOCKED** | Publication engine not implemented |

## Infrastructure verification (executed)

| Check | Result |
|-------|--------|
| `financial-statements` edge OPTIONS preflight | PASS (HTTP 200, CORS complete) |
| Edge function reachable | PASS |
| Auth enforcement on unauthenticated POST | PASS (400 `AUTHENTICATION_FAILED`) |
| Platform error envelope | PASS |

Source: `docs/financial-statements-internal-release/V6.5.2/evidence/edge-live-validation.json`

## Intended live workflow (when credentials available)

The certification harness automates the following API sequence against a real demo company:

1. `LIST_FRAMEWORK_PACKS` → resolve GRAP pack `2026.1`
2. `CREATE_PERIOD` / reuse `FY2025-26`
3. `CREATE_WORKSPACE` — *V6.6.0 GRAP Annual AFS Certification — Demo Municipality*
4. `CREATE_SNAPSHOT_DRAFT` → `EXTRACT_FACT_SNAPSHOT` → `CERTIFY_SNAPSHOT_VERSION`
5. `GENERATE_STATEMENTS` → verify `financial_position`, `financial_performance`, `cash_flows`, `changes_in_equity`
6. `CREATE_WORKING_PAPER` → finalize → `CREATE_LEAD_SCHEDULE` → `CREATE_SUPPORTING_EVIDENCE`
7. `ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK` → `CREATE_ACCOUNTING_POLICY_SET` → cross references
8. `RUN_VALIDATION` → require `blocking_count === 0`
9. `GET_OR_CREATE_PACK_REVIEW` → manager approve → partner approve → `MARK_PUBLICATION_READY`
10. Publication outputs — **expected BLOCKED** until Publication phase is implemented

## Demo company requirement

No EFS-specific seed company exists. Acceptance requires:

- A `companies` row with chart of accounts and journal activity for FY2025/26
- User in `company_users` with `owner` or `admin` role
- Balanced books (SFP must articulate for validation PASS)
- `E2E_EMAIL` / `E2E_PASSWORD` in `.env`

## Verification checklist (mission criteria)

| Criterion | Status |
|-----------|--------|
| Every statement amount traces to Reporting Snapshot | NOT VERIFIED (live run blocked) |
| Every disclosure traces to Statement Structure | NOT VERIFIED |
| Every Working Paper traces to Statement Nodes | NOT VERIFIED |
| Every Review decision recorded | NOT VERIFIED |
| PDF reproducible | **FAIL** — no publication engine |
| No Accounting changes | PASS (architecture: EFS read-only post-seal) |
| No duplicated calculations | PASS (statement engine consumes sealed facts only) |

## Remediation to re-run

1. Add `E2E_EMAIL` and `E2E_PASSWORD` to `.env` for a user with `owner`/`admin` on a company with FY2025/26 accounting data.
2. Run `npm run certify:efs`.
3. Implement Publication engine (Phase E) before Phase 7 can pass.

## Evidence

Full step log: [evidence/e2e-certification-evidence.json](./evidence/e2e-certification-evidence.json)
