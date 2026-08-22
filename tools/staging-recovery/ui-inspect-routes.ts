import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = 'https://adminless-fin.vercel.app';

async function main() {
  const env = loadE2EEnv();
  const { supabase: api, company } = await connect('Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  for (const route of ['/general-ledger']) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(3500);
    const text = await page.locator('body').innerText();
    console.log(NL + `======== ${route} ========`);
    console.log(text.split(NL).filter((l) => l.trim()).slice(36, 110).join(NL));
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
