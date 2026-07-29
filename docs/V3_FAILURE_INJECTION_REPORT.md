# AdminLess Fin V3 — Failure Injection Report

## Framework

**Module:** `src/lib/platform/failureInjection.ts`  
**Gated by:** `import.meta.env.DEV`

## Scenarios

| Scenario | Category | Retryable |
|----------|----------|-----------|
| network_timeout | TimeoutError | Yes |
| database_unavailable | DatabaseError | Yes |
| rpc_failure | DatabaseError | Yes |
| storage_failure | StorageError | Yes |
| permission_denied | AuthorizationError | No |
| duplicate_key | DuplicateError | No |
| invalid_enum | ValidationError | No |
| concurrent_update | ConcurrencyError | Yes |
| expired_jwt | AuthenticationError | No |
| missing_migration | MigrationError | No |
| subscriber_failure | SubscriberError | No |
| document_generation_failure | DocumentGenerationError | Yes |
| payroll_failure | PayrollError | Yes |
| accounting_failure | AccountingError | Yes |

## API

```typescript
import { simulateFailure, runFailureInjectionSuite } from '@/lib/platform/failureInjection';

// Single scenario
const err = simulateFailure('network_timeout');
// err.envelope has full PlatformError structure

// Full suite
const results = await runFailureInjectionSuite();
// Each result: { scenario, injected, envelope, recovered, message }
```

## Recovery Verification

Each scenario verifies:
1. Envelope has `correlationId` and `category`
2. `retryable` flag matches scenario definition
3. PlatformError is parseable and displayable via `showPlatformError`

## Production Safety

`isFailureInjectionEnabled()` returns `false` in production builds. Injection code is tree-shaken from production bundle when unused.

## Manual Verification Checklist

- [ ] Network timeout → toast with Retry
- [ ] Permission denied → no Retry button
- [ ] Subscriber failure → command still succeeds with warning
- [ ] Payroll bank batch DB failure → error surfaced, no false success
