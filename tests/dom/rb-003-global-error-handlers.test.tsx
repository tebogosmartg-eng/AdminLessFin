/**
 * RB-003 REGRESSION VAULT — unhandled rejections / uncaught errors must reach
 * telemetry, not vanish silently.
 *
 * React boundaries never catch async/event-handler failures. This suite proves
 * the global net installs listeners and forwards both event types to trackError,
 * with dedup, and that install is idempotent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { trackError } = vi.hoisted(() => ({ trackError: vi.fn() }));
vi.mock('@/lib/analytics/productAnalytics', () => ({ trackError }));

import {
  installGlobalErrorHandlers,
  __resetGlobalErrorHandlersForTest,
} from '@/lib/platform/globalErrorHandlers';

describe('RB-003 — global error safety net', () => {
  let dispose: () => void;

  beforeEach(() => {
    trackError.mockClear();
    __resetGlobalErrorHandlersForTest();
    dispose = installGlobalErrorHandlers();
  });

  afterEach(() => dispose());

  it('forwards an unhandled promise rejection to telemetry', () => {
    const evt = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(evt, 'reason', { value: new Error('async boom') });
    window.dispatchEvent(evt);

    expect(trackError).toHaveBeenCalledTimes(1);
    const arg = trackError.mock.calls[0][0];
    expect(arg.properties.source).toBe('unhandled_rejection');
    expect(arg.properties.message).toBe('async boom');
  });

  it('forwards an uncaught window error to telemetry', () => {
    const evt = new ErrorEvent('error', { error: new Error('sync boom'), message: 'sync boom' });
    window.dispatchEvent(evt);

    expect(trackError).toHaveBeenCalledTimes(1);
    expect(trackError.mock.calls[0][0].properties.source).toBe('window_error');
  });

  it('dedups a repeated rejection within the window', () => {
    for (let i = 0; i < 5; i++) {
      const evt = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(evt, 'reason', { value: new Error('same') });
      window.dispatchEvent(evt);
    }
    expect(trackError).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second install does not double-report', () => {
    installGlobalErrorHandlers(); // second call is a no-op
    const evt = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(evt, 'reason', { value: new Error('once') });
    window.dispatchEvent(evt);
    expect(trackError).toHaveBeenCalledTimes(1);
  });
});
