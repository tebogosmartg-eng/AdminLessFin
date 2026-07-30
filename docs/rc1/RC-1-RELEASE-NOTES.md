# Release Candidate RC-1

**Decision:** **NO-GO**  
**Score:** 96%  
**Certified commit:** `4a1c8672c3d6db41eb34eea52991d71273ee0524`  
**Verified at:** 2026-07-30T07:06:18.522Z  
**Production URL:** https://adminless-fin.vercel.app  
**Supabase project:** zaulhnpohrgqqodvzhxp (eu-west-1)  
**Organization plan:** free

## Closed this session (deployment-only)

| Gate | Result |
|------|--------|
| Production build hash vs certified release | PASS (`4a1c867…` match; asset `assets/index-C_00xzTO.js`) |
| Edge Functions 62/62 incl. `product-analytics` | PASS (deployed) |
| Error reporting (`product-analytics` TRACK → 200) | PASS |
| Scheduler `pg_cron` + `pg_net` | PASS (4 jobs; depreciation/recurring execute HTTP 200) |
| Environment required secrets | PASS |
| Migrations | PASS (85/85; latest `20260730120000`) |
| Auth / multi-company / storage / monitoring | PASS |
| Smoke (14/14) | PASS |

## Remaining blocker (blocks GO)

1. **Backups / PITR** — Org plan is **Free**. `walg_enabled=true`, `pitr_enabled=false`, restore points empty.  
   Management API: *Organization is not entitled to the selected PITR duration.*  
   **Required ops action:** Upgrade org `tebogom` → **Pro**, enable **PITR 7-day** addon, confirm restore timestamps via `supabase backups list`.

## Known issues

- `fin.adminless.co.za` not yet aliased on Vercel project `adminless-fin`.
- Optional secrets absent: `EFS_PUBLICATION`, `RESEND_*`, `OPENAI_API_KEY`.
- No dedicated reminder Edge Function; recurring invoices/bills cron scheduled.

## Rollback procedure

1. **Frontend:** Vercel → promote prior production deployment, or redeploy pre-`4a1c867`.
2. **Edge:** Redeploy functions from `4a1c867` (or previous tag).
3. **Cron:** `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'prod-%';`
4. **DB:** No PITR available until Pro+PITR; take logical dump before destructive changes.
5. **Secrets:** Remove `BETA_ANALYTICS_ALLOWLIST` only if rolling back analytics.

## Production sign-off

| Role | Status |
|------|--------|
| Release Engineering | Conditionally ready — blocked solely on Pro + PITR |
| Accounting certification | PASS (prior) |
| Runtime / smoke | PASS |
| **FINAL GO / NO GO** | **NO-GO** |

Evidence: `docs/ux/evidence/production-deployment-verification.json`
