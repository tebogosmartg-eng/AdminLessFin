/**
 * In-flight read coalescing for Edge Function invocations.
 *
 * WHY THIS EXISTS
 * Several workspaces mount two React Query definitions that fetch byte-identical
 * data under different cache keys, so React Query cannot deduplicate them and
 * the browser issues the same POST twice. Measured on the live tenant:
 *
 *   Dashboard  chart-of-accounts {method:GET}          x2  ~2.9 s combined
 *   Bills      chart-of-accounts {method:GET}          x2  ~1.6 s combined
 *   Banking    banking {method:GET_TRANSACTIONS}       x2  ~1.4 s combined
 *   Payroll    employees {method:GET}                  x2  ~1.2 s combined
 *   Payroll    expense-claims {method:GET_ALL}         x2  ~1.3 s combined
 *
 * (bank_transactions vs bank_transfers_view, and payroll_workspace vs
 * employees/expense_claims, are the specific colliding pairs.)
 *
 * WHAT IT DOES
 * If a request with an identical (function, body) is already in flight, the
 * second caller joins the first instead of opening a new one. Nothing is cached:
 * the entry is dropped the moment the request settles, so a later call always
 * hits the network again. That keeps data freshness exactly as it was — this
 * only removes work that was simultaneous and redundant.
 *
 * SAFETY RULES
 *  1. Reads only. A request is coalesced only when its body's `method` is an
 *     explicitly allow-listed read verb. Anything that could write — CREATE,
 *     UPDATE, DELETE, POST, GENERATE, or an unrecognised verb — is passed
 *     straight through, so no posting, journal or payroll mutation is ever
 *     merged with another.
 *  2. No aliasing. Each caller receives its own deep clone of the payload, so
 *     one consumer mutating its copy cannot corrupt another's.
 *  3. Failures are not shared beyond the callers already waiting, and are never
 *     retained, so a transient error cannot become sticky.
 */

/**
 * Read verbs used by the Edge Function API. Deliberately an allow-list rather
 * than a "block writes" deny-list: an unfamiliar verb must fall through to the
 * network untouched, never be assumed safe to merge.
 */
const READ_METHODS = new Set([
  'GET',
  'GET_ALL',
  'GET_TRANSACTIONS',
  'GET_BANK_ACCOUNTS',
  'GET_STATEMENT_LINES',
  'GET_TIMELINE',
  'GET_RUNS',
  'GET_READINESS',
  'GET_SUMMARY',
  'GET_DASHBOARD',
  'LIST',
  'LIST_TEMPLATES',
]);

type InvokeArgs = [functionName: string, options?: { body?: unknown } & Record<string, unknown>];
type InvokeResult = { data: unknown; error: unknown };
type InvokeFn = (...args: InvokeArgs) => Promise<InvokeResult>;

function isCoalescableRead(options?: { body?: unknown }): boolean {
  const body = options?.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;

  // Requests carrying files/streams are never merged — their bodies are not
  // comparable by value and their side effects are unknown.
  if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) return false;

  const method = (body as Record<string, unknown>).method;
  return typeof method === 'string' && READ_METHODS.has(method);
}

/** Stable key for a request. Falls back to "not coalescable" if unserialisable. */
function keyFor(fn: string, options?: { body?: unknown }): string | null {
  try {
    return `${fn}::${JSON.stringify(options?.body ?? null)}`;
  } catch {
    return null;
  }
}

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    // Payloads here are JSON from an Edge Function, so this path is a
    // belt-and-braces fallback for anything structuredClone rejects.
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
}

/**
 * Installs read coalescing on a Supabase client. Returns the same client.
 *
 * IMPORTANT — why this replaces the property rather than the method:
 * `SupabaseClient` declares `functions` as a getter that returns a **new**
 * `FunctionsClient` on every single access:
 *
 *     get functions() { return new FunctionsClient(this.functionsUrl.href, ...) }
 *
 * so assigning `client.functions.invoke = wrapped` mutates a throwaway object
 * and has no effect whatsoever — the next `supabase.functions.invoke(...)` gets
 * a fresh, unwrapped instance. An earlier revision did exactly that and shipped
 * a no-op that measured identically to no change at all.
 *
 * The fix redefines `functions` on the instance to return a Proxy over a freshly
 * constructed client (so auth headers and fetch config stay current) while
 * overriding only `invoke`. The in-flight map lives here, outside the getter, so
 * it persists across accesses — which is the whole point.
 */
export function installReadCoalescing<T extends object>(client: T): T {
  const descriptor =
    Object.getOwnPropertyDescriptor(client, 'functions') ??
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'functions');

  const inFlight = new Map<string, Promise<InvokeResult>>();

  const coalesce = (original: InvokeFn) =>
    ((...args: InvokeArgs) => {
      const [fnName, options] = args;

      if (!isCoalescableRead(options)) return original(...args);

      const key = keyFor(fnName, options);
      if (!key) return original(...args);

      const existing = inFlight.get(key);
      if (existing) {
        return existing.then((result) => ({ data: clone(result.data), error: result.error }));
      }

      const promise = original(...args).finally(() => {
        // Dropped on settle: this coalesces concurrent duplicates only, and
        // never serves a response to a request issued after the first finished.
        inFlight.delete(key);
      });

      inFlight.set(key, promise);
      return promise.then((result) => ({ data: clone(result.data), error: result.error }));
    }) as InvokeFn;

  // A plain data property (older/mocked clients) can be wrapped directly.
  if (descriptor && !descriptor.get && descriptor.value) {
    const target = descriptor.value as { invoke: InvokeFn };
    const original = target.invoke.bind(target) as InvokeFn;
    target.invoke = coalesce(original);
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
      const wrapped = coalesce(original);
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
