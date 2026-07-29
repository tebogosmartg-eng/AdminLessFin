import { toast } from 'sonner';
import {
  isPlatformError,
  parsePlatformErrorEnvelope,
  type PlatformErrorEnvelope,
} from '../lib/platform/platformError';
import { AnalyticsEvents } from '../lib/analytics/events';
import { trackError } from '../lib/analytics/productAnalytics';

export const showSuccess = (message: string) => {
  toast.success(message);
};

export const showError = (message: string) => {
  toast.error(message);
  trackError({
    eventName: AnalyticsEvents.ERROR_API_FAILURE,
    properties: { message, source: 'showError' },
  });
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};

const isDevMode = import.meta.env.DEV;

export function showPlatformError(
  cause: unknown,
  options?: {
    correlationId?: string;
    onRetry?: () => void;
  },
): PlatformErrorEnvelope {
  const correlationId = options?.correlationId ?? crypto.randomUUID();
  const envelope = isPlatformError(cause)
    ? cause.envelope
    : parsePlatformErrorEnvelope(cause, correlationId).envelope;

  const description = [
    envelope.recoverySuggestion,
    `Ref: ${envelope.correlationId}`,
    isDevMode ? envelope.technicalMessage : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  toast.error(envelope.businessMessage, {
    description,
    action: options?.onRetry && envelope.retryable
      ? { label: 'Retry', onClick: options.onRetry }
      : undefined,
    duration: 8000,
  });

  if (isDevMode) {
    console.error('[platform-error]', envelope);
  }

  const errorEvent =
    envelope.category === 'AuthenticationError' || envelope.category === 'AuthorizationError'
      ? envelope.category === 'AuthorizationError'
        ? AnalyticsEvents.ERROR_PERMISSION_FAILURE
        : AnalyticsEvents.ERROR_API_FAILURE
      : envelope.category === 'ValidationError'
        ? AnalyticsEvents.ERROR_VALIDATION_FAILURE
        : AnalyticsEvents.ERROR_API_FAILURE;

  trackError({
    eventName: errorEvent,
    properties: {
      category: envelope.category,
      business_message: envelope.businessMessage,
      correlation_id: envelope.correlationId,
      technical_message: envelope.technicalMessage,
      source: 'showPlatformError',
    },
  });

  return envelope;
}

export function formatPlatformErrorMessage(cause: unknown, fallbackCorrelationId?: string): string {
  const envelope = isPlatformError(cause)
    ? cause.envelope
    : parsePlatformErrorEnvelope(cause, fallbackCorrelationId ?? crypto.randomUUID()).envelope;
  return `${envelope.businessMessage} (Ref: ${envelope.correlationId})`;
}
