import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import { assertLegislationRepositoryValid } from "./statutory";

assertLegislationRepositoryValid();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <App />
  </ThemeProvider>
);
