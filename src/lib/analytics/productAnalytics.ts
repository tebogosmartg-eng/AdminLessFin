import { supabase } from '@/integrations/supabase/client';
import { categoryForEvent, type AnalyticsCategory } from './events';
import {
  getAnalyticsSessionId,
  markFirstUsageTracked,
  wasFirstUsageTracked,
} from './session';

export type TrackEventInput = {
  eventName: string;
  category?: AnalyticsCategory;
  companyId?: string | null;
  userId?: string | null;
  route?: string;
  module?: string;
  durationMs?: number;
  properties?: Record<string, unknown>;
};

type QueuedEvent = TrackEventInput & {
  sessionId: string;
  timestamp: string;
};

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let contextUserId: string | null = null;
let contextCompanyId: string | null = null;

const FLUSH_INTERVAL_MS = 4_000;
const MAX_BATCH = 25;
const MAX_QUEUE = 500;

// Circuit breaker: once the analytics endpoint is proven unavailable (e.g. the
// edge function is not deployed → 404, or a network/CORS failure), stop trying
// for the rest of the session. Prevents repeated failed requests and repeated
// console warnings. Resets on next page load.
let flushSuspended = false;

function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

function moduleFromRoute(route: string): string {
  const segment = route.split('/').filter(Boolean)[0];
  return segment || 'home';
}

export function setAnalyticsContext(ctx: { userId?: string | null; companyId?: string | null }) {
  if (ctx.userId !== undefined) contextUserId = ctx.userId;
  if (ctx.companyId !== undefined) contextCompanyId = ctx.companyId;
}

export function trackEvent(input: TrackEventInput): void {
  // Opt-in only. Undeployed/unavailable analytics must never create failed network
  // requests or console noise during normal product use.
  if (import.meta.env.VITE_PRODUCT_ANALYTICS_ENABLED !== 'true') return;
  if (flushSuspended) return; // endpoint unavailable this session — don't buffer

  const route = input.route ?? currentRoute();
  const event: QueuedEvent = {
    ...input,
    category: input.category ?? categoryForEvent(input.eventName),
    route,
    module: input.module ?? moduleFromRoute(route),
    userId: input.userId ?? contextUserId,
    companyId: input.companyId ?? contextCompanyId,
    sessionId: getAnalyticsSessionId(),
    timestamp: new Date().toISOString(),
    properties: input.properties ?? {},
  };

  queue.push(event);

  if (queue.length >= MAX_BATCH) {
    void flushEvents();
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushEvents();
    }, FLUSH_INTERVAL_MS);
  }
}

/** True when the invoke error means the endpoint is effectively unreachable
 *  (function not deployed → 404, or a network/CORS/fetch failure). */
function isEndpointUnavailable(error: unknown): boolean {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  if (status === 404) return true;
  const message = String((error as { message?: string } | null)?.message ?? error ?? '');
  return /not\s*found|failed to (send|fetch)|networkerror|load failed/i.test(message);
}

export async function flushEvents(): Promise<void> {
  if (flushSuspended || queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);

  const fail = (error: unknown) => {
    if (isEndpointUnavailable(error)) {
      // Permanent for this session: trip the breaker and drop the buffer silently.
      flushSuspended = true;
      queue.length = 0;
      return;
    }
    // Transient: re-queue for a later attempt, but keep the buffer bounded.
    queue.unshift(...batch);
    if (queue.length > MAX_QUEUE) queue.splice(MAX_QUEUE);
  };

  try {
    const { error } = await supabase.functions.invoke('product-analytics', {
      body: {
        method: 'TRACK',
        events: batch.map((e) => ({
          event_name: e.eventName,
          event_category: e.category,
          user_id: e.userId,
          company_id: e.companyId,
          session_id: e.sessionId,
          route: e.route,
          module: e.module,
          duration_ms: e.durationMs ?? null,
          properties: e.properties,
          created_at: e.timestamp,
        })),
      },
    });
    if (error) fail(error);
  } catch (err) {
    fail(err);
  }
}

export function trackFirstUsageEvent(
  companyId: string,
  firstEventName: string,
  eventKey: string,
  properties?: Record<string, unknown>,
): void {
  if (!wasFirstUsageTracked(companyId, eventKey)) {
    markFirstUsageTracked(companyId, eventKey);
    trackEvent({ eventName: firstEventName, companyId, properties: { ...properties, is_first: true } });
  }
}

export function trackError(input: {
  eventName: string;
  module?: string;
  route?: string;
  companyId?: string | null;
  properties?: Record<string, unknown>;
}): void {
  trackEvent({
    ...input,
    category: 'error',
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flushEvents();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushEvents();
  });
}
