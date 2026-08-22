/**
 * Restores the E2E user's server-side active company. The certification specs
 * switch it as a side effect, which leaves later evidence pointing at whichever
 * tenant ran last.
 *
 *   npx tsx tools/coa-classification/restore-active-company.ts <company-id>
 */
import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const TARGET = process.argv[2] || '26014bd5-f03f-44ae-93bd-64b5add2e09f';

async function main() {
  const env = loadE2EEnv();
  const s = createClient(env.supabaseUrl, env.supabaseAnonKey);
  await s.auth.signInWithPassword({ email: env.email, password: env.password });
  const r = await s.functions.invoke('settings', {
    body: { method: 'SWITCH_COMPANY', target_company_id: TARGET },
  });
  if (r.error) throw new Error(`Switch failed: ${r.error.message}`);
  const check = await s.functions.invoke('user-session', { body: { method: 'GET' } });
  console.log('active company now:', check.data?.activeCompany?.name, check.data?.activeCompany?.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
