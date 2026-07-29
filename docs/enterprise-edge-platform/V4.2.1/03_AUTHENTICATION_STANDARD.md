# 03 — Authentication Standard

**Version:** 4.2.1  
**Status:** CERTIFIED  

---

## Principles

1. Authenticate before business mutations.  
2. Resolve company context before tenant data access.  
3. Preserve multi-company isolation via `company_users`.  
4. Auth failures still return certified CORS + correlation headers.

---

## Mode: `tenant` (default)

| Step | Rule |
|------|------|
| JWT | `supabase.auth.getUser()` using caller Authorization |
| Failure | Throw `User not authenticated.` → `AuthenticationError` / HTTP 401 |
| Company | Body `company_id` required |
| Membership | `company_users` where `user_id` + `company_id` |
| Failure | `Permission denied.` → `AuthorizationError` / HTTP 403 |
| Admin client | Service role only after membership passes |

---

## Mode: `system`

| Step | Rule |
|------|------|
| Intended caller | Schedulers / cron |
| Preferred auth | Bearer = `SUPABASE_SERVICE_ROLE_KEY` |
| Legacy | Unauthenticated invoke logged as `auth.system_legacy_unauthenticated_invoke` |
| Data access | Service-role admin client only |

---

## Mode: `service`

| Step | Rule |
|------|------|
| Gate | `requireServiceRole(req, ctx)` — bearer must equal service role key |
| Failure | Treated as authentication failure |
| Use | Internal email senders previously open |

---

## JWT Validation

- Performed by Supabase Auth (`getUser`), not custom JWT parsing.
- Gateway `verify_jwt` remains **false** for product functions so OPTIONS and structured auth errors remain under platform control (handler-enforced auth).

---

## Multi-Company Isolation

- Tenant queries MUST filter by `company_id`.
- Membership check is mandatory for `tenant` mode (including `recurring-invoices`, remediated in V4.2.1).
- Invalid company for a valid user → Permission denied (not data leak).
