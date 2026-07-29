import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { AlertCircle } from 'lucide-react';
import { AppIcon } from './brand';
import { BRAND } from '../config/brand';
import { AnalyticsEvents } from '../lib/analytics/events';
import { trackError } from '../lib/analytics/productAnalytics';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Uncaught error:", error, errorInfo);
    }
    trackError({
      eventName: 'error.frontend_exception',
      module: typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'app' : 'app',
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      properties: {
        message: error.message,
        stack: error.stack?.slice(0, 500),
        component_stack: errorInfo.componentStack?.slice(0, 500),
      },
    });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <div className="mb-4 flex justify-center">
                      <AppIcon size="md" />
                    </div>
                    <CardTitle className="flex items-center justify-center text-destructive">
                        <AlertCircle className="mr-2 h-6 w-6" />
                        {BRAND.product} encountered an unexpected error
                    </CardTitle>
                    <CardDescription>
                        The page could not be rendered. Refresh to try again, or contact support if the problem persists.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">Error details have been logged to the console.</p>
                    {this.state.error && (
                        <pre className="mt-4 p-2 text-left bg-muted rounded-md text-xs overflow-auto">
                            {this.state.error.toString()}
                        </pre>
                    )}
                </CardContent>
            </Card>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;