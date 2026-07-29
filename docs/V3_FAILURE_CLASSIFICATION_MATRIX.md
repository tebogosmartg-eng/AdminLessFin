# AdminLess Fin V3 — Failure Classification Matrix

| Category | Code Pattern | Severity Default | Retryable | User Message Template | Recovery |
|----------|-------------|------------------|-----------|----------------------|----------|
| ValidationError | `VALIDATION_*` | error | No | "Some information is missing or invalid." | Correct fields |
| AuthenticationError | `AUTH_*` | critical | No | "Your session has expired." | Sign in again |
| AuthorizationError | `AUTHZ_*` | error | No | "You do not have permission." | Ask admin |
| BusinessRuleError | `BUSINESS_*` | warning | No | "This action cannot be completed." | Review business state |
| ConcurrencyError | `CONCURRENCY_*` | warning | Yes | "Record changed by someone else." | Refresh and retry |
| DuplicateError | `DUPLICATE_*` | warning | No | "Record already exists." | Use different values |
| ConflictError | `CONFLICT_*` | warning | No | "Conflicts with current state." | Review record |
| DatabaseError | `DB_*` | error | Yes | "Database error occurred." | Retry shortly |
| MigrationError | `MIGRATION_*` | critical | No | "Database not up to date." | Contact admin |
| NetworkError | `NETWORK_*` | error | Yes | "Unable to reach server." | Check connection |
| TimeoutError | `TIMEOUT_*` | error | Yes | "Operation took too long." | Retry |
| StorageError | `STORAGE_*` | error | Yes | "File storage unavailable." | Retry upload |
| DocumentGenerationError | `DOC_*` | error | Yes | "Document could not be generated." | Retry |
| PayrollError | `PAYROLL_*` | error | Yes | "Payroll operation failed." | Review run |
| AccountingError | `ACCOUNTING_*` | error | Yes | "Accounting operation failed." | Review entry |
| IntegrationError | `INTEGRATION_*` | error | Yes | "External integration failed." | Retry later |
| SubscriberError | `SUBSCRIBER_*` | warning | No | "Background process failed." | Action completed; note ref ID |
| UnknownPlatformError | `UNKNOWN_*` | critical | No | "Unexpected platform error." | Contact support |

**Rule:** Every failure belongs to exactly one category. Classification via `classifyFromMessage()` or explicit assignment at throw site.
