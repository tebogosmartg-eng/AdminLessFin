# AdminLess Fin V3 — Command Reliability Report

## Before

- `BusinessCommandResult.success` always `true`
- Executor failures threw (unhandled by dispatcher)
- Subscriber failures could throw and abort post-mutation dispatch
- No correlation ID on results
- No lifecycle observability

## After

### BusinessCommandResult Contract

```typescript
interface BusinessCommandResult<TData> {
  success: boolean;
  status: 'success' | 'failure';
  error: PlatformErrorEnvelope | null;
  correlationId: string;
  subscribersExecuted: string[];
  subscribersFailed: string[];
  subscriberWarnings: string[];
  // ... existing fields (event, data, auditReference, etc.)
}
```

### Guarantees

| Guarantee | Implementation |
|-----------|----------------|
| SUCCESS or FAILURE | `dispatchBusinessCommand` always returns result object |
| Never undefined | Return type enforced; no implicit undefined |
| Never ambiguous success | `success: false` + populated `error` on failure |
| Partial subscriber failure ≠ command failure | Warnings collected; `success: true` if executor succeeded |
| Observability | 5 lifecycle phases logged via `emitCommandLog` |

### API

- `dispatchBusinessCommand()` — returns result envelope (non-throwing)
- `dispatchBusinessCommandOrThrow()` — throws `PlatformError` on failure (used by payroll)

### Files Modified

- `src/lib/boe/commandTypes.ts`
- `src/lib/boe/dispatchers/commandDispatcher.ts`
- `src/lib/payrollOperations.ts`

## Verification

Build passes. Payroll commands use `dispatchBusinessCommandOrThrow` preserving throw semantics for mutations while gaining subscriber isolation and observability.
