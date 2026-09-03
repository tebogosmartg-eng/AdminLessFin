/**
 * AdminLess Fin — Platform Error Envelope (Edge Function shared module)
 * Mirror of src/lib/platform/platformError.ts for Deno edge runtime.
 */

export const PLATFORM_ERROR_VERSION = '1.0';

export type FailureCategory =
  | 'ValidationError'
  | 'AuthenticationError'
  | 'AuthorizationError'
  | 'BusinessRuleError'
  | 'ConcurrencyError'
  | 'DuplicateError'
  | 'ConflictError'
  | 'DatabaseError'
  | 'MigrationError'
  | 'NetworkError'
  | 'TimeoutError'
  | 'StorageError'
  | 'DocumentGenerationError'
  | 'PayrollError'
  | 'AccountingError'
  | 'IntegrationError'
  | 'SubscriberError'
  | 'UnknownPlatformError';

export type FailureSeverity = 'info' | 'warning' | 'error' | 'critical';

export type PlatformErrorEnvelope = {
  version: typeof PLATFORM_ERROR_VERSION;
  code: string;
  category: FailureCategory;
  severity: FailureSeverity;
  businessMessage: string;
  technicalMessage: string;
  recoverySuggestion: string;
  correlationId: string;
  commandId?: string;
  companyId?: string;
  entityId?: string;
  timestamp: string;
  retryable: boolean;
  originalCause?: string;
  /** Postgres / PostgREST failure metadata (no secrets). */
  database?: {
    sqlState?: string;
    constraint?: string;
    message: string;
  };
};

type NormalizedCause = {
  technicalMessage: string;
  category?: FailureCategory;
  code?: string;
  database?: PlatformErrorEnvelope['database'];
  originalCause?: string;
};

function extractConstraintName(message: string): string | undefined {
  const m = message.match(/constraint "([^"]+)"/i);
  return m?.[1];
}

export function normalizePlatformCause(cause: unknown): NormalizedCause {
  if (cause instanceof Error) {
    return {
      technicalMessage: cause.message,
      originalCause: cause.stack ?? cause.message,
    };
  }
  if (typeof cause === 'string') {
    return { technicalMessage: cause, originalCause: cause };
  }
  if (cause && typeof cause === 'object') {
    const o = cause as Record<string, unknown>;
    const message =
      typeof o.message === 'string'
        ? o.message
        : typeof o.error === 'string'
          ? o.error
          : 'Unknown failure';
    const rawCode = typeof o.code === 'string' ? o.code : undefined;
    // Postgres/PostgREST SQLSTATEs are 5 characters; only treat code as a real
    // SQLSTATE (and surface it in `database`) when it looks like one — never
    // drop it just because it isn't one of the handful of codes we special-case.
    const sqlState = rawCode && /^[0-9A-Z]{5}$/.test(rawCode) ? rawCode : undefined;
    const constraint =
      (typeof o.constraint === 'string' ? o.constraint : undefined) ||
      extractConstraintName(message);
    const details = typeof o.details === 'string' ? o.details : undefined;
    const database =
      sqlState || constraint
        ? {
            sqlState,
            constraint,
            message: [message, details].filter(Boolean).join(' — '),
          }
        : undefined;
    // Deliberately do NOT fall back to a generic 'DatabaseError' category for
    // every other SQLSTATE here — that would short-circuit classifyFromMessage()
    // below (which reads the exception text) for any structured Postgres error,
    // including the business-rule RAISE EXCEPTIONs added in V17.1 (insufficient
    // stock, closed period, unbalanced journal) that classify more usefully by
    // message than by falling into a blanket DatabaseError bucket.
    const category =
      sqlState === '23505'
        ? 'DuplicateError'
        : sqlState === '23503'
          ? 'DatabaseError'
          : sqlState === '23514'
            ? 'ValidationError'
            : undefined;
    return {
      technicalMessage: message,
      category,
      database,
      originalCause: JSON.stringify({
        message,
        code: sqlState,
        details,
        hint: typeof o.hint === 'string' ? o.hint : undefined,
        constraint,
      }),
    };
  }
  return { technicalMessage: 'Unknown failure', originalCause: String(cause) };
}

export function createCorrelationId(prefix = 'corr'): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function classifyFromMessage(message: string): FailureCategory {
  const m = message.toLowerCase();
  if (m.includes('jwt') || m.includes('not authenticated') || m.includes('invalid token')) {
    return 'AuthenticationError';
  }
  if (m.includes('permission') || m.includes('forbidden') || m.includes('not authorized')) {
    return 'AuthorizationError';
  }
  if (m.includes('duplicate') || m.includes('unique constraint')) return 'DuplicateError';
  if (m.includes('conflict') || m.includes('already exists')) return 'ConflictError';
  if (m.includes('concurrent') || m.includes('version mismatch')) return 'ConcurrencyError';
  if (
    m.includes('insufficient stock') ||
    m.includes('insufficient fifo') ||
    m.includes('does not balance') ||
    m.includes('closed financial year') ||
    m.includes('cannot be deleted') ||
    m.includes('cannot be cancelled') ||
    m.includes('cannot be edited')
  ) {
    return 'BusinessRuleError';
  }
  // Mail delivery is an integration, not an unclassified server fault. Matched
  // before the generic "required"/"invalid" rules so a missing Resend secret is
  // not reported as a validation error or as UnknownPlatformError (HTTP 500).
  if (
    m.includes('email service is not configured') ||
    m.includes('resend_api_key') ||
    m.includes('resend_domain') ||
    m.includes('failed to send email') ||
    m.includes('domain is not verified')
  ) {
    return 'IntegrationError';
  }
  // An unroutable `method` in the request body is a malformed client request,
  // not a server fault: it must not be reported as a 500 / UnknownPlatformError.
  if (m.includes('unsupported method') || m.includes('unknown method')) return 'ValidationError';
  // PostgREST PGRST204 — the request body named a column that does not exist.
  // On the pass-through insert/update paths that column came from the caller, so
  // this is a malformed payload rather than a server fault. The offending column
  // stays in technicalMessage, so debuggability is unaffected.
  if (m.includes('column') && m.includes('schema cache')) return 'ValidationError';
  if (m.includes('validation') || m.includes('invalid') || m.includes('required')) return 'ValidationError';
  if (m.includes('timeout') || m.includes('timed out')) return 'TimeoutError';
  if (m.includes('network') || m.includes('fetch failed')) return 'NetworkError';
  if (m.includes('storage') || m.includes('upload')) return 'StorageError';
  if (m.includes('migration')) return 'MigrationError';
  if (m.includes('payroll')) return 'PayrollError';
  if (m.includes('journal') || m.includes('accounting')) return 'AccountingError';
  if (m.includes('document') || m.includes('pdf')) return 'DocumentGenerationError';
  if (
    m.includes('is not unique') ||
    m.includes('ambiguous') ||
    m.includes('could not choose the best candidate function') ||
    m.includes('does not exist')
  ) {
    return 'DatabaseError';
  }
  if (m.includes('rpc') || m.includes('database') || m.includes('postgres')) return 'DatabaseError';
  return 'UnknownPlatformError';
}

function defaultBusinessMessage(category: FailureCategory): string {
  const messages: Record<FailureCategory, string> = {
    ValidationError: 'Some information is missing or invalid. Please review and try again.',
    AuthenticationError: 'Your session has expired. Please sign in again.',
    AuthorizationError: 'You do not have permission to perform this action.',
    BusinessRuleError: 'This action cannot be completed due to a business rule.',
    ConcurrencyError: 'This record was changed by someone else. Refresh and try again.',
    DuplicateError: 'A record with these details already exists.',
    ConflictError: 'This action conflicts with the current state of the record.',
    DatabaseError: 'A database error occurred. Please try again shortly.',
    MigrationError: 'The platform database is not up to date. Contact your administrator.',
    NetworkError: 'Unable to reach the server. Check your connection and retry.',
    TimeoutError: 'The operation took too long. Please try again.',
    StorageError: 'File storage is unavailable. Please retry the upload.',
    DocumentGenerationError: 'The document could not be generated. Please retry.',
    PayrollError: 'A payroll operation failed. Review the run and retry.',
    AccountingError: 'An accounting operation failed. Review the entry and retry.',
    IntegrationError: 'An external integration failed. Please retry later.',
    SubscriberError: 'A background process failed but your action completed.',
    UnknownPlatformError: 'An unexpected platform error occurred.',
  };
  return messages[category];
}

function isRetryableCategory(category: FailureCategory): boolean {
  return ['NetworkError', 'TimeoutError', 'DatabaseError', 'StorageError', 'IntegrationError'].includes(
    category,
  );
}

function defaultRecoverySuggestion(category: FailureCategory, retryable: boolean): string {
  if (retryable) return 'Wait a moment and use Retry. If the problem persists, contact support with the correlation ID.';
  if (category === 'AuthenticationError') return 'Sign out and sign back in.';
  if (category === 'AuthorizationError') return 'Ask a company admin to grant the required permission.';
  if (category === 'ValidationError') return 'Correct the highlighted fields and submit again.';
  return 'Contact support with the correlation ID shown below.';
}

export function buildPlatformErrorEnvelope(
  cause: unknown,
  context: Partial<Omit<PlatformErrorEnvelope, 'version' | 'timestamp'>> & {
    correlationId: string;
  },
): PlatformErrorEnvelope {
  const normalized = normalizePlatformCause(cause);
  const technicalMessage = context.technicalMessage ?? normalized.technicalMessage;

  const category = context.category ?? normalized.category ?? classifyFromMessage(technicalMessage);
  const code = context.code ?? normalized.code ?? `${category.replace(/Error$/, '').toUpperCase()}_FAILED`;

  return {
    version: PLATFORM_ERROR_VERSION,
    code,
    category,
    severity: context.severity ?? 'error',
    businessMessage: context.businessMessage ?? defaultBusinessMessage(category),
    technicalMessage,
    recoverySuggestion:
      context.recoverySuggestion ?? defaultRecoverySuggestion(category, context.retryable ?? isRetryableCategory(category)),
    correlationId: context.correlationId,
    commandId: context.commandId,
    companyId: context.companyId,
    entityId: context.entityId,
    timestamp: new Date().toISOString(),
    retryable: context.retryable ?? isRetryableCategory(category),
    originalCause: context.originalCause ?? normalized.originalCause,
    database: context.database ?? normalized.database,
  };
}

export function platformErrorResponse(
  cause: unknown,
  context: Partial<Omit<PlatformErrorEnvelope, 'version' | 'timestamp'>> & {
    correlationId?: string;
  } = {},
  corsHeaders: Record<string, string> = {},
  statusOverride?: number,
): Response {
  const correlationId = context.correlationId ?? createCorrelationId('edge');
  const envelope = buildPlatformErrorEnvelope(cause, { ...context, correlationId });

  const status =
    statusOverride ??
    (envelope.category === 'AuthenticationError'
      ? 401
      : envelope.category === 'AuthorizationError'
        ? 403
        : envelope.category === 'ValidationError'
          ? 400
          : envelope.category === 'DuplicateError' || envelope.category === 'ConflictError'
            ? 409
            : 500);

  console.error('[platform-error]', envelope);

  return new Response(JSON.stringify({ ...envelope, error: envelope.businessMessage }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function httpStatusForCategory(category: FailureCategory): number {
  switch (category) {
    case 'AuthenticationError':
      return 401;
    case 'AuthorizationError':
      return 403;
    case 'ValidationError':
      return 400;
    case 'DuplicateError':
    case 'ConflictError':
    case 'ConcurrencyError':
      return 409;
    default:
      return 500;
  }
}
