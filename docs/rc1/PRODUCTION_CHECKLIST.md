# Production Checklist

- [x] Build hash matches `4a1c8672c3d6db41eb34eea52991d71273ee0524`
- [x] Migrations synced (85/85, latest `20260730120000`)
- [x] Edge functions 62/62 (`product-analytics` deployed)
- [x] Scheduler operational (`pg_cron` + `pg_net`, 4 prod jobs)
- [x] Monitoring / error reporting
- [x] Required secrets present
- [x] Auth, RLS isolation, storage
- [x] Smoke 14/14
- [ ] **Pro plan + PITR enabled with restore timestamps** ← GO blocker
- [ ] (Optional) Attach `fin.adminless.co.za` to Vercel project
- [ ] (Optional) `RESEND_*` / `OPENAI_API_KEY` / `EFS_PUBLICATION`
