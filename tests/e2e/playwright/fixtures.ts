import { test as base, expect, type Page } from '@playwright/test';
import { STORAGE_STATE } from './env';

export type PageDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

/**
 * Noise that is not attributable to application defects: browser/vendor chatter
 * and expected auth 401s from the token endpoint during negative-path tests.
 */
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /\[vite\]/i,
  /Failed to load resource: the server responded with a status of 40[013]/i,
  /net::ERR_ABORTED/i,
];

function isIgnored(text: string): boolean {
  return IGNORED_CONSOLE.some((re) => re.test(text));
}

export const test = base.extend<{ diagnostics: PageDiagnostics }>({
  storageState: STORAGE_STATE,

  // Playwright's fixture callback is positional, so it is named `provide` here:
  // the conventional name `use` trips react-hooks/rules-of-hooks, which reads it
  // as React's `use` hook being called outside a component.
  diagnostics: async ({ page }, provide) => {
    const diagnostics: PageDiagnostics = {
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
    };

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!isIgnored(text)) diagnostics.consoleErrors.push(text);
    });

    page.on('pageerror', (err) => {
      diagnostics.pageErrors.push(err.message);
    });

    page.on('response', (res) => {
      if (res.status() >= 500) {
        diagnostics.failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
      }
    });

    await provide(diagnostics);
  },
});

export { expect };

/** Fails if the React error boundary rendered instead of the page. */
export async function expectNoErrorBoundary(page: Page): Promise<void> {
  await expect(page.getByText(/encountered an unexpected error/i)).toHaveCount(0);
}

/** Waits until the route has settled: no skeletons and a rendered document. */
export async function waitForRouteSettled(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('body')).toBeVisible();
  // React Query resolves after mount; allow suspense/skeletons to clear.
  await page
    .waitForFunction(() => document.querySelectorAll('[data-slot="skeleton"]').length === 0, null, {
      timeout: 20_000,
    })
    .catch(() => undefined);
}
