# 01 — Enterprise Edge Function Standard

**Version:** 4.2.1  
**Status:** CERTIFIED  

---

## Purpose

Every Supabase Edge Function in AdminLess Fin shall execute through one certified platform lifecycle. Business handlers remain domain-specific; platform concerns are shared and identical.

---

## Non-Goals

- No redesign of Payroll, Accounting, or Reporting business rules  
- No new product functionality  
- No schema redesign  

---

## Mandatory Adoption

Every implemented function (`supabase/functions/<slug>/index.ts`) MUST:

1. Import `withEnterprisePlatform` and `ENTERPRISE_CORS_HEADERS` from `_shared/enterpriseEdgePlatform.ts`
2. Register via:

```typescript
serve(withEnterprisePlatform('<slug>', '<mode>', async (req, ctx) => {
  // domain logic only
}))
```

3. Use one of the certified auth modes: `tenant` | `system` | `service`
4. Return failures via `edgeFailure(ctx, error)` (Payroll may use domain `payrollErrorResponse(error, ctx)` that still emits correlation + CORS)

---

## Certified Platform Capabilities

| Capability | Standard |
|------------|----------|
| Request pipeline | `withEnterprisePlatform` wrapper |
| OPTIONS | Handled inside wrapper before handler |
| CORS | `ENTERPRISE_CORS_HEADERS` only |
| Correlation IDs | `x-correlation-id` (inbound accepted / outbound always set) |
| Auth | Mode-specific (see Auth Standard) |
| Company isolation | `company_users` for `tenant` mode |
| Structured errors | Platform error envelope via `platformError.ts` |
| Structured logs | JSON events `request.*` / `auth.*` / `ratelimit.observe` |
| Security headers | `X-Content-Type-Options: nosniff` + CORS |
| Observability | `x-platform-version`, `x-function-name`, elapsedMs logs |
| Rate-limit readiness | `ratelimit.observe` log buckets (no hard deny yet) |
| Timeout behaviour | Failures classified as `TimeoutError` when message matches; always HTTP response |

---

## Auth Modes

| Mode | Use | Examples |
|------|-----|----------|
| `tenant` | End-user JWT + company membership | payroll, accounting, work, customers, … |
| `system` | Cron / scheduled jobs | process-recurring-entries, run-depreciation |
| `service` | Service-role bearer required | send-quote-email, send-po-email, send-statement-email |

---

## Freeze Preservation

Payroll, Accounting, and Reporting handlers retain their business switch/case logic. Only the outer execution shell is standardised.
