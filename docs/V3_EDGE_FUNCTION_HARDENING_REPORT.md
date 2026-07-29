# AdminLess Fin V3 — Edge Function Hardening Report

## Scope

54 edge functions in `supabase/functions/`. Payroll was the only function with structured errors before V3.

## Shared Module

**File:** `supabase/functions/_shared/platformError.ts`

Provides:
- `buildPlatformErrorEnvelope(cause, context)` — classify and wrap
- `platformErrorResponse(cause, context, corsHeaders)` — HTTP response with full envelope
- `httpStatusForCategory(category)` — 401/403/400/409/500 mapping
- Automatic correlation ID generation

## Migration Status

| Function | Status |
|----------|--------|
| `payroll` | ✅ Structured errors (PayrollDomainError); bank batch silent failures fixed |
| `bills` | ✅ Migrated to `platformErrorResponse` |
| Remaining ~52 | ⏳ Pending — still use `{ error: error.message }` |

## Critical Fixes Applied

### Payroll — GENERATE_BANK_BATCH
- **Before:** Returned `{ persisted: false }` on DB failure with HTTP 200
- **After:** Throws `PayrollDomainError` with code `BANK_BATCH_PERSIST_FAILED`

### Payroll — UPDATE_BANK_BATCH_STATUS
- **Before:** Ignored `statusUpdateError`, forced `error = null`
- **After:** Throws `PayrollDomainError` with code `BANK_BATCH_STATUS_UPDATE_FAILED`

## Required Pattern (All Functions)

```typescript
import { platformErrorResponse } from '../_shared/platformError.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    // validate auth, company, payload, business rules
    // ... handler logic
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });
  } catch (error) {
    return platformErrorResponse(error, { companyId }, corsHeaders);
  }
});
```

## Rollout Recommendation

Batch migrate by domain: invoices/quotes/credit-notes (revenue), bills/purchase-orders (purchases), employees, reports, settings.
