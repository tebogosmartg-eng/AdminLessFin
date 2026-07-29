import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

/**
 * DOM component tests (jsdom). Kept separate from vitest.config.ts so the large
 * node-environment engine suite stays fast and untouched. Run: `npm run test:dom`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/dom/setup.ts'],
    include: ['tests/dom/**/*.test.tsx'],
  },
});
