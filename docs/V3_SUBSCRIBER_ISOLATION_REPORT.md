# AdminLess Fin V3 — Subscriber Isolation Report

## Problem

`eventDispatcher.ts` executed subscribers sequentially without isolation. A thrown error in any subscriber (Activity, Dashboard, AI, Notifications, Calendar, Audit, Documents) would abort the entire command after the business mutation succeeded.

## Solution

### Per-Subscriber Try/Catch

```typescript
for (const subscriber of subscribers) {
  try {
    const result = await subscriber.onEvent(event);
    subscribersExecuted.push(subscriber.subscriberId);
  } catch (cause) {
    // Record failure, continue to next subscriber
    subscribersFailed.push(subscriber.subscriberId);
    subscriberWarnings.push(`${subscriberId}: ${message} (${correlationId})`);
  }
}
```

### SubscriberResult Extension

```typescript
type SubscriberResult = {
  subscriberId: string;
  handled: boolean;
  status: 'success' | 'skipped' | 'failed';
  error?: { message: string; correlationId: string };
  // ... existing signal fields
};
```

### Behaviour

| Scenario | Command Result | User Impact |
|----------|---------------|-------------|
| All subscribers succeed | `success: true` | Normal |
| One subscriber fails | `success: true` + `subscriberWarnings` | Action completed; warning logged |
| Executor fails | `success: false` + `error` | Action failed; user notified |
| Subscriber not handling event | `status: 'skipped'` | No impact |

### Audit Subscriber Fix

Changed `auditReference.status` from `'recorded'` (false positive) to `'deferred'` with honest note that edge functions write audit trail.

## Files Modified

- `src/lib/boe/dispatchers/eventDispatcher.ts`
- `src/lib/boe/subscribers/contracts.ts`
- `src/lib/boe/subscribers/auditSubscriber.ts`

## Verification

Subscriber failure no longer propagates to command failure. Failed execution recorded with correlation ID.
