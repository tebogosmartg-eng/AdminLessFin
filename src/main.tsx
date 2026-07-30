import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import { assertLegislationRepositoryValid } from "./statutory";
import { installGlobalErrorHandlers } from "./lib/platform/globalErrorHandlers";

// RB-003: capture unhandled promise rejections and uncaught errors that React
// error boundaries structurally cannot see, and route them to telemetry.
installGlobalErrorHandlers();

assertLegislationRepositoryValid();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <App />
  </ThemeProvider>
);
