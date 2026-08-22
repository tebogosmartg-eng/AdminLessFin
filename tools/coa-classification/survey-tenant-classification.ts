import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { countAccountsRequiringClassification } from '../../src/lib/accounting/accountClassification';

async function main() {
  const env = loadE2EEnv();
  const s = createClient(env.supabaseUrl, env.supabaseAnonKey);
  await s.auth.signInWithPassword({ email: env.email, password: env.password });
  const sess = await s.functions.invoke('user-session', { body: { method: 'GET' } });
  const companies = (sess.data?.companies ?? []) as Array<{ id: string; name: string }>;
  console.log(`companies: ${companies.length}`);
  for (const c of companies) {
    const r = await s.functions.invoke('chart-of-accounts', {
      body: { method: 'GET', company_id: c.id },
    });
    if (r.error) {
      console.log(`  ${c.name} (${c.id}) — GET failed: ${r.error.message}`);
      continue;
    }
    const accounts = (r.data as Array<Record<string, unknown>>) ?? [];
    const tally: Record<string, number> = {};
    for (const a of accounts) {
      const k = (a.category as string) || '(null)';
      tally[k] = (tally[k] ?? 0) + 1;
    }
    console.log(
      `  ${c.name} (${c.id.slice(0, 8)}) — ${accounts.length} accounts · ` +
        `${countAccountsRequiringClassification(accounts as never)} need classification · ${JSON.stringify(tally)}`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
