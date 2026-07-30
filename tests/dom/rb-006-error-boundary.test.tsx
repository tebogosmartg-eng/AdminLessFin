/**
 * RB-006 REGRESSION VAULT — the app-level error boundary must contain throws
 * originating at the provider layer, not white-screen.
 *
 * Root cause: the ErrorBoundary wrapped only <AppRouter/>, so a render throw in
 * AuthProvider / ReportingPeriodProvider / AnalyticsBootstrap escaped above it →
 * uncatchable white screen. Fix hoisted an app-level boundary above the provider
 * stack. This suite proves the boundary catches a child throw and recovers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Telemetry must not hit the network in tests; also proves the boundary works
// even if trackError is a no-op.
vi.mock('@/lib/analytics/productAnalytics', () => ({ trackError: vi.fn() }));

import ErrorBoundary from '@/components/ErrorBoundary';

const user = userEvent.setup({ pointerEventsCheck: 0 });

let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error('provider-layer boom');
  return <div>recovered content</div>;
}

describe('RB-006 — app-level error boundary containment', () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught boundary errors to console.error; silence the noise.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders a recoverable fallback instead of a blank tree when a child throws', () => {
    render(
      <ErrorBoundary level="app">
        <Boom />
      </ErrorBoundary>,
    );
    // No white screen: a fallback with a retry affordance is shown.
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('recovered content')).not.toBeInTheDocument();
  });

  it('recovers to the child content when Try again is clicked after the fault clears', async () => {
    render(
      <ErrorBoundary level="app">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    shouldThrow = false; // simulate the transient/provider fault clearing
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('recovered content')).toBeInTheDocument();
  });

  it('section-level boundary degrades inline without a full-screen takeover', () => {
    render(
      <ErrorBoundary level="section">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
