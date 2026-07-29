# 05 — Logging Standard

**Version:** 4.2.1  
**Status:** CERTIFIED  

---

## Format

All platform logs are single-line JSON to stdout/stderr.

### Info (`platformLog`)

```json
{
  "level": "info",
  "event": "request.start|request.options|request.success|auth.user_resolved|auth.company_resolved|ratelimit.observe|...",
  "platformVersion": "4.2.1",
  "functionName": "<slug>",
  "correlationId": "edge:<uuid>",
  "authMode": "tenant|system|service",
  "companyId": "<uuid>|null",
  "userId": "<uuid>|null",
  "requestMethod": "<domain method>|null",
  "elapsedMs": 0,
  "timestamp": "<iso>"
}
```

### Error (`platformLogError`)

Same base fields plus `category`, `message`, `level: "error"`.

---

## Correlation IDs

| Direction | Behaviour |
|-----------|-----------|
| Inbound | Accept `x-correlation-id` or `x-request-id` |
| Outbound | Always set `x-correlation-id` on OPTIONS/success/error |
| Logs | Always include `correlationId` |

---

## Audit Context

Minimum audit fields on platform logs:

- functionName  
- correlationId  
- authMode  
- userId (when resolved)  
- companyId (when resolved)  
- elapsedMs  

Domain audit tables (e.g. `ewm_audit_events`, email audit) remain the domain SoT; platform logs provide request-level observability.

---

## Rate Limiting Readiness

Event `ratelimit.observe` emits buckets:

- `tenant:<companyId>:<functionName>`  
- `service:<functionName>`  

No hard limiting in V4.2.1 — observation only for future quotas.

---

## Performance Metrics

`elapsedMs` is attached to every platform log relative to `startedAt`.
