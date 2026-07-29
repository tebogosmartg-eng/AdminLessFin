import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loadE2EEnv, STORAGE_STATE } from './env';

/**
 * Performs one real UI sign-in and persists the resulting browser storage so
 * every spec begins from a genuine authenticated customer session. Failing here
 * fails the whole run, which is correct: without login nothing else is testable.
 */
export default async function globalSetup(config: FullConfig) {
  const env = loadE2EEnv();
  const baseURL = config.projects[0]?.use?.baseURL || 'http://127.0.0.1:4173';

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });

    await page.locator('input[type="email"]').first().fill(env.email);
    await page.locator('input[type="password"]').first().fill(env.password);
    await page.getByRole('button', { name: /sign in/i }).first().click();

    // The app redirects away from /auth once the Supabase session is stored.
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 });

    const authed = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => k.includes('auth-token')),
    );
    if (!authed) {
      throw new Error('Sign-in completed but no Supabase auth token was persisted.');
    }

    await context.storageState({ path: STORAGE_STATE });
    console.log(`[global-setup] Authenticated as ${env.email}; storage state saved.`);
  } catch (error) {
    await page
      .screenshot({ path: 'tests/e2e/artifacts/global-setup-failure.png', fullPage: true })
      .catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
}
