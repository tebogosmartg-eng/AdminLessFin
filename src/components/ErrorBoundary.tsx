import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center text-destructive">
                        <AlertCircle className="mr-2 h-6 w-6" />
                        Oops! Something went wrong.
                    </CardTitle>
                    <CardDescription>
                        An unexpected error occurred. Please try refreshing the page.
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