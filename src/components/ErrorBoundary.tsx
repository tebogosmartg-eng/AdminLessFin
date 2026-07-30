import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { AppIcon } from './brand';
import { BRAND } from '../config/brand';
import { trackError } from '../lib/analytics/productAnalytics';

/**
 * Platform Reliability layer (V-Reliability).
 *
 * A single, configurable error boundary powering three nested levels so that
 * NO single page/section/widget failure can crash an entire workspace:
 *
 *   • level="app"     full-screen fallback — last-resort boundary around the whole tree.
 *   • level="route"   content-area fallback — keeps the sidebar/header shell alive when
 *                     a routed page throws or its lazy chunk fails to load.
 *   • level="section" compact inline fallback — isolates an individual widget/section so
 *                     one broken card degrades gracefully instead of blanking the page.
 *
 * All levels are RECOVERABLE: a retry button clears the error, and `resetKeys`
 * lets a parent auto-reset the boundary (e.g. on route change) so a user is
 * never stranded on an error screen. Dynamic-import ("chunk load") failures —
 * the most common SPA runtime failure after a redeploy — are detected and
 * offered a full reload, which is the only reliable recovery for a stale chunk.
 */

type BoundaryLevel = 'app' | 'route' | 'section';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  level?: BoundaryLevel;
  /** When any value changes between renders, a caught error auto-resets. */
  resetKeys?: unknown[];
  /** Invoked on reset (retry or resetKeys change) — e.g. to refetch queries. */
  onReset?: () => void;
  /** Override the fallback heading. */
  title?: string;
  /** Override the fallback body copy. */
  description?: string;
  /** Fully custom fallback. Receives the error and a reset callback. */
  fallbackRender?: (args: { error: Error; reset: () => void; isChunkError: boolean }) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Detects a failed dynamic import (lazy route/chunk). These surface with a
 * handful of browser-specific messages; matching them lets us show a "reload
 * to get the latest version" recovery instead of a generic crash screen.
 */
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const name = error.name || '';
  const msg = error.message || '';
  return (
    name === 'ChunkLoadError' ||
    /Loading (CSS )?chunk \d+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Next render shows the fallback UI.
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Auto-recover when the parent signals a context change (e.g. navigation).
    if (!this.state.hasError) return;
    const { resetKeys } = this.props;
    const prev = prevProps.resetKeys;
    if (!resetKeys || !prev) return;
    const changed =
      resetKeys.length !== prev.length ||
      resetKeys.some((key, i) => !Object.is(key, prev[i]));
    if (changed) this.reset();
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Uncaught error:', error, errorInfo);
    }
    // Telemetry must never itself throw and re-crash the boundary.
    try {
      trackError({
        eventName: 'error.frontend_exception',
        module: typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'app' : 'app',
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        properties: {
          level: this.props.level ?? 'app',
          chunk_error: isChunkLoadError(error),
          message: error.message,
          stack: error.stack?.slice(0, 500),
          component_stack: errorInfo.componentStack?.slice(0, 500),
        },
      });
    } catch {
      /* swallow telemetry failures */
    }
  }

  reset = () => {
    try {
      this.props.onReset?.();
    } catch {
      /* onReset must not block recovery */
    }
    this.setState({ hasError: false, error: null });
  };

  private reload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const error = this.state.error;
    const level = this.props.level ?? 'app';
    const chunk = isChunkLoadError(error);

    if (this.props.fallbackRender && error) {
      return this.props.fallbackRender({ error, reset: this.reset, isChunkError: chunk });
    }

    const heading =
      this.props.title ??
      (chunk
        ? 'A newer version is available'
        : level === 'section'
          ? 'This section could not load'
          : `${BRAND.product} hit an unexpected error`);

    const body =
      this.props.description ??
      (chunk
        ? 'This part of the app failed to load — usually because the app was updated in the background or the connection dropped. Reload to get the latest version.'
        : level === 'route'
          ? 'This page could not be displayed. You can retry, or use the navigation to move elsewhere — the rest of your workspace is unaffected.'
          : level === 'section'
            ? 'Something went wrong loading this section. The rest of the page still works.'
            : 'The page could not be rendered. Retry, or reload if the problem persists.');

    // --- Section: compact inline fallback -------------------------------
    if (level === 'section') {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="h-4 w-4" />
            {heading}
          </div>
          <p className="text-muted-foreground">{body}</p>
          <Button size="sm" variant="outline" onClick={chunk ? this.reload : this.reset}>
            {chunk ? <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
            {chunk ? 'Reload' : 'Try again'}
          </Button>
        </div>
      );
    }

    const card = (
      <Card className={level === 'app' ? 'w-full max-w-lg text-center' : 'mx-auto w-full max-w-xl'}>
        <CardHeader>
          {level === 'app' && (
            <div className="mb-4 flex justify-center">
              <AppIcon size="md" />
            </div>
          )}
          <CardTitle className={`flex items-center gap-2 text-destructive ${level === 'app' ? 'justify-center' : ''}`}>
            <AlertCircle className="h-6 w-6" />
            {heading}
          </CardTitle>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`flex flex-wrap gap-2 ${level === 'app' ? 'justify-center' : ''}`}>
            {chunk ? (
              <Button onClick={this.reload}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Reload
              </Button>
            ) : (
              <>
                <Button onClick={this.reset}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Try again
                </Button>
                <Button variant="outline" onClick={this.reload}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Reload page
                </Button>
              </>
            )}
          </div>
          {import.meta.env.DEV && error && (
            <pre className="mt-4 overflow-auto rounded-md bg-muted p-2 text-left text-xs">
              {error.toString()}
            </pre>
          )}
        </CardContent>
      </Card>
    );

    if (level === 'app') {
      return <div className="flex min-h-screen items-center justify-center bg-background p-4">{card}</div>;
    }
    // route-level: fills the content area, shell stays intact.
    return <div className="flex min-h-[50vh] items-center justify-center py-10">{card}</div>;
  }
}

/**
 * Widget/section boundary — isolates an individual page section so one broken
 * widget degrades to a small inline fallback instead of taking the page down.
 * Wrap independent dashboard cards, charts, and data panels with this.
 */
export const SectionErrorBoundary = ({
  children,
  resetKeys,
  onReset,
  title,
  description,
}: Omit<ErrorBoundaryProps, 'level'>) => (
  <ErrorBoundary level="section" resetKeys={resetKeys} onReset={onReset} title={title} description={description}>
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
