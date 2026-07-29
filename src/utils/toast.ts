import { toast } from 'sonner';
import {
  isPlatformError,
  parsePlatformErrorEnvelope,
  type PlatformErrorEnvelope,
} from '../lib/platform/platformError';

export const showSuccess = (message: string) => {
  toast.success(message);
};

export const showError = (message: string) => {
  toast.error(message);
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

  console.error('[platform-error]', envelope);
  return envelope;
}

export function formatPlatformErrorMessage(cause: unknown, fallbackCorrelationId?: string): string {
  const envelope = isPlatformError(cause)
    ? cause.envelope
    : parsePlatformErrorEnvelope(cause, fallbackCorrelationId ?? crypto.randomUUID()).envelope;
  return `${envelope.businessMessage} (Ref: ${envelope.correlationId})`;
}
