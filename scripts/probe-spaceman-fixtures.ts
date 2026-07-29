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
const companyId = process.env.EAM_CERT_COMPANY_ID!;
for (const table of ['customers', 'vendors', 'products', 'tax_rates', 'bank_accounts'] as const) {
  const { data, count } = await sb.from(table).select('*', { count: 'exact' }).eq('company_id', companyId).limit(3);
  console.log(table, count, data?.map((r) => ({ id: r.id, name: r.name ?? r.invoice_number ?? r.bill_number })));
}
const { data: accounts } = await sb.from('chart_of_accounts').select('id,name,type,tax_treatment,account_code').eq('company_id', companyId).eq('is_active', true);
console.log('accounts sample', accounts?.slice(0, 20));
