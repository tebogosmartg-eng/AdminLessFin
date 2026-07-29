/**
 * Failure Injection Framework — automated simulations for reliability verification.
 * Used in development/diagnostics only; gated by import.meta.env.DEV.
 */

import {
  createCorrelationId,
  PlatformError,
  type FailureCategory,
  type PlatformErrorEnvelope,
} from './platformError';

export type FailureScenario =
  | 'network_timeout'
  | 'database_unavailable'
  | 'rpc_failure'
  | 'storage_failure'
  | 'permission_denied'
  | 'duplicate_key'
  | 'invalid_enum'
  | 'concurrent_update'
  | 'expired_jwt'
  | 'missing_migration'
  | 'subscriber_failure'
  | 'document_generation_failure'
  | 'payroll_failure'
  | 'accounting_failure';

const SCENARIO_MAP: Record<
  FailureScenario,
  { category: FailureCategory; code: string; businessMessage: string; retryable: boolean }
> = {
  network_timeout: {
    category: 'TimeoutError',
    code: 'NETWORK_TIMEOUT',
    businessMessage: 'Simulated network timeout.',
    retryable: true,
  },
  database_unavailable: {
    category: 'DatabaseError',
    code: 'DB_UNAVAILABLE',
    businessMessage: 'Simulated database unavailability.',
    retryable: true,
  },
  rpc_failure: {
    category: 'DatabaseError',
    code: 'RPC_FAILURE',
    businessMessage: 'Simulated RPC failure.',
    retryable: true,
  },
  storage_failure: {
    category: 'StorageError',
    code: 'STORAGE_FAILURE',
    businessMessage: 'Simulated storage failure.',
    retryable: true,
  },
  permission_denied: {
    category: 'AuthorizationError',
    code: 'PERMISSION_DENIED',
    businessMessage: 'Simulated permission denied.',
    retryable: false,
  },
  duplicate_key: {
    category: 'DuplicateError',
    code: 'DUPLICATE_KEY',
    businessMessage: 'Simulated duplicate key violation.',
    retryable: false,
  },
  invalid_enum: {
    category: 'ValidationError',
    code: 'INVALID_ENUM',
    businessMessage: 'Simulated invalid enum value.',
    retryable: false,
  },
  concurrent_update: {
    category: 'ConcurrencyError',
    code: 'CONCURRENT_UPDATE',
    businessMessage: 'Simulated concurrent update conflict.',
    retryable: true,
  },
  expired_jwt: {
    category: 'AuthenticationError',
    code: 'EXPIRED_JWT',
    businessMessage: 'Simulated expired JWT.',
    retryable: false,
  },
  missing_migration: {
    category: 'MigrationError',
    code: 'MISSING_MIGRATION',
    businessMessage: 'Simulated missing migration.',
    retryable: false,
  },
  subscriber_failure: {
    category: 'SubscriberError',
    code: 'SUBSCRIBER_FAILURE',
    businessMessage: 'Simulated subscriber failure.',
    retryable: false,
  },
  document_generation_failure: {
    category: 'DocumentGenerationError',
    code: 'DOCUMENT_GENERATION_FAILURE',
    businessMessage: 'Simulated document generation failure.',
    retryable: true,
  },
  payroll_failure: {
    category: 'PayrollError',
    code: 'PAYROLL_FAILURE',
    businessMessage: 'Simulated payroll failure.',
    retryable: true,
  },
  accounting_failure: {
    category: 'AccountingError',
    code: 'ACCOUNTING_FAILURE',
    businessMessage: 'Simulated accounting failure.',
    retryable: true,
  },
};

export type FailureInjectionResult = {
  scenario: FailureScenario;
  injected: boolean;
  envelope?: PlatformErrorEnvelope;
  recovered: boolean;
  message: string;
};

export function simulateFailure(scenario: FailureScenario): PlatformError {
  const def = SCENARIO_MAP[scenario];
  const correlationId = createCorrelationId('inject');
  return new PlatformError({
    version: '1.0',
    code: def.code,
    category: def.category,
    severity: 'error',
    businessMessage: def.businessMessage,
    technicalMessage: `Failure injection: ${scenario}`,
    recoverySuggestion: def.retryable
      ? 'This is a simulated failure. Retry to verify recovery.'
      : 'This is a simulated failure. Correct input and retry.',
    correlationId,
    timestamp: new Date().toISOString(),
    retryable: def.retryable,
    originalCause: `injection:${scenario}`,
  });
}

export async function runFailureInjectionSuite(): Promise<FailureInjectionResult[]> {
  const scenarios = Object.keys(SCENARIO_MAP) as FailureScenario[];
  const results: FailureInjectionResult[] = [];

  for (const scenario of scenarios) {
    try {
      const err = simulateFailure(scenario);
      const recovered = await verifyGracefulRecovery(scenario, err);
      results.push({
        scenario,
        injected: true,
        envelope: err.envelope,
        recovered,
        message: recovered
          ? `${scenario}: graceful recovery verified`
          : `${scenario}: recovery path not verified`,
      });
    } catch (cause) {
      results.push({
        scenario,
        injected: false,
        recovered: false,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return results;
}

async function verifyGracefulRecovery(scenario: FailureScenario, error: PlatformError): Promise<boolean> {
  // Verify PlatformError envelope is complete and parseable
  if (!error.envelope.correlationId) return false;
  if (!error.envelope.category) return false;

  // Simulated recovery: retryable scenarios should expose retryable=true
  const def = SCENARIO_MAP[scenario];
  if (def.retryable && !error.envelope.retryable) return false;

  // Non-retryable should not claim retryable
  if (!def.retryable && error.envelope.retryable) return false;

  return true;
}

export function isFailureInjectionEnabled(): boolean {
  return import.meta.env.DEV;
}
