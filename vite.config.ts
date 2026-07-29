import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Phase P1.1 — delivery-layer only. Groups third-party dependencies into
// predictable, cacheable vendor chunks. Deliberately does NOT assign
// application source (src/**) to manual chunk names: every page is now
// behind React.lazy() (see src/router.tsx), and Rollup already gives each
// dynamic import() its own chunk automatically — forcing manualChunks onto
// those same modules is the classic way to accidentally merge lazy chunks
// back into a shared bundle and defeat the split, so app code is left for
// Rollup's own per-dynamic-import boundary to handle.
//
// Phase P1.1B — refined per-package placement below the top-level groups.
// Every regex here is backed by a confirmed dependency chain (`npm ls
// <pkg>`) and by a static-import-graph walk from src/main.tsx, not by
// package name alone. Two things fell out of that evidence that aren't
// obvious from the library names:
//   1. Several small packages (lucide-react, cmdk, date-fns, next-themes,
//      clsx/tailwind-merge/class-variance-authority, sonner, prop-types,
//      @stitches/core) are reached eagerly through Layout/SidebarNav/App.tsx
//      and must stay in the shared/eager bucket — moving them to their own
//      chunk would just rename the eager cost, not remove it.
//   2. A few transitive packages (regenerator-runtime, @babel/runtime) are
//      shared between two *different* lazy feature clusters (PDF export and
//      OCR, or PDF export and charts). Routing them into either cluster's
//      chunk would make visiting one feature silently download the other's
//      code too, so they're deliberately left in the shared bucket instead
//      — a few KB of eager cost is cheaper than that coupling.
function vendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;

  // Eager startup path (confirmed via static import-graph walk from
  // main.tsx: App.tsx / Layout.tsx / SidebarNav.tsx / ui/* are all
  // synchronously reachable, unlike every routed page).
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
  if (/node_modules\/(react-router|react-router-dom|@remix-run\/router)\//.test(id)) return "vendor-react-router";
  if (/node_modules\/(@supabase|iceberg-js)\//.test(id)) return "vendor-supabase";
  if (/node_modules\/@tanstack\/(react-query|query-core)\//.test(id)) return "vendor-react-query";
  if (/node_modules\/(@radix-ui|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|get-nonce|detect-node-es|aria-hidden|tslib)\//.test(id)) return "vendor-radix";

  // Lazy-only clusters (zero eager consumers, confirmed via the same
  // walker) — grouped by which route-level feature actually pulls them in,
  // so visiting one feature never downloads another's dependencies.
  if (/node_modules\/(jspdf|jspdf-autotable|html2canvas|dompurify|canvg|core-js|raf|rgbcolor|stackblur-canvas|svg-pathdata|fast-png|iobuffer|pako|fflate|performance-now)\//.test(id)) return "vendor-pdf";
  if (/node_modules\/tesseract\.js\//.test(id)) return "vendor-ocr";
  if (/node_modules\/(jsbarcode|qrcode|dijkstrajs)\//.test(id)) return "vendor-codes";
  if (/node_modules\/(recharts|d3-[a-z-]+|react-smooth|recharts-scale|decimal\.js-light|victory-vendor|internmap|eventemitter3|tiny-invariant|fast-equals|react-transition-group|dom-helpers)\//.test(id)) return "vendor-recharts";
  if (/node_modules\/(react-hook-form|zod|@hookform\/resolvers|react-day-picker)\//.test(id)) return "vendor-forms";
  if (/node_modules\/(@tanstack\/react-virtual|@tanstack\/virtual-core)\//.test(id)) return "vendor-virtual";
  if (/node_modules\/lodash\//.test(id)) return "vendor-lodash";
  if (/node_modules\/papaparse\//.test(id)) return "vendor-csv";

  // Shared bucket: genuinely-eager small utilities (see note above) plus
  // any remaining small/rare package not worth its own chunk.
  return "vendor";
}

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
}));
