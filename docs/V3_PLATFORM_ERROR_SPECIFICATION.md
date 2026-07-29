# AdminLess Fin V3 — PlatformError Specification

**Version:** 1.0  
**Canonical module (frontend):** `src/lib/platform/platformError.ts`  
**Canonical module (edge):** `supabase/functions/_shared/platformError.ts`

---

## Envelope Structure

Every failure across the platform MUST conform to:

```typescript
type PlatformErrorEnvelope = {
  version: '1.0';
  code: string;                    // Machine-readable, e.g. BANK_BATCH_STATUS_UPDATE_FAILED
  category: FailureCategory;       // Exactly one category (see matrix)
  severity: 'info' | 'warning' | 'error' | 'critical';
  businessMessage: string;         // User-facing, actionable
  technicalMessage: string;        // Developer/diagnostic detail
  recoverySuggestion: string;      // What the user can do
  correlationId: string;             // Trace ID for support
  commandId?: string;
  companyId?: string;
  entityId?: string;
  timestamp: string;               // ISO 8601
  retryable: boolean;
  originalCause?: string;            // Stack or raw cause
};
```

HTTP responses include `{ ...envelope, error: envelope.businessMessage }` for backward compatibility.

---

## Failure Categories

| Category | HTTP Status | Retryable | Example |
|----------|-------------|-----------|---------|
| ValidationError | 400 | No | Missing company_id |
| AuthenticationError | 401 | No | Expired JWT |
| AuthorizationError | 403 | No | Insufficient role |
| BusinessRuleError | 422 | No | Cannot finalize draft run |
| ConcurrencyError | 409 | Yes | Version mismatch |
| DuplicateError | 409 | No | Unique constraint |
| ConflictError | 409 | No | Already exists |
| DatabaseError | 500 | Yes | Postgres RPC failure |
| MigrationError | 500 | No | Schema mismatch |
| NetworkError | 503 | Yes | Fetch failed |
| TimeoutError | 504 | Yes | Operation timed out |
| StorageError | 500 | Yes | Upload failed |
| DocumentGenerationError | 500 | Yes | PDF generation failed |
| PayrollError | 500 | Yes | Payroll calculation failed |
| AccountingError | 500 | Yes | Journal posting failed |
| IntegrationError | 502 | Yes | External API failure |
| SubscriberError | 200* | No | Background subscriber failed |
| UnknownPlatformError | 500 | No | Unclassified failure |

*Subscriber failures do not fail the parent command; they surface as warnings.

---

## API Usage

### Frontend — throw and parse

```typescript
import { PlatformError, parsePlatformErrorEnvelope } from '@/lib/platform/platformError';

throw PlatformError.fromUnknown(cause, { correlationId, companyId });

const err = parsePlatformErrorEnvelope(responseBody, correlationId);
```

### Frontend — display

```typescript
import { showPlatformError } from '@/utils/toast';

showPlatformError(cause, { onRetry: () => retry() });
```

### Edge Functions

```typescript
import { platformErrorResponse } from '../_shared/platformError.ts';

} catch (error) {
  return platformErrorResponse(error, { companyId }, corsHeaders);
}
```

---

## Migration Path

1. **Done:** Core modules created; BOE dispatchers consume envelope
2. **Done:** `bills` edge function migrated as reference
3. **Pending:** Remaining ~52 edge functions — replace `{ error: error.message }` catch blocks with `platformErrorResponse`
4. **Pending:** Payroll edge function — align `PayrollDomainError` output to full envelope (currently partial)

---

## Non-Negotiable Rules

- No generic `Error` objects escape platform boundaries without wrapping
- No `"Something went wrong"` without correlation ID and recovery suggestion
- Every catch block MUST classify, log, and surface (or rethrow as PlatformError)
