import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, eq).trim()] = v;
  }
}

loadEnv();
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
const { data: memberships } = await sb.from('company_users').select('company_id').eq('user_id', (await sb.auth.getUser()).data.user!.id);
for (const m of memberships ?? []) {
  const { data: company } = await sb.from('companies').select('name').eq('id', m.company_id).single();
  const { data: years } = await sb.from('financial_years').select('id, year_code, start_date, end_date, status').eq('company_id', m.company_id);
  console.log(JSON.stringify({ companyId: m.company_id, companyName: company?.name, years }, null, 2));
}
