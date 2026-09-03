/**
 * AdminLess Fin — Canonical Platform Error Model (V3 Reliability Programme)
 *
 * Every failure across frontend, BOE, commands, dispatchers, subscribers,
 * edge functions, and UI must conform to this envelope.
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
};

export class PlatformError extends Error {
  readonly envelope: PlatformErrorEnvelope;

  constructor(envelope: PlatformErrorEnvelope) {
    super(envelope.businessMessage);
    this.name = 'PlatformError';
    this.envelope = envelope;
  }

  static fromUnknown(
    cause: unknown,
    context: Partial<Omit<PlatformErrorEnvelope, 'version' | 'timestamp'>> & {
      correlationId: string;
    },
  ): PlatformError {
    // An already-classified PlatformError thrown deeper in the stack (e.g. by
    // an edge-function error unwrap) must survive a second catch/rewrap intact
    // instead of being re-flattened by the generic Error-message branch below.
    if (isPlatformError(cause)) return cause;

    const technicalMessage =
      cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : 'Unknown failure';

    const category = context.category ?? classifyFromMessage(technicalMessage);
    const code = context.code ?? `${category.toUpperCase().replace(/ERROR$/i, '')}_FAILED`;

    return new PlatformError({
      version: PLATFORM_ERROR_VERSION,
      code,
      category,
      severity: context.severity ?? 'error',
      businessMessage: context.businessMessage ?? defaultBusinessMessage(category),
      technicalMessage: context.technicalMessage ?? technicalMessage,
      recoverySuggestion:
        context.recoverySuggestion ?? defaultRecoverySuggestion(category, context.retryable ?? false),
      correlationId: context.correlationId,
      commandId: context.commandId,
      companyId: context.companyId,
      entityId: context.entityId,
      timestamp: new Date().toISOString(),
      retryable: context.retryable ?? isRetryableCategory(category),
      originalCause: cause instanceof Error ? cause.stack ?? cause.message : String(cause),
    });
  }
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
  if (m.includes('validation') || m.includes('invalid') || m.includes('required')) return 'ValidationError';
  if (m.includes('timeout') || m.includes('timed out')) return 'TimeoutError';
  if (m.includes('network') || m.includes('fetch failed')) return 'NetworkError';
  if (m.includes('storage') || m.includes('upload')) return 'StorageError';
  if (m.includes('migration')) return 'MigrationError';
  if (m.includes('payroll')) return 'PayrollError';
  if (m.includes('journal') || m.includes('accounting')) return 'AccountingError';
  if (m.includes('document') || m.includes('pdf')) return 'DocumentGenerationError';
  if (m.includes('subscriber')) return 'SubscriberError';
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

function defaultRecoverySuggestion(category: FailureCategory, retryable: boolean): string {
  if (retryable) return 'Wait a moment and use Retry. If the problem persists, contact support with the correlation ID.';
  if (category === 'AuthenticationError') return 'Sign out and sign back in.';
  if (category === 'AuthorizationError') return 'Ask a company admin to grant the required permission.';
  if (category === 'ValidationError') return 'Correct the highlighted fields and submit again.';
  return 'Contact support with the correlation ID shown below.';
}

function isRetryableCategory(category: FailureCategory): boolean {
  return ['NetworkError', 'TimeoutError', 'DatabaseError', 'StorageError', 'IntegrationError'].includes(
    category,
  );
}

export function isPlatformError(value: unknown): value is PlatformError {
  return value instanceof PlatformError;
}

export function isPlatformErrorEnvelope(value: unknown): value is PlatformErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'category' in value &&
    'correlationId' in value
  );
}

export function parsePlatformErrorEnvelope(value: unknown, fallbackCorrelationId: string): PlatformError {
  if (isPlatformError(value)) return value;
  if (isPlatformErrorEnvelope(value)) return new PlatformError(value);

  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    if (typeof payload.error === 'string' || typeof payload.businessMessage === 'string') {
      return PlatformError.fromUnknown(payload.error ?? payload.businessMessage, {
        correlationId:
          typeof payload.correlationId === 'string' ? payload.correlationId : fallbackCorrelationId,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        category:
          typeof payload.category === 'string'
            ? (payload.category as FailureCategory)
            : undefined,
        businessMessage:
          typeof payload.businessMessage === 'string'
            ? payload.businessMessage
            : typeof payload.error === 'string'
              ? payload.error
              : undefined,
        technicalMessage:
          typeof payload.technicalMessage === 'string' ? payload.technicalMessage : undefined,
        recoverySuggestion:
          typeof payload.recoverySuggestion === 'string'
            ? payload.recoverySuggestion
            : typeof payload.recovery === 'string'
              ? payload.recovery
              : undefined,
        retryable: typeof payload.retryable === 'boolean' ? payload.retryable : undefined,
        commandId: typeof payload.commandId === 'string' ? payload.commandId : undefined,
        companyId: typeof payload.companyId === 'string' ? payload.companyId : undefined,
        entityId: typeof payload.entityId === 'string' ? payload.entityId : undefined,
      });
    }
  }

  return PlatformError.fromUnknown(value, { correlationId: fallbackCorrelationId });
}

export function toPlatformErrorResponse(envelope: PlatformErrorEnvelope, status = 500): Response {
  return new Response(JSON.stringify({ ...envelope, error: envelope.businessMessage }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
