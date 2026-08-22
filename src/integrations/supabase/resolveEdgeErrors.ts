/**
 * Edge-function error resolution at the client boundary.
 *
 * WHY THIS EXISTS
 * `supabase.functions.invoke()` reports EVERY non-2xx response with the same
 * fixed message:
 *
 *     "Edge Function returned a non-2xx status code"
 *
 * The server's real envelope — businessMessage, technicalMessage, category,
 * correlation id — is only on `error.context`, an unread `Response` that almost
 * no caller reads. The result is that a missing control account, a closed
 * period, a validation failure and a genuine outage are all reported to the
 * customer with the same meaningless sentence. That is the symptom behind
 * "recording a Bill produces an Edge Function error": the message names the
 * transport, never the cause.
 *
 * The application invokes edge functions from ~140 modules. Rather than edit
 * every call site — and miss the ones added tomorrow — the unwrapping happens
 * once, here, at the single boundary they all pass through. Any code that shows
 * `error.message` (which is nearly all of it) now shows the server's diagnosis.
 *
 * WHAT IT DOES NOT DO
 *  - It does not swallow, downgrade or hide a failure. The error is still an
 *    error, still returned to the caller, still has its original type and
 *    prototype, and `error.context` is left intact and unread (the body is
 *    inspected through `clone()`), so existing unwrapping code keeps working.
 *  - It does not invent text. If there is no envelope and no usable message,
 *    the original message is left exactly as it was.
 *  - It never throws. Any problem while resolving leaves the result untouched.
 *
 * Install AFTER installReadCoalescing so it wraps the outermost invoke.
 */
import { resolveEdgeFunctionError, isOpaqueEdgeMessage } from '@/lib/platform/edgeError';
import { PlatformError } from '@/lib/platform/platformError';

type InvokeArgs = [functionName: string, options?: Record<string, unknown>];
type InvokeResult = { data: unknown; error: unknown };
type InvokeFn = (...args: InvokeArgs) => Promise<InvokeResult>;

/**
 * Replaces the opaque transport message on an edge error with the server's own,
 * in place, preserving identity, prototype and `context`.
 */
async function enrich(error: unknown): Promise<void> {
  if (!error || typeof error !== 'object') return;

  const current = (error as { message?: unknown }).message;
  // Only the opaque transport string is replaced. A specific message that
  // supabase-js already produced (network failure, relay error) is left alone.
  if (!isOpaqueEdgeMessage(current)) return;

  const resolved = await resolveEdgeFunctionError(error);
  if (resolved === error) return;

  let message: string | undefined;
  let envelope: PlatformError['envelope'] | undefined;

  if (resolved instanceof PlatformError) {
    envelope = resolved.envelope;
    message = envelope.businessMessage || envelope.technicalMessage;
  } else {
    const m = (resolved as { message?: unknown })?.message;
    if (typeof m === 'string' && m.trim() && !isOpaqueEdgeMessage(m)) message = m;
  }

  if (!message) return;

  try {
    Object.defineProperty(error, 'message', {
      value: message,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    // A frozen error keeps its original message; nothing else is affected.
    return;
  }

  // Additive detail for callers that want to be more specific than the message.
  if (envelope) {
    try {
      Object.defineProperty(error, 'platformEnvelope', {
        value: envelope,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch {
      /* optional enrichment only */
    }
  }
}

/**
 * Installs edge-error resolution on a Supabase client. Returns the same client.
 *
 * `SupabaseClient.functions` is a getter returning a NEW `FunctionsClient` on
 * every access, so assigning to `client.functions.invoke` mutates a throwaway
 * object and does nothing. The property is redefined instead, exactly as
 * ./coalesceReads does, with a Proxy that overrides only `invoke`.
 */
export function installEdgeErrorResolution<T extends object>(client: T): T {
  const descriptor =
    Object.getOwnPropertyDescriptor(client, 'functions') ??
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'functions');

  const withResolution = (original: InvokeFn) =>
    (async (...args: InvokeArgs) => {
      const result = await original(...args);
      if (result?.error) {
        try {
          await enrich(result.error);
        } catch {
          // Resolution is best-effort: never convert a reportable failure into
          // a thrown one from inside the reporting path.
        }
      }
      return result;
    }) as InvokeFn;

  if (descriptor && !descriptor.get && descriptor.value) {
    const target = descriptor.value as { invoke: InvokeFn };
    const original = target.invoke.bind(target) as InvokeFn;
    target.invoke = withResolution(original);
    return client;
  }

  const getFresh = descriptor?.get?.bind(client);
  if (!getFresh) return client;

  Object.defineProperty(client, 'functions', {
    configurable: true,
    enumerable: false,
    get() {
      const fresh = getFresh() as { invoke: InvokeFn };
      const original = fresh.invoke.bind(fresh) as InvokeFn;
      const wrapped = withResolution(original);
      return new Proxy(fresh, {
        get(target, prop, receiver) {
          if (prop === 'invoke') return wrapped;
          return Reflect.get(target, prop, receiver);
        },
      });
    },
  });

  return client;
}
