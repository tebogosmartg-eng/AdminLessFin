import { test, expect, expectNoErrorBoundary } from './fixtures';
import { loadE2EEnv } from './env';

const env = loadE2EEnv();

test.describe('Security — unauthenticated access', () => {
  // Explicitly drop the shared authenticated storage state.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('landing page renders for anonymous visitors', async ({ page, diagnostics }) => {
    await page.goto('/welcome');
    await expectNoErrorBoundary(page);
    expect(diagnostics.pageErrors, 'no uncaught exceptions').toEqual([]);
  });

  test('sign-in page renders an email and password form', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expectNoErrorBoundary(page);
  });

  test('the root path shows the marketing landing page, never the app shell', async ({ page }) => {
    await page.goto('/');
    // By design ProtectedRoute renders Landing in place for anonymous visitors.
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);
  });

  test('protected routes redirect anonymous users to sign in', async ({ page }) => {
    for (const route of [
      '/chart-of-accounts',
      '/journal-entries',
      '/payroll',
      '/settings',
      '/general-ledger',
      '/banking',
      '/financial-statements',
    ]) {
      await page.goto(route);
      await expect(page, `${route} must redirect anonymous users`).toHaveURL(/\/auth/);
      // No authenticated shell may leak behind the redirect.
      await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);
    }
  });

  test('invalid credentials are rejected and no session is created', async ({ page }) => {
    await page.goto('/auth');
    await page.locator('input[type="email"]').first().fill('not-a-real-user@adminless.invalid');
    await page.locator('input[type="password"]').first().fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).first().click();

    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    const hasSession = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => k.includes('auth-token')),
    );
    expect(hasSession, 'no auth token may be stored after a failed login').toBe(false);
  });
});

test.describe('Security — authenticated session', () => {
  test('authenticated user reaches the application shell', async ({ page, diagnostics }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/auth/);
    await expectNoErrorBoundary(page);
    expect(diagnostics.pageErrors).toEqual([]);
  });

  test('session survives a full page reload', async ({ page }) => {
    await page.goto('/');
    await page.reload();
    await expect(page).not.toHaveURL(/\/auth/);
    const hasSession = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => k.includes('auth-token')),
    );
    expect(hasSession).toBe(true);
  });

  test('sign out clears the session and re-gates the app', async ({ page }) => {
    await page.goto('/');

    // Desktop viewports expose the sidebar Sign Out button directly.
    const sidebarSignOut = page.getByRole('button', { name: /sign out/i }).first();
    await expect(sidebarSignOut).toBeVisible();
    await sidebarSignOut.click();

    await page.waitForFunction(
      () => !Object.keys(window.localStorage).some((k) => k.includes('auth-token')),
      null,
      { timeout: 30_000 },
    );

    // The app must now refuse a protected route.
    await page.goto('/chart-of-accounts');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('the certification account resolves to a real Supabase identity', async ({ request }) => {
    const res = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
      data: { email: env.email, password: env.password },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.user?.id).toBeTruthy();
  });
});
