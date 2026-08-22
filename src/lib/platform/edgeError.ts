/**
 * Unwrapping edge-function failures into the platform error envelope.
 *
 * `supabase.functions.invoke()` rejects with a FunctionsHttpError whose
 * `.message` is ALWAYS the fixed string
 *
 *     "Edge Function returned a non-2xx status code"
 *
 * regardless of what actually went wrong. The real envelope the enterprise edge
 * platform returns — businessMessage, technicalMessage, category, correlation id
 * — lives only on `error.context`, which is an unread `Response`.
 *
 * Every form that surfaces `error.message` directly therefore tells the customer
 * "Edge Function returned a non-2xx status code" for a missing control account,
 * a closed period, a validation failure, and a genuine outage alike. That is the
 * reported symptom behind "recording a Bill produces an Edge Function error":
 * the message names the transport, never the cause.
 *
 * Unwrap once, here, so every caller can report the server's real diagnosis.
 */
import { PlatformError, isPlatformErrorEnvelope } from './platformError';

/** True for the opaque supabase-js transport message. */
export function isOpaqueEdgeMessage(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    /Edge Function returned a non-2xx status code/i.test(message)
  );
}

/**
 * Resolves an error thrown by `supabase.functions.invoke` into a PlatformError
 * carrying the server's envelope where one is available. Returns the original
 * error untouched when the body is not a platform envelope, so nothing is lost.
 */
export async function resolveEdgeFunctionError(error: unknown): Promise<unknown> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).clone().json();
      if (isPlatformErrorEnvelope(body)) return new PlatformError(body);
      // Not an envelope, but still far better than the transport string.
      const message =
        (body as { businessMessage?: string; technicalMessage?: string; error?: string; message?: string })
          ?.businessMessage ??
        (body as { technicalMessage?: string })?.technicalMessage ??
        (body as { error?: string })?.error ??
        (body as { message?: string })?.message;
      if (typeof message === 'string' && message.trim()) return new Error(message);
    } catch {
      // Body was not JSON, or was already consumed — fall through.
    }
  }
  return error;
}

/**
 * Best-effort human-readable message for an edge failure. Never returns the
 * opaque transport string when anything better is available.
 */
export async function edgeErrorMessage(error: unknown, fallback = 'The request failed.'): Promise<string> {
  const resolved = await resolveEdgeFunctionError(error);
  if (resolved instanceof PlatformError) {
    return resolved.envelope.businessMessage || resolved.envelope.technicalMessage || fallback;
  }
  const message = (resolved as { message?: unknown })?.message;
  if (typeof message === 'string' && message.trim() && !isOpaqueEdgeMessage(message)) {
    return message;
  }
  return fallback;
}
