/**
 * RB-003 — Global runtime error safety net.
 *
 * React error boundaries only catch errors thrown during render/commit. They do
 * NOT catch:
 *   • unhandled promise rejections (async event handlers, fire-and-forget calls)
 *   • errors thrown in event handlers, timers, or microtasks
 *
 * Without a global net these vanish into the console with no telemetry and no
 * user feedback. This module registers the two `window` listeners that capture
 * that whole class and forwards them to the existing `trackError` pipeline.
 *
 * Deliberately does NOT show UI or swallow the event — it observes and reports.
 * Idempotent, and returns a disposer so tests can install/uninstall cleanly.
 */
import { trackError } from '../analytics/productAnalytics';

let installed = false;
// Small time-boxed dedup so a tight rejection loop can't flood telemetry.
const recent = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000;

function shouldReport(signature: string): boolean {
  const now = Date.now();
  const last = recent.get(signature);
  // Prune opportunistically to bound the map.
  if (recent.size > 100) {
    for (const [k, t] of recent) if (now - t > DEDUP_WINDOW_MS) recent.delete(k);
  }
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return false;
  recent.set(signature, now);
  return true;
}

function describe(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) return { message: reason.message, stack: reason.stack };
  if (typeof reason === 'string') return { message: reason };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

function report(kind: 'unhandled_rejection' | 'window_error', reason: unknown) {
  const { message, stack } = describe(reason);
  if (!shouldReport(`${kind}:${message}`)) return;
  try {
    trackError({
      eventName: 'error.frontend_exception',
      module: typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'app' : 'app',
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      properties: { source: kind, message, stack: stack?.slice(0, 500) },
    });
  } catch {
    /* telemetry must never itself throw */
  }
  if (import.meta.env.DEV) {
    console.error(`[global:${kind}]`, reason);
  }
}

const onRejection = (e: PromiseRejectionEvent) => report('unhandled_rejection', e.reason);
const onError = (e: ErrorEvent) => report('window_error', e.error ?? e.message);

/** Install the global handlers once. Returns a disposer (mainly for tests). */
export function installGlobalErrorHandlers(): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onError);
  return () => {
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('error', onError);
    installed = false;
    recent.clear();
  };
}

/** Test-only: force-reset install state so a fresh listener set can be attached. */
export function __resetGlobalErrorHandlersForTest(): void {
  installed = false;
  recent.clear();
}
