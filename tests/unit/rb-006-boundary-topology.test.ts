/**
 * RB-006 REGRESSION VAULT (architecture/topology) — the app-level error
 * boundary must wrap the provider stack, never sit inside it.
 *
 * A structural guard: if someone moves <ErrorBoundary> back below the providers,
 * a provider throw becomes an uncatchable white screen again. This test reads
 * App.tsx source and asserts the outer boundary opens before AuthProvider and
 * closes after it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('RB-006 — error boundary wraps the provider stack', () => {
  const src = readFileSync(resolve(__dirname, '../../src/App.tsx'), 'utf8');

  it('opens an ErrorBoundary before AuthProvider', () => {
    const boundaryIdx = src.indexOf('<ErrorBoundary');
    const authIdx = src.indexOf('<AuthProvider');
    expect(boundaryIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    expect(boundaryIdx).toBeLessThan(authIdx);
  });

  it('closes the outer ErrorBoundary after the provider stack', () => {
    const authClose = src.lastIndexOf('</AuthProvider>');
    const boundaryClose = src.lastIndexOf('</ErrorBoundary>');
    expect(authClose).toBeGreaterThan(-1);
    expect(boundaryClose).toBeGreaterThan(authClose);
  });
});
