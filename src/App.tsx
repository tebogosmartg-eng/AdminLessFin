import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ReportingPeriodProvider } from "./contexts/ReportingPeriodContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { AnalyticsBootstrap } from "./lib/analytics/AnalyticsBootstrap";
import { AppRouter } from "./router";

// Configure global caching to prevent redundant loading states
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data stays "fresh" for 5 minutes
      gcTime: 1000 * 60 * 30,    // Keep data in cache for 30 minutes
      retry: 1,
      refetchOnWindowFocus: false, // Prevent unnecessary refetches when switching tabs
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {/* RB-006: outer app-level boundary wraps the ENTIRE provider stack.
            A render throw in AuthProvider / ReportingPeriodProvider /
            AnalyticsBootstrap now degrades to a recoverable fallback instead of
            an uncatchable white screen. The boundary consumes no context, so it
            is safe to mount above the providers. The inner boundary is retained
            to contain router-subtree failures independently. */}
        <ErrorBoundary level="app">
          <AuthProvider>
            <ReportingPeriodProvider>
              <AnalyticsBootstrap />
              <ErrorBoundary>
                <AppRouter />
              </ErrorBoundary>
            </ReportingPeriodProvider>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;