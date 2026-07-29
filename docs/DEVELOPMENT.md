# AdminLess Fin — Local Development Runbook

Use this guide after cloning the repo or returning after a long break (e.g. moving from Dyad to Cursor).

## Prerequisites

- Node.js 18+
- npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for edge function deploys)

## First-time setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Supabase Dashboard → Project Settings → API**.

3. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

4. Sign in with a valid user. If the session is stale after inactivity, log out and log back in to refresh the JWT.

## Supabase edge functions

All database access goes through edge functions in `supabase/functions/`. The frontend never queries Postgres directly.

### Required dashboard secrets

In **Supabase Dashboard → Edge Functions → Secrets**, ensure these exist:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Auto-injected on hosted projects |
| `SUPABASE_ANON_KEY` | Auth verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB client after membership checks |

If `SUPABASE_SERVICE_ROLE_KEY` is missing or rotated, most functions return HTTP 500.

### Deploy a single function

After changing code under `supabase/functions/<name>/`:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy budgets
npx supabase functions deploy messages
npx supabase functions deploy reports
```

Replace function names with the folders you changed under `supabase/functions/`.

### Debugging 500 errors

Edge functions return HTTP 500 for auth, permission, and DB errors alike. Always check the **response JSON body**:

```json
{ "error": "User not authenticated." }
```

| Error message | Typical fix |
|---------------|-------------|
| `User not authenticated.` | Re-login; check JWT in Network tab |
| `Company ID is required.` | `activeCompany` not loaded — check `user-session` function |
| `Permission denied` | User not in `company_users` for that `company_id` |
| Project paused (free tier) | Wake project in Supabase Dashboard |

View server logs: **Supabase Dashboard → Edge Functions → Logs** (filter by function name).

## React Query conventions

Shared query factories live in [`src/lib/queries.ts`](../src/lib/queries.ts). Always spread them into `useQuery`:

```typescript
useQuery({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany })
```

Do **not** use `queryKey` alone without `queryFn` — TanStack Query v5 requires a fetch function unless a global default is configured (this project does not use one).

## Common console messages (safe to ignore)

- React DevTools download prompt (dev only)
- LaunchDarkly client initialized (info)
- Chrome extension `message channel closed` on some routes (browser extension, not app code)

## After long inactivity checklist

1. Wake / unpause Supabase project if on free tier
2. Verify edge function secrets in dashboard
3. Re-login to refresh auth session
4. Redeploy any locally fixed functions (e.g. `budgets`)
5. `npm install` if `package-lock.json` changed
6. Hard-refresh browser (Ctrl+Shift+R)
