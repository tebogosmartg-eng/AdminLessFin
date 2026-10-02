# Readiness fixes and production rollout

The changes in this working tree are not a production sign-off. The July
certifications do not cover this release. Backup recovery and a rehearsal on
the full deployed schema remain release requirements.

Local verification completed: 1363 unit tests, 30 integration tests and 13 UI
component tests passed. TypeScript checking, lint (zero errors), the CFA guard,
production build and the localhost browser smoke check passed. The final npm
audit, retried after connectivity returned on 2 October, reported zero known
vulnerabilities. These checks made no production database changes. The browser
smoke test blocked external requests. Existing user changes were preserved.

## What changed

- Edge platform 4.2.2 verifies authentication before every wrapped handler.
  System/service jobs require the exact service-role bearer. The legacy
  unauthenticated system bootstrap is removed. Recurring invoice/bill APIs
  retain their restricted service scheduler operation alongside tenant access.
- Wrapped requests use a database-backed fixed one-minute quota, defaulting to
  180 requests per verified user per function, or per function for service jobs.
  `EDGE_REQUESTS_PER_MINUTE` may set an integer from 1 to 10000. Quota exhaustion
  returns 429 with Retry-After. Storage failure returns 503 without running the
  business handler. Anonymous traffic still needs hosting/gateway controls.
- Recurring journals lock the source row, post through the existing posting
  engine, and advance/delete the schedule in one database transaction. The
  occurrence date is included in the posting key. Failed occurrences roll back
  completely; already committed occurrences are skipped on retry.
- Scheduled and interactive depreciation share an atomic, row-locked RPC.
  Only completed calendar months are charged; it catches up months owing,
  caps at remaining depreciable value, and records the last completed month.
  Charges still post on the requested as-of date. Catch-up recognition needs
  accounting review before resuming a previously dormant schedule.
- Jobs report partial batch failures as HTTP 500. Successful source records
  remain committed; failed records can be retried without repeating successes.
- The company-switch test's router mock and stale selector are corrected.
  CI now runs TypeScript checking and UI component tests explicitly.
- Compatible security updates and the patched React Router 7 declarative API
  replace vulnerable dependencies. Node 22 matches CI. The old v7 flags are
  removed because their behavior is now built in.
- The public Security page no longer promises unverified automated backups.

## Safe deployment order

1. Confirm the production and isolated staging project references. Preserve
   existing uncommitted user changes and review the exact release diff.
2. Before a production mutation, capture a recoverable database backup AND
   an off-site copy of Storage objects. Record checksums, retention, owner,
   recovery-point target and recovery-time target. Database backups alone do
   not contain the uploaded files. Do not change billing without approval.
3. Restore into an isolated project with outbound email, integrations and
   scheduled jobs disabled. Compare ledger counts and balances, tenant
   memberships, payroll snapshots and representative attachment checksums.
   Record actual elapsed restoration time and the restored backup timestamp.
4. Apply `20261001160000_scheduled_accounting_is_atomic_and_requests_are_limited.sql`
   in staging. Rehearse against the full schema, including existing accounting
   policies, period locks and audit triggers. Run two overlapping database
   sessions against the same due source: prove exactly one posting and one
   source advancement. The embedded PostgreSQL tests prove rollback/replay;
   they do not prove multi-session concurrency or full-schema compatibility.
5. Inspect old scheduler journals and asset-register variances before resuming
   jobs. This migration does not delete or rewrite historical journals or guess
   how to repair old partial writes. Reconcile them through reviewed accounting
   corrections. Preview backlog charges and closed-period errors.
6. Verify every scheduler sends a service-role bearer from server-side secrets
   or Vault. Never place it in VITE variables, client code, logs or evidence.
   Apply the migration BEFORE deploying platform 4.2.2; missing quota/RPC
   functions intentionally stop requests. No direct-write fallback is allowed.
7. Redeploy ALL functions importing the shared platform, plus the changed
   recurring-invoices handler, from the same reviewed commit. Deploy the web
   build from that commit. Verify platform-version headers and migration state.
8. On isolated staging, test missing/invalid/user/service credentials for jobs,
   quota exhaustion/reset, a legitimate scheduled run, failed writes, retries,
   and interactive-versus-scheduled depreciation. Verify membership and role
   isolation for reads AND writes using two populated tenants.
9. Test onboarding, invoice/payment/void, bills, payroll, reporting, company
   switching and attachments on the production artifact against staging.
   The existing live E2E suite writes records: never run it blindly against
   customer companies. Verify scheduler alerts on non-2xx, including 429/503.
10. Approve the staged evidence, then release in a maintenance window with
    scheduler overlap avoided. Record frontend/edge commit, applied migration,
    timestamp, backup restore proof, checks run and known issues. Only issue GO
    once all required evidence is current and tied to that exact release.

## Rollback

Do not roll back to the unauthenticated/direct-write job implementations.
If a defect appears, pause scheduled jobs, preserve the additive migration and
quota table, and fix forward or deploy a reviewed build that retains the auth
boundary. A missing quota backend must not become an authentication bypass.
Existing committed financial records require accounting corrections, not an
automatic destructive database restore.

## Validation commands

```sh
npm ci
npm run ci
npm test
npm run test:integration
npm run test:dom
npm audit
```

The integration fixture executes the real posting-engine definition and this
migration in embedded PostgreSQL. It controls period/context/policy fixtures
and injects failures on journal-line and source writes. Full-schema staging
rehearsal and an actual restore drill remain necessary.

## Execution record — 2026-10-02 (owner-authorized)

Deployed by the owner's instruction, with the staging-restore and backup-drill
steps consciously skipped (free plan: no PITR or clone target; already a
recorded GO blocker in docs/rc1/KNOWN_ISSUES.md). What was done, in order:

1. Full local gate re-run on this tree: typecheck, lint (0 errors), 1363 unit
   + 30 integration + 13 DOM tests, CFA guard, production build, compliance
   content check.
2. `20261001160000` rehearsed against the LIVE schema in an aborted
   transaction (quota allow/deny/unauth-deny; depreciation RPC executed on a
   real asset — correctly "no month owing"; `authenticated` refused on all
   three RPCs; `depreciation_ytd*` columns present). The recurring RPC's
   column references were verified against the live catalog (no rows exist to
   execute it against).
3. `db push` applied `20261001160000` (`20261001100000`, the compliance seed
   and the cron jobs were already live from 1 October).
4. The 7 changed/new functions deployed first, then the remaining 57 — all 64
   platform importers now run 4.2.2 from this commit.
5. **Incident found and fixed during verification:** every scheduler call
   returned 401 under the strict gate. Two causes: the Vault secret
   `service_role_key` that jobs 7–9 reference HAD NEVER BEEN CREATED, and the
   key embedded in jobs 5–6 was STALE (fingerprint 3bd7e682/208 chars vs the
   live key 4a86a327/219 chars). The old platform's lenient system mode had
   masked this: jobs "succeeded" unauthenticated. Fix, entirely server-side:
   the current key was written to Vault, and jobs 5–6 were rewritten to the
   Vault pattern — no raw key remains in `cron.job` (verified by regex over
   the catalog; the key never appeared in terminal output or the repo).
6. All five jobs re-fired server-side: 200s across the board.
   `compliance-scheduler` completed its first real run (2 companies, 22
   reminders, exactly-once). `run-depreciation` first returned 400 because 7
   QA assets on the exception-listed Spaceman company have no depreciation
   accounts and can never post; the batch query now excludes unconfigurable
   assets (the atomic RPC still refuses them directly) and the job returns
   200. That selection fix is the one code change made during deployment.
7. Live checks after the mass redeploy: compliance security probe 12/12;
   browser specs against production — compliance journey + form resilience
   9/9, 14-module CRUD regression 31/31; seeded content checksums match
   `checksums.lock.json` exactly (19/19).

Still open after this rollout: backup/restore drill and recovery evidence
(blocked by plan tier), scheduler alerting on non-2xx, accounting review of
catch-up depreciation before resuming any dormant schedule, the Spaceman QA
assets' configuration, and professional review of the 19 draft compliance
rules.

References: [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[restore to a new project and exclusions](https://supabase.com/docs/guides/platform/clone-project),
[PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[React Router upgrade guidance](https://reactrouter.com/6.30.3/upgrading/future).
