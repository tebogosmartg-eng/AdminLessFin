# 04 — Error Handling Standard

**Version:** 4.2.1  
**Status:** CERTIFIED  

---

## Rule

Every failure path returns a structured JSON body **and** certified CORS / correlation headers. The function must never terminate without an HTTP response.

---

## Envelope

Produced by `platformErrorResponse` / `edgeFailure`:

| Field | Required |
|-------|----------|
| version | yes (`1.0`) |
| code | yes |
| category | yes (`FailureCategory`) |
| severity | yes |
| businessMessage | yes |
| technicalMessage | yes |
| recoverySuggestion | yes |
| correlationId | yes |
| companyId | when known |
| timestamp | yes |
| retryable | yes |
| error | yes (alias of businessMessage for legacy clients) |

---

## HTTP Status Mapping

| Category | Status |
|----------|--------|
| AuthenticationError | 401 |
| AuthorizationError | 403 |
| ValidationError | 400 |
| DuplicateError / ConflictError / ConcurrencyError | 409 |
| TimeoutError / DatabaseError / NetworkError / other | 500 (Timeout/Network retryable) |

---

## Domain Special Case — Payroll

`payrollErrorResponse(error, ctx)` preserves Payroll domain fields (`stage`, `code`, `recovery`) **and** emits:

- certified CORS  
- `correlationId`  
- `x-correlation-id` / `x-platform-version` / `x-function-name`  

Business payroll rules are unchanged.

---

## Classification

`classifyFromMessage` maps thrown messages to categories (auth, permission, validation, payroll, accounting, timeout, etc.).
