import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

async function main() {
  const env = loadE2EEnv();
  const s = createClient(env.supabaseUrl, env.supabaseAnonKey);
  await s.auth.signInWithPassword({ email: env.email, password: env.password });
  const sess = await s.functions.invoke('user-session', { body: { method: 'GET' } });
  const companyId = sess.data?.activeCompany?.id || env.companyId;
  const r = await s.functions.invoke('accounting-setup', {
    body: { method: 'GET_STATUS', company_id: companyId },
  });
  if (r.error) {
    console.log('GET_STATUS failed:', r.error.message);
    return;
  }
  const v = (r.data as { validation?: Record<string, unknown>; accountingReady?: boolean });
  console.log('accountingReady .................', v.accountingReady);
  console.log('chartOfAccountsExists ...........', v.validation?.chartOfAccountsExists);
  console.log('accountCount ....................', v.validation?.accountCount);
  console.log('mandatoryControlAccounts ........', v.validation?.mandatoryControlAccounts);
  console.log('missingControlAccounts ..........', JSON.stringify(v.validation?.missingControlAccounts));
  console.log('accountsRequiringClassification .', v.validation?.accountsRequiringClassification);
  console.log('  names .........................', JSON.stringify(v.validation?.accountsRequiringClassificationNames));
}

main().catch((e) => { console.error(e); process.exit(1); });
